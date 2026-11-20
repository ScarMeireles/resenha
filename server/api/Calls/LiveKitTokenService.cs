using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Resenha.Api.Calls;

/// <summary>Gera o token que o app usa para entrar numa sala do LiveKit (JWT HS256 assinado com o segredo da API do LiveKit).</summary>
public class LiveKitTokenService(IOptions<LiveKitOptions> options, TimeProvider clock)
{
    private readonly LiveKitOptions _options = options.Value;

    public string Url => _options.Url;

    public string Create(Guid userId, string displayName, string room)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.ApiKey,
            NotBefore = now,
            Expires = now.AddMinutes(_options.TokenMinutes),
            SigningCredentials = new SigningCredentials(CreateKey(_options.ApiSecret), SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = userId.ToString(), // identity no LiveKit
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString(),
                ["name"] = displayName,
                // Microfone, câmera e compartilhamento de tela (vídeo e áudio da tela) liberados.
                ["video"] = new Dictionary<string, object>
                {
                    ["room"] = room,
                    ["roomJoin"] = true,
                    ["canPublish"] = true,
                    ["canSubscribe"] = true,
                    ["canPublishData"] = false,
                    ["canPublishSources"] = new[] { "microphone", "camera", "screen_share", "screen_share_audio" },
                },
            },
        });
    }

    public static SymmetricSecurityKey CreateKey(string secret) => new(Encoding.UTF8.GetBytes(secret));
}
