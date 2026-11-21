using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>
/// Evento "userUpdated": a pessoa mudou nome, foto, banner ou @. Vai para os amigos, quem divide grupo,
/// quem tem conversa direta com ela e as outras janelas dela mesma. O conteúdo é o UserDto público
/// (nada de senha, carimbo ou IP); quem não conhece a pessoa não recebe nada.
/// </summary>
public class UserNotifier(AppDbContext db, IHubContext<AppHub> hub)
{
    public const string UserUpdated = "userUpdated";

    public async Task Updated(User user)
    {
        var contacts = await Contacts.FriendsAndGroupMatesOf(db, user.Id);
        var dmPartners = await db.DirectConversations
            .Where(c => c.UserAId == user.Id || c.UserBId == user.Id)
            .Select(c => c.UserAId == user.Id ? c.UserBId : c.UserAId)
            .ToListAsync();

        var recipients = contacts.Concat(dmPartners).Append(user.Id).Distinct().Select(id => id.ToString()).ToList();
        await hub.Clients.Users(recipients).SendAsync(UserUpdated, UserDto.From(user));
    }
}
