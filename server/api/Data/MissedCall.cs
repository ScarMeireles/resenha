namespace Resenha.Api.Data;

/// <summary>
/// Ligação que não pôde tocar porque a pessoa estava desconectada de verdade (app fechado).
/// Ela vê o aviso quando entrar e a linha é apagada quando ela fecha o aviso.
/// </summary>
public class MissedCall
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CallerId { get; set; }
    public User Caller { get; set; } = null!;

    public Guid CalleeId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
