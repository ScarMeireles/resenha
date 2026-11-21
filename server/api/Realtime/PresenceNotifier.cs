using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Avisa amigos e quem divide grupo com a pessoa que a presença dela mudou (sem repetir destinatários).</summary>
public class PresenceNotifier(AppDbContext db, FriendNotifier notifier)
{
    public async Task Notify(Guid userId, string status)
    {
        var recipients = await Contacts.FriendsAndGroupMatesOf(db, userId);
        if (recipients.Count > 0)
            await notifier.Presence(recipients, userId, status);
    }
}
