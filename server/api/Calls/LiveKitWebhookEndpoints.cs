using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Resenha.Api.Realtime;

namespace Resenha.Api.Calls;

public static class LiveKitWebhookEndpoints
{
    public static void MapLiveKitWebhook(this IEndpointRouteBuilder app) =>
        app.MapPost("/livekit/webhook", Receive).AllowAnonymous().WithTags("Voz");

    private static async Task<IResult> Receive(
        HttpRequest request, IOptions<LiveKitOptions> options, VoiceTracker voice, CallTracker calls,
        PresenceTracker presence, PresenceNotifier presenceNotifier, GroupNotifier groupNotifier)
    {
        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer);
        var body = buffer.ToArray();

        if (!await IsAuthentic(request.Headers.Authorization.ToString(), body, options.Value))
            return Results.Unauthorized();

        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        var eventName = root.TryGetProperty("event", out var ev) ? ev.GetString() : null;
        var room = root.TryGetProperty("room", out var r) && r.TryGetProperty("name", out var rn) ? rn.GetString() : null;
        if (room is null) return Results.Ok();

        switch (eventName)
        {
            case "participant_joined" when Identity(root) is { } userId:
                if (voice.Joined(room, userId, out var previousRoom))
                {
                    if (previousRoom is not null) await RoomChanged(previousRoom, voice, groupNotifier);
                    await RoomChanged(room, voice, groupNotifier);
                    // Só avisa a presença se a pessoa acabou de entrar em chamada (trocar de sala não muda o status).
                    if (previousRoom is null)
                        await presenceNotifier.Notify(userId, presence.PresenceOf(userId));
                }
                break;

            case "participant_left" when Identity(root) is { } userId:
                await Left(room, userId, voice, calls, presence, presenceNotifier, groupNotifier);
                break;

            case "room_finished":
                foreach (var userId in voice.ParticipantsOf(room))
                    await Left(room, userId, voice, calls, presence, presenceNotifier, groupNotifier);
                if (RoomNames.TryParse(room, out var kind, out _) && kind == RoomKind.Direct)
                    calls.Remove(room);
                break;
        }
        return Results.Ok();
    }

    private static async Task Left(
        string room, Guid userId, VoiceTracker voice, CallTracker calls, PresenceTracker presence,
        PresenceNotifier presenceNotifier, GroupNotifier groupNotifier)
    {
        if (!voice.Left(room, userId)) return;

        await RoomChanged(room, voice, groupNotifier);
        await presenceNotifier.Notify(userId, presence.PresenceOf(userId));

        // Ligação 1:1 sem ninguém na sala acabou.
        if (RoomNames.TryParse(room, out var kind, out _) && kind == RoomKind.Direct && voice.ParticipantsOf(room).Length == 0)
            calls.Remove(room);
    }

    /// <summary>Se a sala é de grupo, manda a lista atual de quem está falando para os membros.</summary>
    private static async Task RoomChanged(string room, VoiceTracker voice, GroupNotifier groupNotifier)
    {
        if (RoomNames.TryParse(room, out var kind, out var ids) && kind == RoomKind.Group)
            await groupNotifier.VoiceChanged(ids[0], voice.ParticipantsOf(room));
    }

    private static Guid? Identity(JsonElement root) =>
        root.TryGetProperty("participant", out var p) && p.TryGetProperty("identity", out var i)
        && Guid.TryParse(i.GetString(), out var id) ? id : null;

    /// <summary>
    /// O LiveKit assina o webhook: o cabeçalho Authorization é um JWT HS256 (chave da API como emissor) com o claim
    /// "sha256" = base64 do SHA-256 do corpo. Sem isso qualquer um poderia forjar quem está em qual sala.
    /// </summary>
    private static async Task<bool> IsAuthentic(string header, byte[] body, LiveKitOptions options)
    {
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header["Bearer ".Length..] : header;
        if (string.IsNullOrWhiteSpace(token)) return false;

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = options.ApiKey,
            ValidateAudience = false,
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            IssuerSigningKey = LiveKitTokenService.CreateKey(options.ApiSecret),
            ClockSkew = TimeSpan.FromMinutes(1),
        });
        if (!result.IsValid) return false;

        var claimed = result.ClaimsIdentity.FindFirst("sha256")?.Value;
        var actual = Convert.ToBase64String(SHA256.HashData(body));
        return claimed is not null
               && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(claimed), Encoding.UTF8.GetBytes(actual));
    }
}
