using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Resenha.Api.Auth;

namespace Resenha.Api.Tests;

/// <summary>Sobe a API de verdade em memória, com banco e pasta de imagens temporários por fábrica.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public string DataRoot { get; } = Path.Combine(Path.GetTempPath(), "resenha-tests", Guid.NewGuid().ToString("N"));

    /// <summary>Tentativas de login/cadastro por minuto. Alto por padrão para não atrapalhar os outros testes.</summary>
    public int AuthPerMinute { get; init; } = 10_000;

    /// <summary>Pedidos de amizade por minuto, por usuario. Alto por padrao pelo mesmo motivo.</summary>
    public int FriendRequestsPerMinute { get; init; } = 10_000;

    /// <summary>Mensagens de chat por minuto, por usuario. Alto por padrao pelo mesmo motivo.</summary>
    public int MessagesPerMinute { get; init; } = 10_000;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Storage:Root", DataRoot);
        builder.UseSetting("Jwt:SigningKey", "chave-de-teste-com-mais-de-32-caracteres-123456");
        builder.UseSetting("LiveKit:Url", TestLiveKit.Url);
        builder.UseSetting("LiveKit:ApiKey", TestLiveKit.ApiKey);
        builder.UseSetting("LiveKit:ApiSecret", TestLiveKit.ApiSecret);
        builder.UseSetting("RateLimit:AuthPerMinute", AuthPerMinute.ToString());
        builder.UseSetting("RateLimit:FriendRequestsPerMinute", FriendRequestsPerMinute.ToString());
        builder.UseSetting("RateLimit:MessagesPerMinute", MessagesPerMinute.ToString());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); // libera o arquivo .db para poder apagar
        try { Directory.Delete(DataRoot, recursive: true); } catch (IOException) { }
    }

    private static int _counter;

    /// <summary>Cria uma conta nova com @ único e devolve um cliente já logado nela.</summary>
    public async Task<(HttpClient Client, AuthResponse Auth)> CreateLoggedUserAsync(string password = "Senha!1")
    {
        var username = $"user{Interlocked.Increment(ref _counter)}_{Guid.NewGuid().ToString("N")[..6]}";
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/auth/register", new RegisterRequest(username, "Pessoa Teste", password));
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return (client, auth);
    }
}

/// <summary>Valores fixos do LiveKit nos testes (não dependem do infra/.env).</summary>
public static class TestLiveKit
{
    public const string Url = "ws://livekit.teste:7880";
    public const string ApiKey = "APIteste123";
    public const string ApiSecret = "segredo-de-teste-do-livekit-com-mais-de-32-caracteres";
}
