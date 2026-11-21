using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Groups;
using Resenha.Api.Media;
using Resenha.Api.Realtime;

namespace Resenha.Api.Chat;

/// <summary>Mensagem de DM. Apagada vem com Deleted = true, Text vazio e sem imagens (igual ao grupo).</summary>
public record DirectMessageDto(
    Guid Id, Guid ConversationId, UserDto Author, string Text, MessageImageDto[] Images, DateTimeOffset CreatedAt, bool Deleted);

/// <summary>
/// Conversa direta vista por quem pede: User é sempre a OUTRA pessoa. CanSend é false quando vocês deixaram
/// de ser amigos (o histórico fica, só para leitura, até voltarem a ser amigos).
/// </summary>
public record DirectConversationDto(Guid Id, UserDto User, bool CanSend, DirectMessageDto? LastMessage, DateTimeOffset CreatedAt);

public record OpenDirectConversationRequest(Guid? UserId);

public static class DirectMessageEndpoints
{
    public static void MapDirectMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var dms = app.MapGroup("/dms").WithTags("Mensagens diretas").RequireAuthorization();

        dms.MapGet("/", List);
        dms.MapPost("/", Open);
        dms.MapGet("/{id:guid}", Get);
        dms.MapGet("/{id:guid}/messages", ListMessages);
        dms.MapPost("/{id:guid}/messages", SendMessage)
            .DisableAntiforgery() // a API usa token no cabeçalho, não cookie: não há risco de CSRF
            .WithMetadata(new RequestSizeLimitAttribute(ChatMessages.MaxRequestBytes))
            .RequireRateLimiting(ChatMessages.RateLimitPolicy);
        dms.MapDelete("/{id:guid}/messages/{messageId:guid}", DeleteMessage);
    }

    // --- Conversas

    /// <summary>Minhas conversas que já têm alguma mensagem, da mais recente para a mais antiga.</summary>
    private static async Task<IResult> List(HttpContext http, AppDbContext db)
    {
        var me = http.User.GetUserId();
        var mine = await Mine(db, me).ToListAsync();
        var ids = mine.Select(c => c.Id).ToList();

        var lastIds = await db.Messages
            .Where(m => m.ConversationId != null && ids.Contains(m.ConversationId.Value))
            .GroupBy(m => m.ConversationId)
            .Select(g => g.OrderByDescending(m => m.CreatedAt).Select(m => m.Id).First())
            .ToListAsync();
        var last = await db.Messages.AsNoTracking().Include(m => m.Author).Include(m => m.Images)
            .Where(m => lastIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.ConversationId!.Value);
        var friends = await FriendIds(db, me);

        var result = mine
            .Where(c => last.ContainsKey(c.Id))
            .OrderByDescending(c => last[c.Id].CreatedAt)
            .Select(c => ToDto(c, me, friends.Contains(c.OtherThan(me)), last[c.Id]))
            .ToArray();
        return Results.Ok(result);
    }

    /// <summary>
    /// Abre a conversa com um amigo: devolve a que já existe (200) ou cria (201). Ex-amigo só reabre
    /// a conversa que já existia (só leitura); conversa nova só com amigo.
    /// </summary>
    private static async Task<IResult> Open(OpenDirectConversationRequest request, HttpContext http, AppDbContext db, TimeProvider clock)
    {
        var me = http.User.GetUserId();
        if (request.UserId is not { } other || other == Guid.Empty)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["userId"] = ["Informe com quem conversar."] });
        if (other == me) return Problem(StatusCodes.Status400BadRequest, "Você não pode conversar com você mesmo.");

        var (a, b) = DirectConversation.Pair(me, other);
        if (await FindPair(db, a, b) is { } existing)
            return Results.Ok(await LoadDto(db, existing, me));

        // Mesma resposta para "não é amigo" e "não existe", para ninguém descobrir contas pelo Id.
        if (!await AreFriends(db, me, other)) return NotFriends();

        var conversation = new DirectConversation { UserAId = a, UserBId = b, CreatedAt = clock.GetUtcNow() };
        db.DirectConversations.Add(conversation);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Os dois abriram ao mesmo tempo: o índice único segurou, então usa a que o outro criou.
            db.Entry(conversation).State = EntityState.Detached;
            if (await FindPair(db, a, b) is { } again) return Results.Ok(await LoadDto(db, again, me));
            throw;
        }

        var created = (await FindPair(db, a, b))!;
        return Results.Created($"/dms/{created.Id}", await LoadDto(db, created, me));
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, AppDbContext db)
    {
        var me = http.User.GetUserId();
        var conversation = await LoadMine(db, id, me);
        return conversation is null ? ConversationNotFound() : Results.Ok(await LoadDto(db, conversation, me));
    }

    // --- Mensagens

    private static async Task<IResult> ListMessages(Guid id, Guid? before, int? limit, HttpContext http, AppDbContext db)
    {
        if (await LoadMine(db, id, http.User.GetUserId()) is null) return ConversationNotFound();

        var (page, error) = await ChatMessages.PageAsync(db.Messages.Where(m => m.ConversationId == id), before, limit);
        return error ?? Results.Ok(page!.Select(ToDto).ToArray());
    }

    private static async Task<IResult> SendMessage(
        Guid id, HttpContext http, IFormCollection form, AppDbContext db, TimeProvider clock,
        ImageProcessor images, MediaStorage storage, DirectMessageNotifier notifier, CancellationToken ct)
    {
        var me = http.User.GetUserId();
        var conversation = await LoadMine(db, id, me);
        if (conversation is null) return ConversationNotFound();
        if (!await AreFriends(db, conversation.UserAId, conversation.UserBId))
            return Problem(StatusCodes.Status403Forbidden,
                "Vocês não são mais amigos: a conversa fica só para leitura até voltarem a ser amigos.");

        var message = new Message { ConversationId = id, AuthorId = me, CreatedAt = clock.GetUtcNow() };
        if (await ChatMessages.SaveAsync(message, form, db, images, storage, ct) is { } error) return error;

        var dto = ToDto(message);
        await notifier.Message(conversation.UserAId, conversation.UserBId, dto);
        return Results.Created($"/dms/{id}/messages/{message.Id}", dto);
    }

    /// <summary>Cada um apaga a própria mensagem. Vale mesmo sem amizade: tirar o que você escreveu não é "enviar".</summary>
    private static async Task<IResult> DeleteMessage(
        Guid id, Guid messageId, HttpContext http, AppDbContext db, TimeProvider clock,
        MediaStorage storage, DirectMessageNotifier notifier)
    {
        var me = http.User.GetUserId();
        var conversation = await LoadMine(db, id, me);
        if (conversation is null) return ConversationNotFound();

        if (await ChatMessages.DeleteAsync(db.Messages.Where(m => m.ConversationId == id), messageId, me, db, clock, storage) is { } error)
            return error;
        await notifier.MessageRemoved(conversation.UserAId, conversation.UserBId, id, messageId);
        return Results.NoContent();
    }

    // --- Apoio

    private static IQueryable<DirectConversation> Mine(AppDbContext db, Guid me) =>
        db.DirectConversations.AsNoTracking().Include(c => c.UserA).Include(c => c.UserB)
            .Where(c => c.UserAId == me || c.UserBId == me);

    /// <summary>Carrega a conversa só se a pessoa participa; quem não participa recebe o mesmo "não encontrada" de uma que não existe.</summary>
    private static Task<DirectConversation?> LoadMine(AppDbContext db, Guid id, Guid me) =>
        Mine(db, me).FirstOrDefaultAsync(c => c.Id == id);

    private static Task<DirectConversation?> FindPair(AppDbContext db, Guid a, Guid b) =>
        db.DirectConversations.AsNoTracking().Include(c => c.UserA).Include(c => c.UserB)
            .FirstOrDefaultAsync(c => c.UserAId == a && c.UserBId == b);

    private static Task<bool> AreFriends(AppDbContext db, Guid x, Guid y) =>
        db.Friendships.AnyAsync(f => f.Status == FriendshipStatus.Accepted
            && ((f.RequesterId == x && f.AddresseeId == y) || (f.RequesterId == y && f.AddresseeId == x)));

    private static async Task<HashSet<Guid>> FriendIds(AppDbContext db, Guid me) =>
        (await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == me || f.AddresseeId == me))
            .Select(f => f.RequesterId == me ? f.AddresseeId : f.RequesterId)
            .ToListAsync()).ToHashSet();

    private static async Task<DirectConversationDto> LoadDto(AppDbContext db, DirectConversation conversation, Guid me)
    {
        var last = await db.Messages.AsNoTracking().Include(m => m.Author).Include(m => m.Images)
            .Where(m => m.ConversationId == conversation.Id)
            .OrderByDescending(m => m.CreatedAt).FirstOrDefaultAsync();
        var canSend = await AreFriends(db, conversation.UserAId, conversation.UserBId);
        return ToDto(conversation, me, canSend, last);
    }

    private static IResult NotFriends() => Problem(StatusCodes.Status403Forbidden, "Só dá para conversar com amigos.");

    private static IResult ConversationNotFound() => Problem(StatusCodes.Status404NotFound, "Conversa não encontrada.");

    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);

    private static DirectConversationDto ToDto(DirectConversation c, Guid me, bool canSend, Message? last) =>
        new(c.Id, UserDto.From(c.OtherUser(me)), canSend, last is null ? null : ToDto(last), c.CreatedAt);

    public static DirectMessageDto ToDto(Message message) => new(
        message.Id,
        message.ConversationId ?? throw new InvalidOperationException("Mensagem de grupo tratada como de DM."),
        UserDto.From(message.Author),
        message.Text,
        ChatMessages.ImagesOf(message),
        message.CreatedAt,
        message.DeletedAt is not null);
}
