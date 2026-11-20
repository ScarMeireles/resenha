using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Resenha.Api.Data;

namespace Resenha.Api.Auth;

public class TokenService(IOptions<JwtOptions> options, TimeProvider clock)
{
    public const string SecurityStampClaim = "sst";

    private readonly JwtOptions _options = options.Value;

    public static SymmetricSecurityKey CreateKey(string signingKey) => new(Encoding.UTF8.GetBytes(signingKey));

    public (string Token, DateTimeOffset ExpiresAt) Create(User user)
    {
        var now = clock.GetUtcNow();
        var expiresAt = now.AddDays(_options.LifetimeDays);

        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(CreateKey(_options.SigningKey), SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
                new Claim(SecurityStampClaim, user.SecurityStamp.ToString()),
            ]),
        });

        return (token, expiresAt);
    }
}

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                   ?? throw new InvalidOperationException("Token sem 'sub'."));
}
