using Microsoft.EntityFrameworkCore;
using Resenha.Api.Data;
using Resenha.Api.Groups;
using Resenha.Api.Media;

namespace Resenha.Api.Chat;

/// <summary>
/// O que o chat de grupo e a conversa direta (DM) fazem igual: validar e salvar a mensagem com imagens,
/// paginar e apagar. Quem chama já conferiu se a pessoa pode ver/escrever naquele lugar.
/// As regras (tamanho do texto, 4 imagens, página) ficam em <see cref="GroupRules"/>.
/// </summary>
public static class ChatMessages
{
    public const string RateLimitPolicy = "messages";

    // Cada imagem até 10 MB; total = 4x + folga para o "envelope" do multipart e o texto.
    public const long MaxRequestBytes = ImageProcessor.MaxUploadBytes * GroupRules.MaxImagesPerMessage + 256 * 1024;

    /// <summary>
    /// Lê "text" e "images" do formulário, converte as imagens em WebP e salva <paramref name="message"/>
    /// (que já vem com autor, data e grupo ou conversa). Devolve o erro pronto para a tela, ou null se salvou.
    /// </summary>
    public static async Task<IResult?> SaveAsync(
        Message message, IFormCollection form, AppDbContext db, ImageProcessor images, MediaStorage storage, CancellationToken ct)
    {
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

        message.Text = text;
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

        message.Author = (await db.Users.FindAsync([message.AuthorId], ct))!;
        return null;
    }

    /// <summary>
    /// Uma página de <paramref name="scope"/> (as mensagens de um grupo ou de uma DM), da mais antiga para a mais nova.
    /// "before" é o Id da mensagem mais antiga que o app já tem; sem ele, vêm as mais recentes.
    /// </summary>
    public static async Task<(List<Message>? Page, IResult? Error)> PageAsync(IQueryable<Message> scope, Guid? before, int? limit)
    {
        var query = scope.AsNoTracking();
        if (before is { } cursorId)
        {
            var cursor = await query.FirstOrDefaultAsync(m => m.Id == cursorId);
            if (cursor is null) return (null, MessageNotFound());
            var cursorTime = cursor.CreatedAt;
            query = query.Where(m => m.CreatedAt < cursorTime);
        }

        var take = Math.Clamp(limit ?? GroupRules.PageSize, 1, GroupRules.MaxPageSize);
        var page = await query.Include(m => m.Author).Include(m => m.Images)
            .OrderByDescending(m => m.CreatedAt).Take(take).ToListAsync();
        page.Reverse(); // mais antiga primeiro
        return (page, null);
    }

    /// <summary>
    /// Apaga a mensagem de <paramref name="scope"/>, se foi <paramref name="me"/> quem escreveu: some o texto e as imagens
    /// (do banco e do disco) e fica a linha, para a conversa mostrar "mensagem apagada". Devolve o erro, ou null se apagou.
    /// </summary>
    public static async Task<IResult?> DeleteAsync(
        IQueryable<Message> scope, Guid messageId, Guid me, AppDbContext db, TimeProvider clock, MediaStorage storage)
    {
        var message = await scope.Include(m => m.Images)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null);
        if (message is null) return MessageNotFound();
        if (message.AuthorId != me) return Problem(StatusCodes.Status403Forbidden, "Só quem escreveu pode apagar a mensagem.");

        var files = message.Images.Select(i => i.File).ToList();
        db.MessageImages.RemoveRange(message.Images);
        message.Text = "";
        message.DeletedAt = clock.GetUtcNow();
        await db.SaveChangesAsync();

        foreach (var file in files) storage.Delete(MediaKind.Chat, file);
        return null;
    }

    public static MessageImageDto[] ImagesOf(Message message) =>
        message.Images.OrderBy(i => i.Order)
            .Select(i => new MessageImageDto($"/media/{MediaKind.Chat.Folder()}/{i.File}", i.Width, i.Height)).ToArray();

    private static IResult MessageNotFound() => Problem(StatusCodes.Status404NotFound, "Mensagem não encontrada.");

    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);
}
