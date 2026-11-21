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

    // Trava única para quem entra/sai dos grupos do SignalR. Sem ela, uma conexão que estava abrindo podia ler
    // "ainda é membro" no banco, a remoção não a achava (ainda não registrada) e ela entrava no grupo depois:
    // quem foi removido continuava recebendo as mensagens. Um servidor só e poucos amigos: uma trava basta.
    private readonly SemaphoreSlim _membership = new(1, 1);

    public static string HubGroup(Guid groupId) => $"group:{groupId}";

    /// <summary>
    /// Conexão nova: entra nos grupos atuais da pessoa (loadGroupIds lê do banco) e registra a conexão (register),
    /// tudo dentro da trava. Uma adição ou remoção que gravou no banco antes já aparece na leitura; uma que grava
    /// depois espera a trava, encontra a conexão registrada e a coloca/tira do grupo. Registrar por último mantém
    /// "conectado no PresenceTracker" = "já está nos grupos". Devolve o que register devolveu.
    /// </summary>
    public async Task<T> Connecting<T>(string connectionId, Func<Task<List<Guid>>> loadGroupIds, Func<T> register)
    {
        await _membership.WaitAsync();
        try
        {
            foreach (var groupId in await loadGroupIds())
                await hub.Groups.AddToGroupAsync(connectionId, HubGroup(groupId));
            return register();
        }
        finally
        {
            _membership.Release();
        }
    }

    /// <summary>Coloca as conexões abertas da pessoa no grupo e avisa que ela entrou. Chame depois de gravar no banco.</summary>
    public async Task Added(Guid userId, GroupDto group)
    {
        await _membership.WaitAsync();
        try
        {
            foreach (var connectionId in presence.ConnectionsOf(userId))
                await hub.Groups.AddToGroupAsync(connectionId, HubGroup(group.Id));
        }
        finally
        {
            _membership.Release();
        }
        await hub.Clients.User(userId.ToString()).SendAsync(GroupAdded, group);
    }

    /// <summary>Avisa todos os membros conectados que o grupo mudou (nome, membros ou dono).</summary>
    public Task Updated(GroupDto group) =>
        hub.Clients.Group(HubGroup(group.Id)).SendAsync(GroupUpdated, group);

    /// <summary>
    /// Tira todas as conexões da pessoa do grupo e só então avisa que ela saiu, foi removida ou o grupo acabou:
    /// quando o app recebe groupRemoved (e quando a requisição responde), nenhuma mensagem do grupo chega mais.
    /// Chame depois de gravar no banco.
    /// </summary>
    public async Task Removed(Guid userId, Guid groupId)
    {
        await _membership.WaitAsync();
        try
        {
            foreach (var connectionId in presence.ConnectionsOf(userId))
                await hub.Groups.RemoveFromGroupAsync(connectionId, HubGroup(groupId));
        }
        finally
        {
            _membership.Release();
        }
        await hub.Clients.User(userId.ToString()).SendAsync(GroupRemoved, new { groupId });
    }

    public Task MessageRemoved(Guid groupId, Guid messageId) =>
        hub.Clients.Group(HubGroup(groupId)).SendAsync(MessageDeleted, new { groupId, messageId });

    public Task Message(MessageDto message) =>
        hub.Clients.Group(HubGroup(message.GroupId)).SendAsync(MessageCreated, message);

    /// <summary>Avisa os membros conectados quem está na sala de voz do grupo agora.</summary>
    public Task VoiceChanged(Guid groupId, IReadOnlyCollection<Guid> userIds) =>
        hub.Clients.Group(HubGroup(groupId)).SendAsync(VoiceParticipants, new { groupId, userIds });
}
