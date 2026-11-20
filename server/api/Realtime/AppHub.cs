using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Canal de tempo real do app (/hubs/app). Por ora só avisa presença; o cliente não chama métodos.</summary>
[Authorize]
public class AppHub(PresenceTracker presence, FriendNotifier notifier, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.GetUserId();
        if (presence.Connected(userId, Context.ConnectionId))
            await NotifyFriends(userId, PresenceTracker.Online);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User!.GetUserId();
        if (presence.Disconnected(userId, Context.ConnectionId))
            await NotifyFriends(userId, PresenceTracker.Offline);
        await base.OnDisconnectedAsync(exception);
    }

    private async Task NotifyFriends(Guid userId, string status)
    {
        var friendIds = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        if (friendIds.Count > 0)
            await notifier.Presence(friendIds, userId, status);
    }
}
