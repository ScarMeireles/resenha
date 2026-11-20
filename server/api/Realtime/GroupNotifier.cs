using Microsoft.AspNetCore.SignalR;
using Resenha.Api.Groups;

namespace Resenha.Api.Realtime;

/// <summary>
/// Eventos de tempo real de grupos e chat (o app escuta por estes nomes).
/// Cada grupo vira um grupo do SignalR chamado "group:{id}", com as conexões abertas dos membros.
/// </summary>
public class GroupNotifier(IHubContext<AppHub> hub, PresenceTracker presence)
{
    public const string GroupAdded = "groupAdded";
    public const string GroupUpdated = "groupUpdated";
    public const string GroupRemoved = "groupRemoved";
    public const string MessageCreated = "messageCreated";
    public const string MessageDeleted = "messageDeleted";
    public const string VoiceParticipants = "voiceParticipants";

    public static string HubGroup(Guid groupId) => $"group:{groupId}";

    /// <summary>Coloca as conexões abertas da pessoa no grupo e avisa que ela entrou.</summary>
    public async Task Added(Guid userId, GroupDto group)
    {
        foreach (var connectionId in presence.ConnectionsOf(userId))
            await hub.Groups.AddToGroupAsync(connectionId, HubGroup(group.Id));
        await hub.Clients.User(userId.ToString()).SendAsync(GroupAdded, group);
    }

    /// <summary>Avisa todos os membros conectados que o grupo mudou (nome, membros ou dono).</summary>
    public Task Updated(GroupDto group) =>
        hub.Clients.Group(HubGroup(group.Id)).SendAsync(GroupUpdated, group);

    /// <summary>Tira as conexões da pessoa do grupo e avisa que ela saiu, foi removida ou o grupo acabou.</summary>
    public async Task Removed(Guid userId, Guid groupId)
    {
        await hub.Clients.User(userId.ToString()).SendAsync(GroupRemoved, new { groupId });
        foreach (var connectionId in presence.ConnectionsOf(userId))
            await hub.Groups.RemoveFromGroupAsync(connectionId, HubGroup(groupId));
    }

    public Task MessageRemoved(Guid groupId, Guid messageId) =>
        hub.Clients.Group(HubGroup(groupId)).SendAsync(MessageDeleted, new { groupId, messageId });

    public Task Message(MessageDto message) =>
        hub.Clients.Group(HubGroup(message.GroupId)).SendAsync(MessageCreated, message);

    /// <summary>Avisa os membros conectados quem está na sala de voz do grupo agora.</summary>
    public Task VoiceChanged(Guid groupId, IReadOnlyCollection<Guid> userIds) =>
        hub.Clients.Group(HubGroup(groupId)).SendAsync(VoiceParticipants, new { groupId, userIds });
}
