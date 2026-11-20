using System.Net;
using System.Net.Http.Json;
using Resenha.Api.Auth;

namespace Resenha.Api.Tests;

public class UsernameAvailabilityTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Arroba_livre_esta_disponivel_sem_precisar_de_login()
    {
        var result = await _client.GetFromJsonAsync<UsernameAvailability>(
            "/auth/username-available?u=" + Uri.EscapeDataString("@livre" + Guid.NewGuid().ToString("N")[..8]));

        Assert.True(result!.Available);
        Assert.Null(result.Error);
    }

    [Fact]
    public async Task Arroba_em_uso_nao_esta_disponivel_e_ignora_maiusculas()
    {
        var (_, auth) = await factory.CreateLoggedUserAsync();

        var result = await _client.GetFromJsonAsync<UsernameAvailability>(
            "/auth/username-available?u=" + auth.User.Username.ToUpperInvariant());

        Assert.False(result!.Available);
        Assert.Null(result.Error);
    }

    [Theory]
    [InlineData("a")]
    [InlineData("com espaco")]
    [InlineData("")]
    public async Task Arroba_invalido_devolve_o_motivo(string username)
    {
        var result = await _client.GetFromJsonAsync<UsernameAvailability>(
            "/auth/username-available?u=" + Uri.EscapeDataString(username));

        Assert.False(result!.Available);
        Assert.False(string.IsNullOrEmpty(result.Error));
    }

    [Fact]
    public async Task Estourar_o_limite_da_checagem_nao_bloqueia_o_cadastro()
    {
        using var limited = new ApiFactory { AuthPerMinute = 3 };
        var client = limited.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
            statuses.Add((await client.GetAsync("/auth/username-available?u=teste")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);

        var register = await client.PostAsJsonAsync("/auth/register", new RegisterRequest("pessoa_nova", "Pessoa", "Senha!1"));
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
    }
}
