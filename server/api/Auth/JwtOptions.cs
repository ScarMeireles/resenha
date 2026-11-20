using System.ComponentModel.DataAnnotations;

namespace Resenha.Api.Auth;

public class JwtOptions
{
    public const string Section = "Jwt";

    /// <summary>Segredo de assinatura dos tokens. Fica fora do Git (appsettings.Development.json / variável de ambiente).</summary>
    [Required, MinLength(32, ErrorMessage = "Jwt:SigningKey precisa ter pelo menos 32 caracteres. Rode server/api/new-dev-settings.ps1.")]
    public string SigningKey { get; set; } = "";

    public string Issuer { get; set; } = "resenha-api";
    public string Audience { get; set; } = "resenha-app";

    /// <summary>Validade do token. O app renova em POST /auth/refresh, então quem usa sempre não precisa logar de novo.</summary>
    [Range(1, 365)]
    public int LifetimeDays { get; set; } = 30;
}
