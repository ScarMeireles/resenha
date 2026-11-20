using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

public record StatusDto(string Status);

/// <summary>
/// Status escolhido pela própria pessoa (Online, Ausente ou Offline/invisível).
/// Fica fora do UserDto de propósito: os outros só veem a presença calculada, e assim ninguém descobre quem está invisível.
/// </summary>
public static class StatusEndpoints
{
    public static void MapStatusEndpoints(this IEndpointRouteBuilder app)
    {
        var status = app.MapGroup("/me/status").WithTags("Conta").RequireAuthorization();
        status.MapGet("/", Get);
        status.MapPut("/", Set);
    }

    private static async Task<IResult> Get(HttpContext http, AppDbContext db)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        return user is null ? Results.Unauthorized() : Results.Ok(new StatusDto(user.Status));
    }

    private static async Task<IResult> Set(StatusDto request, HttpContext http, AppDbContext db,
        PresenceTracker presence, PresenceNotifier notifier)
    {
        if (!UserStatuses.IsValid(request.Status))
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["status"] = [$"Use um destes: {string.Join(", ", UserStatuses.All)}."],
            });

        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        var before = presence.PresenceOf(user.Id);
        user.Status = request.Status;
        await db.SaveChangesAsync();
        presence.SetChosen(user.Id, request.Status);

        var after = presence.PresenceOf(user.Id);
        if (after != before) await notifier.Notify(user.Id, after);
        return Results.Ok(new StatusDto(user.Status));
    }
}
