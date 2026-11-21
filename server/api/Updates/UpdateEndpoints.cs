using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

namespace Resenha.Api.Updates;

public record VersionDto(string? Version);

/// <summary>
/// Atualização obrigatória do app (R13).
/// - /updates/*: latest.yml, instalador e .blockmap, servidos sem login (o app precisa se atualizar antes de entrar).
/// - /version: versão mais nova publicada (null se não houver nenhuma).
/// - Bloqueio: toda requisição precisa dizer a versão do app (cabeçalho X-Resenha-Version, ou ?resenha-version= no
///   SignalR, porque o WebSocket do navegador não manda cabeçalho próprio). Mais velha que a publicada recebe 426.
/// </summary>
public static class UpdateEndpoints
{
    public const string RequestPath = "/updates";
    public const string VersionHeader = "X-Resenha-Version";
    public const string VersionQuery = "resenha-version";

    /// <summary>Caminhos que funcionam mesmo com app desatualizado: o que serve para atualizar e o que não vem do app.</summary>
    private static readonly string[] OpenPaths = [RequestPath, "/version", "/health", "/livekit/webhook", "/media"];

    public static void UseUpdateFiles(this WebApplication app)
    {
        var folder = app.Services.GetRequiredService<UpdatesFolder>();
        var types = new FileExtensionContentTypeProvider();
        types.Mappings.Clear(); // só os tipos que o electron-updater usa; qualquer outro arquivo da pasta não é servido
        types.Mappings[".yml"] = "text/yaml; charset=utf-8";
        types.Mappings[".exe"] = "application/octet-stream";
        types.Mappings[".blockmap"] = "application/octet-stream";

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(folder.Path),
            RequestPath = RequestPath,
            ContentTypeProvider = types,
            // latest.yml muda a cada versão: sempre confere com o servidor. O instalador tem a versão no nome.
            OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl =
                ctx.File.Name.EndsWith(".yml", StringComparison.OrdinalIgnoreCase) ? "no-cache" : "public, max-age=86400",
        });
    }

    public static void MapUpdateEndpoints(this IEndpointRouteBuilder app) =>
        app.MapGet("/version", (PublishedVersion published) => Results.Ok(new VersionDto(published.Current?.ToString())))
            .AllowAnonymous().WithTags("Atualização");

    /// <summary>
    /// Barra app com versão mais velha que a publicada. Vai depois do CORS (o preflight OPTIONS já foi respondido
    /// e o 426 sai com os cabeçalhos de CORS, então o app consegue ler a resposta) e antes do login.
    /// </summary>
    public static void UseRequiredAppVersion(this WebApplication app) => app.Use(async (http, next) =>
    {
        var latest = http.RequestServices.GetRequiredService<PublishedVersion>().Current;
        if (latest is null || IsOpen(http.Request) || !IsOutdated(ClientVersion(http.Request), latest.Value))
        {
            await next(http);
            return;
        }

        await Results.Problem(
            statusCode: StatusCodes.Status426UpgradeRequired,
            title: $"Há uma versão nova do Resenha ({latest}). Feche e abra o app para atualizar; se ele não se " +
                   "atualizar sozinho, peça o instalador novo para quem hospeda o servidor.",
            extensions: new Dictionary<string, object?> { ["latestVersion"] = latest.ToString() })
            .ExecuteAsync(http);
    });

    /// <summary>
    /// Sem versão (app antigo, anterior a este sistema, ou navegador/curl) ou versão inválida conta como desatualizado:
    /// assim o app antigo mostra a mensagem de atualizar em vez de seguir funcionando. Não é proteção contra quem
    /// forja o cabeçalho (o login continua sendo o que protege as contas); é só para todos ficarem na mesma versão.
    /// </summary>
    public static bool IsOutdated(string? clientVersion, AppVersion latest) =>
        !AppVersion.TryParse(clientVersion, out var client) || client < latest;

    private static string? ClientVersion(HttpRequest request)
    {
        var header = request.Headers[VersionHeader].ToString();
        if (!string.IsNullOrEmpty(header)) return header;
        // Só o SignalR pode mandar pela URL (mesma regra do access_token).
        return request.Path.StartsWithSegments("/hubs") ? request.Query[VersionQuery].ToString() : null;
    }

    private static bool IsOpen(HttpRequest request) =>
        HttpMethods.IsOptions(request.Method) || OpenPaths.Any(path => request.Path.StartsWithSegments(path));
}
