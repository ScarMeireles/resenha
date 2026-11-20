using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Friends;
using Resenha.Api.Media;
using Resenha.Api.Realtime;

namespace Resenha.Api.Groups;

public record GroupMemberDto(UserDto User, string Presence, bool IsOwner);
public record GroupDto(Guid Id, string Name, Guid OwnerId, GroupMemberDto[] Members, DateTimeOffset CreatedAt);
public record MessageImageDto(string Url, int Width, int Height);
/// <summary>Mensagem apagada vem com Deleted = true, Text vazio e sem imagens.</summary>
public record MessageDto(
    Guid Id, Guid GroupId, UserDto Author, string Text, MessageImageDto[] Images, DateTimeOffset CreatedAt, bool Deleted);
public record CreateGroupRequest(string? Name, Guid[]? MemberIds);
public record RenameGroupRequest(string? Name);
public record AddMembersRequest(Guid[]? UserIds);

public static class GroupEndpoints
{
    public const string MessageRateLimitPolicy = "messages";

    // Cada imagem até 10 MB; total = 4x + folga para o "envelope" do multipart e o texto.
    private const long MaxMessageRequestBytes = ImageProcessor.MaxUploadBytes * GroupRules.MaxImagesPerMessage + 256 * 1024;

    public static void MapGroupEndpoints(this IEndpointRouteBuilder app)
    {
        var groups = app.MapGroup("/groups").WithTags("Grupos").RequireAuthorization();

        groups.MapGet("/", List);
        groups.MapPost("/", Create);
        groups.MapGet("/{id:guid}", Get);
        groups.MapPatch("/{id:guid}", Rename);
        groups.MapPost("/{id:guid}/members", AddMembers);
        groups.MapDelete("/{id:guid}/members/{userId:guid}", RemoveMember);
        groups.MapGet("/{id:guid}/messages", ListMessages);
        groups.MapPost("/{id:guid}/messages", SendMessage)
            .DisableAntiforgery() // a API usa token no cabeçalho, não cookie: não há risco de CSRF
            .WithMetadata(new RequestSizeLimitAttribute(MaxMessageRequestBytes))
            .RequireRateLimiting(MessageRateLimitPolicy);
        groups.MapDelete("/{id:guid}/messages/{messageId:guid}", DeleteMessage);
    }

    // --- Grupos

    private static async Task<IResult> List(HttpContext http, AppDbContext db, PresenceTracker presence)
    {
        var me = http.User.GetUserId();
        var mine = await db.Groups
            .Include(g => g.Members).ThenInclude(m => m.User)
            .Where(g => g.Members.Any(m => m.UserId == me))
            .ToListAsync();
        var ids = mine.Select(g => g.Id).ToList();
        var lastMessages = await db.Messages
            .Where(m => ids.Contains(m.GroupId))
            .GroupBy(m => m.GroupId)
            .Select(g => new { GroupId = g.Key, Last = g.Max(m => m.CreatedAt) })
            .ToDictionaryAsync(x => x.GroupId, x => x.Last);

        var result = mine
            .OrderByDescending(g => lastMessages.GetValueOrDefault(g.Id, g.CreatedAt))
            .ThenByDescending(g => g.CreatedAt)
            .Select(g => ToDto(g, presence))
            .ToArray();
        return Results.Ok(result);
    }

    private static async Task<IResult> Create(
        CreateGroupRequest request, HttpContext http, AppDbContext db, TimeProvider clock,
        PresenceTracker presence, GroupNotifier notifier)
    {
        var me = http.User.GetUserId();
        var name = (request.Name ?? "").Trim();
        if (GroupRules.ValidateName(name) is { } nameError)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = [nameError] });

        var memberIds = (request.MemberIds ?? []).Where(id => id != me).Distinct().ToList();
        if (await CheckNewMembers(db, me, memberIds, currentCount: 1) is { } error) return error;

        var now = clock.GetUtcNow();
        var group = new Group { Name = name, OwnerId = me, CreatedAt = now };
        foreach (var userId in memberIds.Prepend(me))
            group.Members.Add(new GroupMember { UserId = userId, JoinedAt = now });
        db.Groups.Add(group);
        await db.SaveChangesAsync();

        var dto = ToDto((await LoadMemberGroup(db, group.Id, me))!, presence);
        foreach (var member in dto.Members)
            await notifier.Added(member.User.Id, dto);
        return Results.Created($"/groups/{group.Id}", dto);
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, AppDbContext db, PresenceTracker presence)
    {
        var group = await LoadMemberGroup(db, id, http.User.GetUserId());
        return group is null ? GroupNotFound() : Results.Ok(ToDto(group, presence));
    }

    private static async Task<IResult> Rename(
        Guid id, RenameGroupRequest request, HttpContext http, AppDbContext db,
        PresenceTracker presence, GroupNotifier notifier)
    {
        var me = http.User.GetUserId();
        var group = await LoadMemberGroup(db, id, me);
        if (group is null) return GroupNotFound();
        if (group.OwnerId != me) return NotOwner();

        var name = (request.Name ?? "").Trim();
        if (GroupRules.ValidateName(name) is { } nameError)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = [nameError] });

        group.Name = name;
        await db.SaveChangesAsync();

        var dto = ToDto(group, presence);
        await notifier.Updated(dto);
        return Results.Ok(dto);
    }

    private static async Task<IResult> AddMembers(
        Guid id, AddMembersRequest request, HttpContext http, AppDbContext db, TimeProvider clock,
        PresenceTracker presence, GroupNotifier notifier)
    {
        var me = http.User.GetUserId();
        var group = await LoadMemberGroup(db, id, me);
        if (group is null) return GroupNotFound();

        var existing = group.Members.Select(m => m.UserId).ToHashSet();
        var newIds = (request.UserIds ?? []).Where(u => !existing.Contains(u)).Distinct().ToList();
        if (await CheckNewMembers(db, me, newIds, group.Members.Count) is { } error) return error;

        if (newIds.Count > 0)
        {
            var now = clock.GetUtcNow();
            foreach (var userId in newIds)
                db.GroupMembers.Add(new GroupMember { GroupId = id, UserId = userId, JoinedAt = now });
            await db.SaveChangesAsync();
            group = (await LoadMemberGroup(db, id, me))!;
        }

        var dto = ToDto(group, presence);
        if (newIds.Count > 0)
        {
            // Primeiro avisa quem já estava; depois quem entrou recebe o grupo inteiro (e passa a receber as mensagens).
            await notifier.Updated(dto with { Members = dto.Members.Where(m => !newIds.Contains(m.User.Id)).ToArray() });
            foreach (var userId in newIds)
                await notifier.Added(userId, dto);
        }
        return Results.Ok(dto);
    }

    private static async Task<IResult> RemoveMember(
        Guid id, Guid userId, HttpContext http, AppDbContext db, MediaStorage storage,
        PresenceTracker presence, GroupNotifier notifier)
    {
        var me = http.User.GetUserId();
        var group = await LoadMemberGroup(db, id, me);
        if (group is null) return GroupNotFound();

        if (userId != me && group.OwnerId != me) return NotOwner();
        var member = group.Members.FirstOrDefault(m => m.UserId == userId);
        if (member is null) return Problem(StatusCodes.Status404NotFound, "Membro não encontrado.");

        group.Members.Remove(member);
        db.GroupMembers.Remove(member);

        if (group.Members.Count == 0)
        {
            // Ninguém sobrou: apaga o grupo (mensagens e imagens vão junto) e os arquivos do disco.
            var files = await db.MessageImages.Where(i => db.Messages.Any(m => m.Id == i.MessageId && m.GroupId == id))
                .Select(i => i.File).ToListAsync();
            db.Groups.Remove(group);
            await db.SaveChangesAsync();
            foreach (var file in files) storage.Delete(MediaKind.Chat, file);
            await notifier.Removed(userId, id);
            return Results.NoContent();
        }

        if (group.OwnerId == userId)
            group.OwnerId = group.Members.OrderBy(m => m.JoinedAt).ThenBy(m => m.UserId).First().UserId;
        await db.SaveChangesAsync();

        await notifier.Removed(userId, id);
        await notifier.Updated(ToDto(group, presence));
        return Results.NoContent();
    }

    // --- Mensagens

    private static async Task<IResult> ListMessages(
        Guid id, Guid? before, int? limit, HttpContext http, AppDbContext db)
    {
        if (await LoadMemberGroup(db, id, http.User.GetUserId()) is null) return GroupNotFound();

        var query = db.Messages.AsNoTracking().Where(m => m.GroupId == id);
        if (before is { } cursorId)
        {
            var cursor = await db.Messages.AsNoTracking().FirstOrDefaultAsync(m => m.Id == cursorId && m.GroupId == id);
            if (cursor is null) return Problem(StatusCodes.Status404NotFound, "Mensagem não encontrada.");
            var cursorTime = cursor.CreatedAt;
            query = query.Where(m => m.CreatedAt < cursorTime);
        }

        var take = Math.Clamp(limit ?? GroupRules.PageSize, 1, GroupRules.MaxPageSize);
        var page = await query.Include(m => m.Author).Include(m => m.Images)
            .OrderByDescending(m => m.CreatedAt).Take(take).ToListAsync();
        page.Reverse(); // mais antiga primeiro
        return Results.Ok(page.Select(ToDto).ToArray());
    }

    private static async Task<IResult> SendMessage(
        Guid id, HttpContext http, IFormCollection form, AppDbContext db, TimeProvider clock,
        ImageProcessor images, MediaStorage storage, GroupNotifier notifier, CancellationToken ct)
    {
        var me = http.User.GetUserId();
        if (await LoadMemberGroup(db, id, me) is null) return GroupNotFound();

        var text = form["text"].ToString().Trim();
        var files = form.Files.GetFiles("images");
        if (text.Length > GroupRules.MessageMaxLength)
            return Results.ValidationProblem(new Dictionary<string, string[]>
                { ["text"] = [$"A mensagem pode ter no máximo {GroupRules.MessageMaxLength} caracteres."] });
        if (files.Count > GroupRules.MaxImagesPerMessage)
            return Problem(StatusCodes.Status400BadRequest, $"Cada mensagem pode ter no máximo {GroupRules.MaxImagesPerMessage} imagens.");
        if (text.Length == 0 && files.Count == 0)
            return Results.ValidationProblem(new Dictionary<string, string[]>
                { ["text"] = ["Escreva algo ou envie uma imagem."] });
        if (files.Any(f => f.Length > ImageProcessor.MaxUploadBytes))
            return Problem(StatusCodes.Status413PayloadTooLarge, "Cada imagem pode ter no máximo 10 MB.");

        var message = new Message { GroupId = id, AuthorId = me, Text = text, CreatedAt = clock.GetUtcNow() };
        var saved = new List<string>();
        try
        {
            var order = 0;
            foreach (var file in files)
            {
                using var buffer = new MemoryStream((int)file.Length);
                await file.CopyToAsync(buffer, ct);
                buffer.Position = 0;
                var processed = await images.ProcessAsync(buffer, MediaKind.Chat, ct);
                var name = await storage.SaveAsync(MediaKind.Chat, processed.Webp, ct);
                saved.Add(name);
                message.Images.Add(new MessageImage { File = name, Width = processed.Width, Height = processed.Height, Order = order++ });
            }

            db.Messages.Add(message);
            await db.SaveChangesAsync(ct);
        }
        catch (InvalidImageException ex)
        {
            foreach (var name in saved) storage.Delete(MediaKind.Chat, name);
            return Problem(StatusCodes.Status400BadRequest, ex.Message);
        }
        catch
        {
            foreach (var name in saved) storage.Delete(MediaKind.Chat, name); // não deixa arquivo órfão
            throw;
        }

        message.Author = (await db.Users.FindAsync([me], ct))!;
        var dto = ToDto(message);
        await notifier.Message(dto);
        return Results.Created($"/groups/{id}/messages/{message.Id}", dto);
    }

    private static async Task<IResult> DeleteMessage(
        Guid id, Guid messageId, HttpContext http, AppDbContext db, TimeProvider clock,
        MediaStorage storage, GroupNotifier notifier)
    {
        var me = http.User.GetUserId();
        if (await LoadMemberGroup(db, id, me) is null) return GroupNotFound();

        var message = await db.Messages.Include(m => m.Images)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.GroupId == id && m.DeletedAt == null);
        if (message is null) return Problem(StatusCodes.Status404NotFound, "Mensagem não encontrada.");
        if (message.AuthorId != me) return Problem(StatusCodes.Status403Forbidden, "Só quem escreveu pode apagar a mensagem.");

        var files = message.Images.Select(i => i.File).ToList();
        db.MessageImages.RemoveRange(message.Images);
        message.Text = "";
        message.DeletedAt = clock.GetUtcNow();
        await db.SaveChangesAsync();

        foreach (var file in files) storage.Delete(MediaKind.Chat, file);
        await notifier.MessageRemoved(id, messageId);
        return Results.NoContent();
    }

    // --- Apoio

    /// <summary>Carrega o grupo só se a pessoa for membro; quem não é recebe o mesmo "não encontrado" de um grupo que não existe.</summary>
    private static Task<Group?> LoadMemberGroup(AppDbContext db, Guid id, Guid me) =>
        db.Groups.Include(g => g.Members).ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Id == id && g.Members.Any(m => m.UserId == me));

    /// <summary>Confere se os novos são amigos aceitos de quem adiciona e se cabem no limite. Retorna o erro, ou null se está tudo certo.</summary>
    private static async Task<IResult?> CheckNewMembers(AppDbContext db, Guid me, List<Guid> newIds, int currentCount)
    {
        if (newIds.Count == 0) return null;

        var friendIds = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == me || f.AddresseeId == me))
            .Select(f => f.RequesterId == me ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        if (newIds.Any(id => !friendIds.Contains(id)))
            return Problem(StatusCodes.Status400BadRequest, "Só dá para adicionar amigos.");
        if (currentCount + newIds.Count > GroupRules.MaxMembers)
            return Problem(StatusCodes.Status400BadRequest, $"O grupo pode ter no máximo {GroupRules.MaxMembers} pessoas.");
        return null;
    }

    private static IResult GroupNotFound() => Problem(StatusCodes.Status404NotFound, "Grupo não encontrado.");

    private static IResult NotOwner() => Problem(StatusCodes.Status403Forbidden, "Só quem é dono do grupo pode fazer isso.");

    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);

    public static GroupDto ToDto(Group group, PresenceTracker presence) => new(
        group.Id,
        group.Name,
        group.OwnerId,
        group.Members.OrderBy(m => m.JoinedAt).ThenBy(m => m.UserId)
            .Select(m => new GroupMemberDto(UserDto.From(m.User), presence.PresenceOf(m.UserId), m.UserId == group.OwnerId))
            .ToArray(),
        group.CreatedAt);

    public static MessageDto ToDto(Message message) => new(
        message.Id,
        message.GroupId,
        UserDto.From(message.Author),
        message.Text,
        message.Images.OrderBy(i => i.Order)
            .Select(i => new MessageImageDto($"/media/{MediaKind.Chat.Folder()}/{i.File}", i.Width, i.Height)).ToArray(),
        message.CreatedAt,
        message.DeletedAt is not null);
}
