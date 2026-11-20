namespace Resenha.Api.Data;

public enum FriendshipStatus
{
    Pending,
    Accepted,
}

/// <summary>
/// Uma amizade é uma linha só: quem pediu, quem recebeu e o estado.
/// Recusar, cancelar ou desfazer apaga a linha.
/// </summary>
public class Friendship
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RequesterId { get; set; }
    public User Requester { get; set; } = null!;

    public Guid AddresseeId { get; set; }
    public User Addressee { get; set; } = null!;

    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Quando o pedido foi aceito; null enquanto pendente.</summary>
    public DateTimeOffset? AcceptedAt { get; set; }
}
