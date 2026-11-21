using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Chat;
using Resenha.Api.Friends;
using static Resenha.Api.Tests.GroupTestHelpers;

namespace Resenha.Api.Tests;

public class UsernameChangeTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static Task<HttpResponseMessage> Change(HttpClient client, string? username) =>
        client.PutAsJsonAsync("/me/username", new ChangeUsernameRequest(username));

    private static string NewName() => $"novo_{Guid.NewGuid().ToString("N")[..8]}";

    [Fact]
    public async Task Troca_valida_normaliza_devolve_token_novo_e_mantem_o_login()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync("Senha!1");
        var name = NewName();

        var response = await Change(client, $"  @{name.ToUpperInvariant()} ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var changed = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(name, changed.User.Username);
        Assert.Equal(auth.User.Id, changed.User.Id);
        Assert.Equal(name, new JsonWebToken(changed.Token).GetClaim(JwtRegisteredClaimNames.UniqueName).Value);

        // O token antigo continua valendo (a sessão é pelo Id) e o novo também.
        Assert.Equal(name, (await client.GetFromJsonAsync<UserDto>("/me"))!.Username);
        var fresh = factory.CreateClient();
        fresh.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", changed.Token);
        Assert.Equal(HttpStatusCode.OK, (await fresh.GetAsync("/me")).StatusCode);

        // Login passa a ser pelo @ novo; o antigo não entra mais.
        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await anon.PostAsJsonAsync("/auth/login", new LoginRequest(name, "Senha!1"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.PostAsJsonAsync("/auth/login", new LoginRequest(auth.User.Username, "Senha!1"))).StatusCode);
    }

    [Fact]
    public async Task Troca_para_arroba_em_uso_devolve_409()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();
        var (_, other) = await factory.CreateLoggedUserAsync();

        var response = await Change(client, other.User.Username.ToUpperInvariant());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Esse @ já está em uso.", await Title(response));
        Assert.Equal(auth.User.Username, (await client.GetFromJsonAsync<UserDto>("/me"))!.Username);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("com espaco")]
    [InlineData("acentuação")]
    [InlineData(null)]
    public async Task Troca_para_arroba_invalido_devolve_400(string? username)
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        var response = await Change(client, username);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(auth.User.Username, (await client.GetFromJsonAsync<UserDto>("/me"))!.Username);
    }

    [Fact]
    public async Task Repetir_o_proprio_arroba_nao_e_conflito()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        var response = await Change(client, auth.User.Username);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Arroba_antigo_fica_livre_na_hora()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();
        var old = auth.User.Username;

        (await Change(client, NewName())).EnsureSuccessStatusCode();

        var availability = await factory.CreateClient().GetFromJsonAsync<UsernameAvailability>($"/auth/username-available?u={old}");
        Assert.True(availability!.Available);
        var register = await factory.CreateClient().PostAsJsonAsync("/auth/register", new RegisterRequest(old, "Outra", "Senha!1"));
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
    }

    [Fact]
    public async Task Amizade_grupo_e_dm_continuam_depois_da_troca()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id);
        var dm = (await (await a.PostAsJsonAsync("/dms", new OpenDirectConversationRequest(authB.User.Id)))
            .Content.ReadFromJsonAsync<DirectConversationDto>())!;
        var name = NewName();

        (await Change(a, name)).EnsureSuccessStatusCode();

        var friends = await b.GetFromJsonAsync<FriendsResponse>("/friends");
        Assert.Equal(name, Assert.Single(friends!.Friends).User.Username);
        Assert.Equal(name, (await Send(a, group.Id, "oi")).Author.Username);
        var sent = await a.PostAsync($"/dms/{dm.Id}/messages", MessageForm("oi"));
        Assert.Equal(name, (await sent.Content.ReadFromJsonAsync<DirectMessageDto>())!.Author.Username);
        Assert.Equal(authA.User.Id, (await b.GetFromJsonAsync<UserDto>($"/users/{name}"))!.Id);
    }
}
