namespace Resenha.Api.Data;

public class Group
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public Guid OwnerId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<GroupMember> Members { get; set; } = [];
}

public class GroupMember
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTimeOffset JoinedAt { get; set; }
}

/// <summary>
/// Mensagem de chat. Fica num grupo OU numa conversa direta (DM): exatamente um dos dois é preenchido
/// (o banco confere com uma restrição). Assim grupos e DMs usam a mesma tabela, as mesmas imagens e o mesmo "apagar".
/// </summary>
public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? GroupId { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public string Text { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Quando o autor apagou; a linha fica para a conversa mostrar "mensagem apagada".</summary>
    public DateTimeOffset? DeletedAt { get; set; }
    public List<MessageImage> Images { get; set; } = [];
}

public class MessageImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MessageId { get; set; }
    public string File { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public int Order { get; set; }
}
