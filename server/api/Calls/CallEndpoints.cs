using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Realtime;

namespace Resenha.Api.Calls;

public static class CallEndpoints
{
    public const string CallRateLimitPolicy = "calls";

    public static void MapCallEndpoints(this IEndpointRouteBuilder app)
    {
        var calls = app.MapGroup("/calls/{friendId:guid}").WithTags("Ligações").RequireAuthorization();

        calls.MapPost("/", Ring).RequireRateLimiting(CallRateLimitPolicy);
        calls.MapPost("/accept", Accept);
        calls.MapPost("/decline", Decline);
        calls.MapPost("/cancel", Cancel);
        calls.MapPost("/hangup", Hangup);
    }

    private static async Task<IResult> Ring(
        Guid friendId, HttpContext http, AppDbContext db, PresenceTracker presence,
        CallTracker calls, CallNotifier notifier, LiveKitTokenService tokens)
    {
        var me = http.User.GetUserId();
        var users = await FriendPair(db, me, friendId);
        if (users is null) return NotFriends();
        var (self, friend) = users.Value;

        if (!presence.IsOnline(friendId))
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: $"{friend.DisplayName} está offline");

        // Se o amigo já estava chamando a gente (ligações cruzadas), NÃO tratamos como "atender": a chamada dele
        // é sobrescrita pela nossa, e ele recebe o callIncoming normalmente. Decisão de produto fica para depois.
        var call = new Call(me, friendId, CallState.Ringing);
        calls.Set(call);

        await notifier.Incoming(friendId, call.Room, UserDto.From(self));
        return Results.Ok(Join(tokens, me, self.DisplayName, call.Room));
    }

    private static async Task<IResult> Accept(
        Guid friendId, HttpContext http, AppDbContext db, CallTracker calls, CallNotifier notifier, LiveKitTokenService tokens)
    {
        var me = http.User.GetUserId();
        var users = await FriendPair(db, me, friendId);
        if (users is null) return NotFriends();

        var call = calls.Get(me, friendId);
        if (call is not { State: CallState.Ringing } || call.CallerId != friendId)
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Ninguém está te ligando.");

        calls.Activate(me, friendId);
        await notifier.Accepted(friendId, call.Room, me);
        return Results.Ok(Join(tokens, me, users.Value.Self.DisplayName, call.Room));
    }

    /// <summary>Quem foi chamado recusa. Sem ligação tocando de verdade, não faz nada (204 mesmo assim).</summary>
    private static async Task<IResult> Decline(
        Guid friendId, HttpContext http, AppDbContext db, CallTracker calls, CallNotifier notifier)
    {
        var me = http.User.GetUserId();
        if (await FriendPair(db, me, friendId) is null) return NotFriends();

        if (calls.Get(me, friendId) is { State: CallState.Ringing } call && call.CallerId == friendId)
        {
            calls.Remove(me, friendId);
            await notifier.Declined(friendId, call.Room, me);
        }
        return Results.NoContent();
    }

    /// <summary>Quem ligou desistiu (ou os 30 s do app acabaram). Sem ligação tocando de verdade, não faz nada (204).</summary>
    private static async Task<IResult> Cancel(
        Guid friendId, HttpContext http, AppDbContext db, CallTracker calls, CallNotifier notifier)
    {
        var me = http.User.GetUserId();
        if (await FriendPair(db, me, friendId) is null) return NotFriends();

        if (calls.Get(me, friendId) is { State: CallState.Ringing } call && call.CallerId == me)
        {
            calls.Remove(me, friendId);
            await notifier.Cancelled(friendId, call.Room, me);
        }
        return Results.NoContent();
    }

    /// <summary>Qualquer dos dois encerra. Sempre avisa o outro (a ligação pode já ter saído do rastreador).</summary>
    private static async Task<IResult> Hangup(
        Guid friendId, HttpContext http, AppDbContext db, CallTracker calls, CallNotifier notifier)
    {
        var me = http.User.GetUserId();
        if (await FriendPair(db, me, friendId) is null) return NotFriends();

        calls.Remove(me, friendId);
        await notifier.Ended(friendId, RoomNames.Direct(me, friendId), me);
        return Results.NoContent();
    }

    private static JoinRoomResponse Join(LiveKitTokenService tokens, Guid userId, string displayName, string room) =>
        new(tokens.Url, tokens.Create(userId, displayName, room), room);

    /// <summary>Devolve (eu, amigo) se a amizade está aceita; senão null.</summary>
    private static async Task<(User Self, User Friend)?> FriendPair(AppDbContext db, Guid me, Guid friendId)
    {
        var friendship = await db.Friendships.Include(f => f.Requester).Include(f => f.Addressee)
            .FirstOrDefaultAsync(f => f.Status == FriendshipStatus.Accepted
                && ((f.RequesterId == me && f.AddresseeId == friendId) || (f.RequesterId == friendId && f.AddresseeId == me)));
        if (friendship is null) return null;
        return friendship.RequesterId == me ? (friendship.Requester, friendship.Addressee) : (friendship.Addressee, friendship.Requester);
    }

    private static IResult NotFriends() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Vocês não são amigos.");
}
