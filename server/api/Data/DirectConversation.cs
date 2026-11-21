namespace Resenha.Api.Data;

/// <summary>
/// Conversa direta (DM) entre duas pessoas. Uma linha por par: UserAId é sempre o menor Id e UserBId o maior,
/// e o índice único garante que o mesmo par não tenha duas conversas. As mensagens ficam na tabela Messages.
/// </summary>
public class DirectConversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserAId { get; set; }
    public User UserA { get; set; } = null!;
    public Guid UserBId { get; set; }
    public User UserB { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Põe o par na ordem guardada no banco (menor Id primeiro).</summary>
    public static (Guid A, Guid B) Pair(Guid x, Guid y) => x.CompareTo(y) < 0 ? (x, y) : (y, x);

    public Guid OtherThan(Guid me) => me == UserAId ? UserBId : UserAId;

    public User OtherUser(Guid me) => me == UserAId ? UserB : UserA;
}
