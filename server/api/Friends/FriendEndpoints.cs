using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Realtime;

namespace Resenha.Api.Friends;

public record FriendDto(UserDto User, string Presence, DateTimeOffset Since);
/// <summary>Pedido de amizade; User é sempre a OUTRA pessoa.</summary>
public record FriendRequestDto(Guid Id, UserDto User, DateTimeOffset CreatedAt);
public record FriendsResponse(FriendDto[] Friends, FriendRequestDto[] Incoming, FriendRequestDto[] Outgoing);
public record SendFriendRequest(string? Username);

public static class FriendEndpoints
{
    public const string RequestRateLimitPolicy = "friend-requests";

    public static void MapFriendEndpoints(this IEndpointRouteBuilder app)
    {
        var friends = app.MapGroup("/friends").WithTags("Amigos").RequireAuthorization();

        friends.MapGet("/", List);
        friends.MapPost("/requests", SendRequest).RequireRateLimiting(RequestRateLimitPolicy);
        friends.MapPost("/requests/{id:guid}/accept", Accept);
        friends.MapDelete("/requests/{id:guid}", RemoveRequest);
        friends.MapDelete("/{userId:guid}", Unfriend);
    }

    private static async Task<IResult> List(HttpContext http, AppDbContext db, PresenceTracker presence)
    {
        var me = http.User.GetUserId();
        var rows = await db.Friendships
            .Include(f => f.Requester).Include(f => f.Addressee)
            .Where(f => f.RequesterId == me || f.AddresseeId == me)
            .ToListAsync();

        var friends = rows.Where(f => f.Status == FriendshipStatus.Accepted)
            .Select(f => ToFriendDto(f, me, presence))
            .OrderByDescending(f => f.Presence != PresenceTracker.Offline)
            .ThenBy(f => f.User.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
        var incoming = rows.Where(f => f.Status == FriendshipStatus.Pending && f.AddresseeId == me)
            .OrderByDescending(f => f.CreatedAt).Select(f => ToRequestDto(f, me)).ToArray();
        var outgoing = rows.Where(f => f.Status == FriendshipStatus.Pending && f.RequesterId == me)
            .OrderByDescending(f => f.CreatedAt).Select(f => ToRequestDto(f, me)).ToArray();

        return Results.Ok(new FriendsResponse(friends, incoming, outgoing));
    }

    private static async Task<IResult> SendRequest(
        SendFriendRequest request, HttpContext http, AppDbContext db, TimeProvider clock, FriendNotifier notifier)
    {
        var me = http.User.GetUserId();
        var username = AccountRules.NormalizeUsername(request.Username);
        var target = AccountRules.ValidateUsername(username) is null
            ? await db.Users.FirstOrDefaultAsync(u => u.Username == username)
            : null;
        if (target is null)
            return Problem(StatusCodes.Status404NotFound, "Ninguém com esse @.");
        if (target.Id == me)
            return Problem(StatusCodes.Status400BadRequest, "Você não pode adicionar a si mesmo.");

        var existing = await FindBetween(db, me, target.Id);
        if (existing is not null)
            return Conflict(existing, me);

        var friendship = new Friendship { RequesterId = me, AddresseeId = target.Id, CreatedAt = clock.GetUtcNow() };
        db.Friendships.Add(friendship);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Pedido repetido ao mesmo tempo: o índice único segurou.
            db.Entry(friendship).State = EntityState.Detached;
            var again = await FindBetween(db, me, target.Id);
            if (again is not null) return Conflict(again, me);
            throw;
        }

        friendship.Requester = (await db.Users.FindAsync(me))!;
        friendship.Addressee = target;
        await notifier.RequestReceived(target.Id, ToRequestDto(friendship, target.Id));
        return Results.Created($"/friends/requests/{friendship.Id}", ToRequestDto(friendship, me));
    }

    private static async Task<IResult> Accept(
        Guid id, HttpContext http, AppDbContext db, TimeProvider clock, PresenceTracker presence, FriendNotifier notifier)
    {
        var me = http.User.GetUserId();
        var friendship = await db.Friendships.Include(f => f.Requester).Include(f => f.Addressee)
            .FirstOrDefaultAsync(f => f.Id == id && f.AddresseeId == me && f.Status == FriendshipStatus.Pending);
        if (friendship is null) return RequestNotFound();

        friendship.Status = FriendshipStatus.Accepted;
        friendship.AcceptedAt = clock.GetUtcNow();
        await db.SaveChangesAsync();

        await notifier.FriendAddedFor(friendship.RequesterId, ToFriendDto(friendship, friendship.RequesterId, presence));
        var forMe = ToFriendDto(friendship, me, presence);
        await notifier.FriendAddedFor(me, forMe);
        return Results.Ok(forMe);
    }

    private static async Task<IResult> RemoveRequest(Guid id, HttpContext http, AppDbContext db, FriendNotifier notifier)
    {
        var me = http.User.GetUserId();
        var friendship = await db.Friendships.FirstOrDefaultAsync(f =>
            f.Id == id && f.Status == FriendshipStatus.Pending && (f.AddresseeId == me || f.RequesterId == me));
        if (friendship is null) return RequestNotFound();

        db.Friendships.Remove(friendship);
        await db.SaveChangesAsync();

        var other = friendship.RequesterId == me ? friendship.AddresseeId : friendship.RequesterId;
        await notifier.RequestRemoved(other, friendship.Id);
        return Results.NoContent();
    }

    private static async Task<IResult> Unfriend(Guid userId, HttpContext http, AppDbContext db, FriendNotifier notifier)
    {
        var me = http.User.GetUserId();
        var friendship = await FindBetween(db, me, userId);
        if (friendship is null || friendship.Status != FriendshipStatus.Accepted)
            return Problem(StatusCodes.Status404NotFound, "Vocês não são amigos.");

        db.Friendships.Remove(friendship);
        await db.SaveChangesAsync();

        await notifier.FriendRemovedFor(userId, me);
        return Results.NoContent();
    }

    private static Task<Friendship?> FindBetween(AppDbContext db, Guid a, Guid b) =>
        db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == a && f.AddresseeId == b) || (f.RequesterId == b && f.AddresseeId == a));

    private static IResult Conflict(Friendship existing, Guid me)
    {
        if (existing.Status == FriendshipStatus.Accepted)
            return Problem(StatusCodes.Status409Conflict, "Vocês já são amigos.");
        return existing.RequesterId == me
            ? Problem(StatusCodes.Status409Conflict, "Pedido já enviado.")
            : Problem(StatusCodes.Status409Conflict, "Essa pessoa já te mandou um pedido. Aceite em Pendentes.");
    }

    private static IResult RequestNotFound() => Problem(StatusCodes.Status404NotFound, "Pedido não encontrado.");

    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);

    private static User Other(Friendship f, Guid me) => f.RequesterId == me ? f.Addressee : f.Requester;

    private static FriendDto ToFriendDto(Friendship f, Guid me, PresenceTracker presence)
    {
        var other = Other(f, me);
        return new FriendDto(UserDto.From(other), presence.PresenceOf(other.Id), f.AcceptedAt ?? f.CreatedAt);
    }

    private static FriendRequestDto ToRequestDto(Friendship f, Guid me) =>
        new(f.Id, UserDto.From(Other(f, me)), f.CreatedAt);

    /// <summary>Partição do limite de pedidos: por usuário logado, ou IP se não houver.</summary>
    public static string RateLimitKey(HttpContext http) =>
        http.User.Identity?.IsAuthenticated == true
            ? http.User.GetUserId().ToString()
            : http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido";
}
