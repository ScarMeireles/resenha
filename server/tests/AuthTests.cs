using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;

namespace Resenha.Api.Tests;

public class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static string NewUsername() => "u" + Guid.NewGuid().ToString("N")[..12];

    [Fact]
    public async Task Cadastro_cria_conta_normaliza_o_arroba_e_devolve_token()
    {
        var username = NewUsername();
        var response = await _client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("@" + username.ToUpperInvariant(), "  Ana Souza ", "Senha!1"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(username, auth.User.Username);
        Assert.Equal("Ana Souza", auth.User.DisplayName);
        Assert.False(string.IsNullOrEmpty(auth.Token));
        Assert.InRange(auth.ExpiresAt, DateTimeOffset.UtcNow.AddDays(29), DateTimeOffset.UtcNow.AddDays(31));
    }

    [Fact]
    public async Task Senha_e_guardada_so_como_hash()
    {
        var username = NewUsername();
        (await _client.PostAsJsonAsync("/auth/register", new RegisterRequest(username, "Ana", "Senha!1"))).EnsureSuccessStatusCode();

        using var scope = factory.Services.CreateScope();
        var user = scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.Single(u => u.Username == username);
        Assert.DoesNotContain("Senha!1", user.PasswordHash);
        Assert.True(user.PasswordHash.Length > 40);
    }

    [Fact]
    public async Task Cadastro_com_arroba_repetido_devolve_409()
    {
        var username = NewUsername();
        (await _client.PostAsJsonAsync("/auth/register", new RegisterRequest(username, "Ana", "Senha!1"))).EnsureSuccessStatusCode();

        var again = await _client.PostAsJsonAsync("/auth/register", new RegisterRequest(username.ToUpperInvariant(), "Outra", "Senha!1"));

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Cadastro_invalido_devolve_400_com_erro_por_campo()
    {
        var response = await _client.PostAsJsonAsync("/auth/register", new RegisterRequest("a!", "", "fraca"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;
        Assert.Contains("username", problem.Errors.Keys);
        Assert.Contains("displayName", problem.Errors.Keys);
        Assert.Contains("password", problem.Errors.Keys);
    }

    [Fact]
    public async Task Login_com_senha_certa_funciona_e_errada_ou_arroba_inexistente_devolve_401()
    {
        var username = NewUsername();
        (await _client.PostAsJsonAsync("/auth/register", new RegisterRequest(username, "Ana", "Senha!1"))).EnsureSuccessStatusCode();

        var ok = await _client.PostAsJsonAsync("/auth/login", new LoginRequest("@" + username, "Senha!1"));
        var wrongPassword = await _client.PostAsJsonAsync("/auth/login", new LoginRequest(username, "Senha!2"));
        var unknownUser = await _client.PostAsJsonAsync("/auth/login", new LoginRequest(NewUsername(), "Senha!1"));

        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownUser.StatusCode);
        // Mesma mensagem nos dois casos: não revela se o @ existe.
        Assert.Equal(
            (await wrongPassword.Content.ReadFromJsonAsync<ProblemDetails>())!.Title,
            (await unknownUser.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
    }

    [Fact]
    public async Task Rotas_protegidas_exigem_token_valido()
    {
        var noToken = await _client.GetAsync("/me");

        var fake = factory.CreateClient();
        fake.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "isso.nao.e-um-token");
        var badToken = await fake.GetAsync("/me");

        Assert.Equal(HttpStatusCode.Unauthorized, noToken.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, badToken.StatusCode);
    }

    [Fact]
    public async Task Refresh_troca_por_um_token_novo_que_funciona()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        var response = await client.PostAsync("/auth/refresh", null);
        response.EnsureSuccessStatusCode();
        var refreshed = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;

        var other = factory.CreateClient();
        other.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", refreshed.Token);
        var me = await other.GetFromJsonAsync<UserDto>("/me");
        Assert.Equal(auth.User.Id, me!.Id);
        Assert.True(refreshed.ExpiresAt >= auth.ExpiresAt);
    }

    [Fact]
    public async Task Token_deixa_de_valer_quando_o_carimbo_de_seguranca_muda()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.FindAsync(auth.User.Id);
            user!.SecurityStamp = Guid.NewGuid(); // o que a troca de senha fará no futuro
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/me")).StatusCode);
    }
}

public class RateLimitTests
{
    [Fact]
    public async Task Muitas_tentativas_de_login_no_mesmo_minuto_devolvem_429()
    {
        using var factory = new ApiFactory { AuthPerMinute = 3 };
        var client = factory.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
            statuses.Add((await client.PostAsJsonAsync("/auth/login", new LoginRequest("ninguem", "Senha!1"))).StatusCode);

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], statuses);
    }
}
