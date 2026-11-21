using Microsoft.EntityFrameworkCore;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>Quem "conhece" a pessoa: amigos e quem divide grupo com ela (sem ela mesma e sem repetir).</summary>
public static class Contacts
{
    public static async Task<List<Guid>> FriendsAndGroupMatesOf(AppDbContext db, Guid userId)
    {
        var friendIds = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        var groupMateIds = await db.GroupMembers
            .Where(m => db.GroupMembers.Any(mine => mine.GroupId == m.GroupId && mine.UserId == userId))
            .Select(m => m.UserId)
            .ToListAsync();

        return friendIds.Concat(groupMateIds).Where(id => id != userId).Distinct().ToList();
    }
}
