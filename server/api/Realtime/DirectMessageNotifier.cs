using Microsoft.AspNetCore.SignalR;
using Resenha.Api.Chat;

namespace Resenha.Api.Realtime;

/// <summary>
/// Eventos de tempo real das conversas diretas (o app escuta por estes nomes).
/// Vão só para as conexões das duas pessoas da conversa (Clients.Users pelo Id), sem grupo do SignalR.
/// </summary>
public class DirectMessageNotifier(IHubContext<AppHub> hub)
{
    public const string MessageCreated = "directMessageCreated";
    public const string MessageDeleted = "directMessageDeleted";

    private IClientProxy To(Guid a, Guid b) => hub.Clients.Users([a.ToString(), b.ToString()]);

    public Task Message(Guid a, Guid b, DirectMessageDto message) =>
        To(a, b).SendAsync(MessageCreated, message);

    public Task MessageRemoved(Guid a, Guid b, Guid conversationId, Guid messageId) =>
        To(a, b).SendAsync(MessageDeleted, new { conversationId, messageId });
}
