using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Resenha.Api.Accounts;
using Resenha.Api.Data;

namespace Resenha.Api.Auth;

public record RegisterRequest(string? Username, string? DisplayName, string? Password);
public record LoginRequest(string? Username, string? Password);
public record AuthResponse(string Token, DateTimeOffset ExpiresAt, UserDto User);

public static class AuthEndpoints
{
    public const string RateLimitPolicy = "auth";

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/auth").WithTags("Auth");

        auth.MapPost("/register", Register).RequireRateLimiting(RateLimitPolicy);
        auth.MapPost("/login", Login).RequireRateLimiting(RateLimitPolicy);
        auth.MapPost("/refresh", Refresh).RequireAuthorization();
    }

    private static async Task<IResult> Register(
        RegisterRequest request, AppDbContext db, IPasswordHasher<User> hasher, TokenService tokens)
    {
        var username = AccountRules.NormalizeUsername(request.Username);
        var displayName = (request.DisplayName ?? "").Trim();

        var errors = new Dictionary<string, string[]>();
        if (AccountRules.ValidateUsername(username) is { } usernameError) errors["username"] = [usernameError];
        if (AccountRules.ValidateDisplayName(displayName) is { } nameError) errors["displayName"] = [nameError];
        if (AccountRules.ValidatePassword(request.Password) is { Count: > 0 } passwordErrors) errors["password"] = [.. passwordErrors];
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        if (await db.Users.AnyAsync(u => u.Username == username))
            return UsernameTaken();

        var user = new User { Username = username, DisplayName = displayName };
        user.PasswordHash = hasher.HashPassword(user, request.Password!);
        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Duas pessoas pegaram o mesmo @ ao mesmo tempo: o índice único segurou.
            db.Entry(user).State = EntityState.Detached;
            if (await db.Users.AnyAsync(u => u.Username == username)) return UsernameTaken();
            throw;
        }

        var (token, expiresAt) = tokens.Create(user);
        return Results.Created("/me", new AuthResponse(token, expiresAt, UserDto.From(user)));
    }

    private static async Task<IResult> Login(
        LoginRequest request, AppDbContext db, IPasswordHasher<User> hasher, TokenService tokens)
    {
        var username = AccountRules.NormalizeUsername(request.Username);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

        if (user is null)
        {
            // Calcula um hash mesmo assim, para a resposta demorar o mesmo tanto
            // e ninguém descobrir quais @ existem pelo tempo de resposta.
            hasher.HashPassword(new User { Username = "", DisplayName = "" }, request.Password ?? "");
            return WrongCredentials();
        }

        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password ?? "");
        if (result == PasswordVerificationResult.Failed)
            return WrongCredentials();

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            // O ASP.NET aumentou o custo do hash numa versão nova: atualiza sem a pessoa perceber.
            user.PasswordHash = hasher.HashPassword(user, request.Password!);
            await db.SaveChangesAsync();
        }

        var (token, expiresAt) = tokens.Create(user);
        return Results.Ok(new AuthResponse(token, expiresAt, UserDto.From(user)));
    }

    /// <summary>Troca um token ainda válido por um novo de 30 dias. O app chama ao abrir.</summary>
    private static async Task<IResult> Refresh(HttpContext http, AppDbContext db, TokenService tokens)
    {
        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null) return Results.Unauthorized();

        var (token, expiresAt) = tokens.Create(user);
        return Results.Ok(new AuthResponse(token, expiresAt, UserDto.From(user)));
    }

    private static IResult UsernameTaken() =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Esse @ já está em uso.");

    private static IResult WrongCredentials() =>
        Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "@ ou senha incorretos.");
}
