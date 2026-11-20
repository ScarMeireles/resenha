using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.DependencyInjection;
using Resenha.Api.Calls;
using Resenha.Api.Realtime;

namespace Resenha.Api.Tests;

/// <summary>Atalhos dos testes de voz: webhook assinado igual ao LiveKit e conexões SignalR.</summary>
public static class LiveKitTestHelpers
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    /// <summary>Gera o cabeçalho Authorization do webhook: JWT HS256 com o claim sha256 do corpo.</summary>
    public static string SignWebhook(string body, string apiKey = TestLiveKit.ApiKey, string secret = TestLiveKit.ApiSecret)
    {
        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = apiKey,
            NotBefore = now,
            Expires = now.AddMinutes(5),
            SigningCredentials = new SigningCredentials(LiveKitTokenService.CreateKey(secret), SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                ["sha256"] = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(body))),
            },
        });
    }

    public static string WebhookBody(string eventName, string room, Guid? identity = null) =>
        JsonSerializer.Serialize(new
        {
            @event = eventName,
            room = new { name = room },
            participant = identity is null ? null : new { identity = identity.ToString(), name = "Fulano" },
            id = Guid.NewGuid().ToString(),
            createdAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        });

    public static Task<HttpResponseMessage> PostWebhook(HttpClient client, string body, string? authorization = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/livekit/webhook")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/webhook+json"),
        };
        request.Headers.TryAddWithoutValidation("Authorization", authorization ?? SignWebhook(body));
        return client.SendAsync(request);
    }

    /// <summary>Simula o LiveKit avisando que a pessoa entrou/saiu da sala.</summary>
    public static async Task Webhook(ApiFactory factory, string eventName, string room, Guid? identity = null)
    {
        var response = await PostWebhook(factory.CreateClient(), WebhookBody(eventName, room, identity));
        response.EnsureSuccessStatusCode();
    }

    public static HubConnection Connect(ApiFactory factory, string token, List<HubConnection> sink)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "/hubs/app"), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();
        sink.Add(connection);
        return connection;
    }

    /// <summary>
    /// Conecta e espera o servidor terminar de registrar a conexão. O StartAsync pode voltar antes de o servidor
    /// entrar nos grupos do SignalR, e o PresenceTracker só marca online depois disso.
    /// </summary>
    public static async Task StartAndWait(ApiFactory factory, HubConnection connection, Guid userId)
    {
        await connection.StartAsync();
        var presence = factory.Services.GetRequiredService<PresenceTracker>();
        var deadline = DateTime.UtcNow + Timeout;
        while (!presence.IsOnline(userId))
        {
            if (DateTime.UtcNow > deadline) throw new TimeoutException("O servidor não registrou a conexão.");
            await Task.Delay(10);
        }
    }


    /// <summary>Registra o ouvinte ANTES de agir, para não perder o evento.</summary>
    public static Task<T> Expect<T>(HubConnection connection, string eventName, Func<T, bool>? filter = null)
    {
        var source = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<T>(eventName, value =>
        {
            if (filter is null || filter(value)) source.TrySetResult(value);
        });
        return source.Task.WaitAsync(Timeout);
    }
}
