using System.ComponentModel.DataAnnotations;

namespace Resenha.Api.Calls;

public class LiveKitOptions
{
    public const string Section = "LiveKit";

    /// <summary>Endereço do LiveKit que o APP usa para conectar (WebSocket).</summary>
    [Required]
    public string Url { get; set; } = "ws://localhost:7880";

    /// <summary>Chave da API. Vem do infra/.env (LIVEKIT_API_KEY) ou de LiveKit:ApiKey; fica fora do Git.</summary>
    [Required(ErrorMessage = "LiveKit:ApiKey não configurada (ou LIVEKIT_API_KEY). Rode infra/new-env.ps1.")]
    public string ApiKey { get; set; } = "";

    /// <summary>Segredo da API (mesmo valor do LiveKit). Fica fora do Git.</summary>
    [Required, MinLength(32, ErrorMessage = "LiveKit:ApiSecret (ou LIVEKIT_API_SECRET) precisa ter pelo menos 32 caracteres. Rode infra/new-env.ps1.")]
    public string ApiSecret { get; set; } = "";

    /// <summary>Validade do token de entrada na sala, em minutos.</summary>
    [Range(1, 1440)]
    public int TokenMinutes { get; set; } = 360;
}
