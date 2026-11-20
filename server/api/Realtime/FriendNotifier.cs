using Microsoft.AspNetCore.SignalR;
using Resenha.Api.Friends;

namespace Resenha.Api.Realtime;

/// <summary>Centraliza os eventos de tempo real de amizade e seus nomes (o app escuta por estes nomes).</summary>
public class FriendNotifier(IHubContext<AppHub> hub)
{
    public const string FriendRequestReceived = "friendRequestReceived";
    public const string FriendAdded = "friendAdded";
    public const string FriendRequestRemoved = "friendRequestRemoved";
    public const string FriendRemoved = "friendRemoved";
    public const string PresenceChanged = "presenceChanged";

    private IClientProxy To(Guid userId) => hub.Clients.User(userId.ToString());

    public Task RequestReceived(Guid toUserId, FriendRequestDto request) =>
        To(toUserId).SendAsync(FriendRequestReceived, request);

    public Task FriendAddedFor(Guid toUserId, FriendDto friend) =>
        To(toUserId).SendAsync(FriendAdded, friend);

    public Task RequestRemoved(Guid toUserId, Guid requestId) =>
        To(toUserId).SendAsync(FriendRequestRemoved, new { requestId });

    public Task FriendRemovedFor(Guid toUserId, Guid friendId) =>
        To(toUserId).SendAsync(FriendRemoved, new { userId = friendId });

    public Task Presence(IEnumerable<Guid> toUserIds, Guid userId, string presence) =>
        hub.Clients.Users(toUserIds.Select(id => id.ToString()).ToList())
            .SendAsync(PresenceChanged, new { userId, presence });
}
