using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Resenha.Api.Calls;

namespace Resenha.Api.Tests;

public class LiveKitTokenTests
{
    private static LiveKitTokenService CreateService() => new(
        Options.Create(new LiveKitOptions { ApiKey = TestLiveKit.ApiKey, ApiSecret = TestLiveKit.ApiSecret, TokenMinutes = 60 }),
        TimeProvider.System);

    [Fact]
    public async Task Token_tem_claims_certas_e_assinatura_valida()
    {
        var userId = Guid.NewGuid();
        var room = RoomNames.Group(Guid.NewGuid());

        var token = CreateService().Create(userId, "Maria", room);

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = TestLiveKit.ApiKey,
            ValidateAudience = false,
            IssuerSigningKey = LiveKitTokenService.CreateKey(TestLiveKit.ApiSecret),
        });
        Assert.True(result.IsValid);

        var jwt = new JsonWebToken(token);
        Assert.Equal("HS256", jwt.Alg);
        Assert.Equal(userId.ToString(), jwt.Subject);
        Assert.Equal("Maria", jwt.GetClaim("name").Value);
        Assert.Equal(TimeSpan.FromMinutes(60), jwt.ValidTo - jwt.ValidFrom);
        Assert.NotEmpty(jwt.Id);
        Assert.Empty(jwt.Audiences);

        // "video" tem de ser um objeto JSON de verdade, não uma string.
        var video = jwt.GetClaim("video");
        Assert.Equal(JsonClaimValueTypes.Json, video.ValueType);
        using var json = JsonDocument.Parse(video.Value);
        var root = json.RootElement;
        Assert.Equal(room, root.GetProperty("room").GetString());
        Assert.True(root.GetProperty("roomJoin").GetBoolean());
        Assert.True(root.GetProperty("canPublish").GetBoolean());
        Assert.True(root.GetProperty("canSubscribe").GetBoolean());
        Assert.False(root.GetProperty("canPublishData").GetBoolean());
        Assert.Equal(["microphone"], root.GetProperty("canPublishSources").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task Token_nao_vale_com_outro_segredo()
    {
        var token = CreateService().Create(Guid.NewGuid(), "Maria", "sala");

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = TestLiveKit.ApiKey,
            ValidateAudience = false,
            IssuerSigningKey = LiveKitTokenService.CreateKey("outro-segredo-qualquer-com-mais-de-32-caracteres"),
        });

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Nomes_de_sala_sao_estaveis_e_podem_ser_lidos_de_volta()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        Assert.Equal(RoomNames.Direct(a, b), RoomNames.Direct(b, a));
        Assert.True(RoomNames.TryParse(RoomNames.Group(a), out var kind, out var ids));
        Assert.Equal(RoomKind.Group, kind);
        Assert.Equal([a], ids);
        Assert.True(RoomNames.TryParse(RoomNames.Direct(a, b), out kind, out ids));
        Assert.Equal(RoomKind.Direct, kind);
        Assert.Equivalent(new[] { a, b }, ids);
        Assert.False(RoomNames.TryParse("qualquer-coisa", out _, out _));
    }

    [Fact]
    public void VoiceTracker_conta_a_pessoa_em_uma_sala_so()
    {
        var voice = new VoiceTracker();
        var user = Guid.NewGuid();

        Assert.True(voice.Joined("a", user));
        Assert.False(voice.Joined("a", user));
        Assert.True(voice.Joined("b", user));

        Assert.Empty(voice.ParticipantsOf("a"));
        Assert.Equal([user], voice.ParticipantsOf("b"));
        Assert.Equal("b", voice.RoomOf(user));
        Assert.False(voice.Left("a", user));
        Assert.True(voice.Left("b", user));
        Assert.False(voice.IsInCall(user));
    }
}
