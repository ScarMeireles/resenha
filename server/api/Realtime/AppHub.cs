using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Canal de tempo real do app (/hubs/app). Só o servidor envia eventos; o cliente não chama métodos.</summary>
[Authorize]
public class AppHub(PresenceTracker presence, PresenceNotifier presenceNotifier, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.GetUserId();

        // Entra nos grupos do SignalR de todos os grupos da pessoa, para receber as mensagens deles.
        var groupIds = await db.GroupMembers.Where(m => m.UserId == userId).Select(m => m.GroupId).ToListAsync();
        foreach (var groupId in groupIds)
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupNotifier.HubGroup(groupId));

        if (presence.Connected(userId, Context.ConnectionId))
            await presenceNotifier.Notify(userId, PresenceTracker.Online);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User!.GetUserId();
        if (presence.Disconnected(userId, Context.ConnectionId))
            await presenceNotifier.Notify(userId, PresenceTracker.Offline);
        await base.OnDisconnectedAsync(exception);
    }
}
