using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Canal de tempo real do app (/hubs/app). Só o servidor envia eventos; o cliente não chama métodos.</summary>
[Authorize]
public class AppHub(PresenceTracker presence, FriendNotifier notifier, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.GetUserId();

        // Entra nos grupos do SignalR de todos os grupos da pessoa, para receber as mensagens deles.
        var groupIds = await db.GroupMembers.Where(m => m.UserId == userId).Select(m => m.GroupId).ToListAsync();
        foreach (var groupId in groupIds)
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupNotifier.HubGroup(groupId));

        if (presence.Connected(userId, Context.ConnectionId))
            await NotifyPresence(userId, PresenceTracker.Online);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User!.GetUserId();
        if (presence.Disconnected(userId, Context.ConnectionId))
            await NotifyPresence(userId, PresenceTracker.Offline);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>Avisa amigos e quem divide grupo com a pessoa (sem repetir destinatários).</summary>
    private async Task NotifyPresence(Guid userId, string status)
    {
        var friendIds = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        var groupMateIds = await db.GroupMembers
            .Where(m => db.GroupMembers.Any(mine => mine.GroupId == m.GroupId && mine.UserId == userId))
            .Select(m => m.UserId)
            .ToListAsync();

        var recipients = friendIds.Concat(groupMateIds).Where(id => id != userId).Distinct().ToList();
        if (recipients.Count > 0)
            await notifier.Presence(recipients, userId, status);
    }
}
