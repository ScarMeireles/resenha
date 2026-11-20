using Microsoft.AspNetCore.SignalR;
using Resenha.Api.Accounts;

namespace Resenha.Api.Realtime;

/// <summary>Eventos de tempo real das ligações 1:1 e seus nomes (o app escuta por estes nomes).</summary>
public class CallNotifier(IHubContext<AppHub> hub)
{
    public const string CallIncoming = "callIncoming";
    public const string CallAccepted = "callAccepted";
    public const string CallDeclined = "callDeclined";
    public const string CallCancelled = "callCancelled";
    public const string CallEnded = "callEnded";

    private IClientProxy To(Guid userId) => hub.Clients.User(userId.ToString());

    /// <summary>Avisa o amigo que está sendo chamado; <paramref name="from"/> é quem ligou.</summary>
    public Task Incoming(Guid toUserId, string room, UserDto from) =>
        To(toUserId).SendAsync(CallIncoming, new { room, from });

    public Task Accepted(Guid toUserId, string room, Guid userId) => To(toUserId).SendAsync(CallAccepted, new { room, userId });

    public Task Declined(Guid toUserId, string room, Guid userId) => To(toUserId).SendAsync(CallDeclined, new { room, userId });

    public Task Cancelled(Guid toUserId, string room, Guid userId) => To(toUserId).SendAsync(CallCancelled, new { room, userId });

    public Task Ended(Guid toUserId, string room, Guid userId) => To(toUserId).SendAsync(CallEnded, new { room, userId });
}
