using Microsoft.EntityFrameworkCore;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Avisa amigos e quem divide grupo com a pessoa que a presença dela mudou (sem repetir destinatários).</summary>
public class PresenceNotifier(AppDbContext db, FriendNotifier notifier)
{
    public async Task Notify(Guid userId, string status)
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
