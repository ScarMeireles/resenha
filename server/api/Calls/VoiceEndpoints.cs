using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Calls;

/// <summary>O que o app precisa para entrar numa sala do LiveKit: endereço, token e nome da sala.</summary>
public record JoinRoomResponse(string Url, string Token, string Room);

public static class VoiceEndpoints
{
    public static void MapVoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var voice = app.MapGroup("/groups/{groupId:guid}/voice").WithTags("Voz").RequireAuthorization();

        voice.MapPost("/token", CreateToken);
        voice.MapGet("/", Participants);
    }

    private static async Task<IResult> CreateToken(
        Guid groupId, HttpContext http, AppDbContext db, LiveKitTokenService tokens)
    {
        var me = http.User.GetUserId();
        // Quem não é membro recebe o mesmo "não encontrado" de um grupo que não existe.
        if (!await IsMember(db, groupId, me)) return GroupNotFound();

        var displayName = await db.Users.Where(u => u.Id == me).Select(u => u.DisplayName).FirstAsync();
        var room = RoomNames.Group(groupId);
        return Results.Ok(new JoinRoomResponse(tokens.Url, tokens.Create(me, displayName, room), room));
    }

    private static async Task<IResult> Participants(Guid groupId, HttpContext http, AppDbContext db, VoiceTracker voice)
    {
        if (!await IsMember(db, groupId, http.User.GetUserId())) return GroupNotFound();
        return Results.Ok(new { userIds = voice.ParticipantsOf(RoomNames.Group(groupId)) });
    }

    private static Task<bool> IsMember(AppDbContext db, Guid groupId, Guid userId) =>
        db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == userId);

    private static IResult GroupNotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Grupo não encontrado.");
}
