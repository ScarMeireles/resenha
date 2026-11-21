using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Media;
using Resenha.Api.Realtime;

namespace Resenha.Api.Accounts;

public record UpdateMeRequest(string? DisplayName);
public record ChangeUsernameRequest(string? Username);

public static class AccountEndpoints
{
    // Arquivo de até 10 MB + folga para o "envelope" do multipart.
    private const long MaxRequestBytes = ImageProcessor.MaxUploadBytes + 64 * 1024;

    public static void MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/me").WithTags("Conta").RequireAuthorization();

        me.MapGet("/", GetMe);
        me.MapPatch("/", UpdateMe);
        me.MapPut("/username", ChangeUsername);
        MapImage(me, "/avatar", MediaKind.Avatar);
        MapImage(me, "/banner", MediaKind.Banner);

        app.MapGet("/users/{username}", GetUser).WithTags("Conta").RequireAuthorization();
    }

    private static void MapImage(RouteGroupBuilder me, string route, MediaKind kind)
    {
        me.MapPut(route, (IFormFile file, HttpContext http, AppDbContext db, ImageProcessor images, MediaStorage storage, UserNotifier notifier, CancellationToken ct) =>
                UploadImage(kind, file, http, db, images, storage, notifier, ct))
            .DisableAntiforgery() // a API usa token no cabeçalho, não cookie: não há risco de CSRF
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes));

        me.MapDelete(route, (HttpContext http, AppDbContext db, MediaStorage storage, UserNotifier notifier) =>
            DeleteImage(kind, http, db, storage, notifier));
    }

    private static async Task<IResult> GetMe(HttpContext http, AppDbContext db)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        return user is null ? Results.Unauthorized() : Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> UpdateMe(UpdateMeRequest request, HttpContext http, AppDbContext db, UserNotifier notifier)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        if (request.DisplayName is not null)
        {
            var displayName = request.DisplayName.Trim();
            if (AccountRules.ValidateDisplayName(displayName) is { } error)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["displayName"] = [error] });
            user.DisplayName = displayName;
        }

        var changed = db.ChangeTracker.HasChanges();
        await db.SaveChangesAsync();
        if (changed) await notifier.Updated(user);
        return Results.Ok(UserDto.From(user));
    }

    /// <summary>
    /// Troca o próprio @ (livre, sem limite; o antigo fica disponível na hora). Amigos, grupos e mensagens
    /// apontam para o Id, então nada quebra. Devolve um token novo com o @ atualizado; o antigo continua
    /// valendo, porque a sessão é identificada pelo Id e pelo carimbo de segurança, que não mudam.
    /// </summary>
    private static async Task<IResult> ChangeUsername(ChangeUsernameRequest request, HttpContext http, AppDbContext db, TokenService tokens, UserNotifier notifier)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        var username = AccountRules.NormalizeUsername(request.Username);
        if (username != user.Username)
        {
            var check = await AuthEndpoints.CheckUsername(username, db);
            if (check.Error is { } error)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["username"] = [error] });
            if (!check.Available) return AuthEndpoints.UsernameTaken();

            user.Username = username;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Outra pessoa pegou o mesmo @ ao mesmo tempo: o índice único segurou.
                if (await db.Users.AsNoTracking().AnyAsync(u => u.Username == username && u.Id != user.Id))
                    return AuthEndpoints.UsernameTaken();
                throw;
            }
            await notifier.Updated(user);
        }

        var (token, expiresAt) = tokens.Create(user);
        return Results.Ok(new AuthResponse(token, expiresAt, UserDto.From(user)));
    }

    private static async Task<IResult> GetUser(string username, AppDbContext db)
    {
        var normalized = AccountRules.NormalizeUsername(username);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == normalized);
        return user is null
            ? Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Usuário não encontrado.")
            : Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> UploadImage(
        MediaKind kind, IFormFile file, HttpContext http, AppDbContext db,
        ImageProcessor images, MediaStorage storage, UserNotifier notifier, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([http.User.GetUserId()], ct);
        if (user is null) return Results.Unauthorized();

        if (file.Length > ImageProcessor.MaxUploadBytes)
            return Results.Problem(statusCode: StatusCodes.Status413PayloadTooLarge, title: "A imagem pode ter no máximo 10 MB.");

        byte[] webp;
        try
        {
            using var buffer = new MemoryStream((int)file.Length);
            await file.CopyToAsync(buffer, ct);
            buffer.Position = 0;
            webp = await images.ToWebpAsync(buffer, kind, ct);
        }
        catch (InvalidImageException ex)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: ex.Message);
        }

        var newFile = await storage.SaveAsync(kind, webp, ct);
        var oldFile = kind == MediaKind.Avatar ? user.AvatarFile : user.BannerFile;
        if (kind == MediaKind.Avatar) user.AvatarFile = newFile; else user.BannerFile = newFile;

        await db.SaveChangesAsync(ct);
        storage.Delete(kind, oldFile); // só apaga a antiga depois que o banco já aponta para a nova
        await notifier.Updated(user);
        return Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> DeleteImage(MediaKind kind, HttpContext http, AppDbContext db, MediaStorage storage, UserNotifier notifier)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        var oldFile = kind == MediaKind.Avatar ? user.AvatarFile : user.BannerFile;
        if (kind == MediaKind.Avatar) user.AvatarFile = null; else user.BannerFile = null;

        if (oldFile is null) return Results.Ok(UserDto.From(user)); // já não tinha imagem: nada muda

        await db.SaveChangesAsync();
        storage.Delete(kind, oldFile);
        await notifier.Updated(user);
        return Results.Ok(UserDto.From(user));
    }
}
