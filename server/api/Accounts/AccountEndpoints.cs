using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Media;

namespace Resenha.Api.Accounts;

public record UpdateMeRequest(string? DisplayName);

public static class AccountEndpoints
{
    // Arquivo de até 10 MB + folga para o "envelope" do multipart.
    private const long MaxRequestBytes = ImageProcessor.MaxUploadBytes + 64 * 1024;

    public static void MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/me").WithTags("Conta").RequireAuthorization();

        me.MapGet("/", GetMe);
        me.MapPatch("/", UpdateMe);
        MapImage(me, "/avatar", MediaKind.Avatar);
        MapImage(me, "/banner", MediaKind.Banner);

        app.MapGet("/users/{username}", GetUser).WithTags("Conta").RequireAuthorization();
    }

    private static void MapImage(RouteGroupBuilder me, string route, MediaKind kind)
    {
        me.MapPut(route, (IFormFile file, HttpContext http, AppDbContext db, ImageProcessor images, MediaStorage storage, CancellationToken ct) =>
                UploadImage(kind, file, http, db, images, storage, ct))
            .DisableAntiforgery() // a API usa token no cabeçalho, não cookie: não há risco de CSRF
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes));

        me.MapDelete(route, (HttpContext http, AppDbContext db, MediaStorage storage) =>
            DeleteImage(kind, http, db, storage));
    }

    private static async Task<IResult> GetMe(HttpContext http, AppDbContext db)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        return user is null ? Results.Unauthorized() : Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> UpdateMe(UpdateMeRequest request, HttpContext http, AppDbContext db)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        if (request.DisplayName is not null)
        {
            var displayName = request.DisplayName.Trim();
            if (AccountRules.ValidateDisplayName(displayName) is { } error)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["displayName"] = [error] });
            user.DisplayName = displayName;
        }

        await db.SaveChangesAsync();
        return Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> GetUser(string username, AppDbContext db)
    {
        var normalized = AccountRules.NormalizeUsername(username);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == normalized);
        return user is null
            ? Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Usuário não encontrado.")
            : Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> UploadImage(
        MediaKind kind, IFormFile file, HttpContext http, AppDbContext db,
        ImageProcessor images, MediaStorage storage, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([http.User.GetUserId()], ct);
        if (user is null) return Results.Unauthorized();

        if (file.Length > ImageProcessor.MaxUploadBytes)
            return Results.Problem(statusCode: StatusCodes.Status413PayloadTooLarge, title: "A imagem pode ter no máximo 10 MB.");

        byte[] webp;
        try
        {
            using var buffer = new MemoryStream((int)file.Length);
            await file.CopyToAsync(buffer, ct);
            buffer.Position = 0;
            webp = await images.ToWebpAsync(buffer, kind, ct);
        }
        catch (InvalidImageException ex)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: ex.Message);
        }

        var newFile = await storage.SaveAsync(kind, webp, ct);
        var oldFile = kind == MediaKind.Avatar ? user.AvatarFile : user.BannerFile;
        if (kind == MediaKind.Avatar) user.AvatarFile = newFile; else user.BannerFile = newFile;

        await db.SaveChangesAsync(ct);
        storage.Delete(kind, oldFile); // só apaga a antiga depois que o banco já aponta para a nova
        return Results.Ok(UserDto.From(user));
    }

    private static async Task<IResult> DeleteImage(MediaKind kind, HttpContext http, AppDbContext db, MediaStorage storage)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        var oldFile = kind == MediaKind.Avatar ? user.AvatarFile : user.BannerFile;
        if (kind == MediaKind.Avatar) user.AvatarFile = null; else user.BannerFile = null;

        await db.SaveChangesAsync();
        storage.Delete(kind, oldFile);
        return Results.Ok(UserDto.From(user));
    }
}
