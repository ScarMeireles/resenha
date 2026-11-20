using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Resenha.Api.Auth;
using Resenha.Api.Friends;

namespace Resenha.Api.Tests;

public class FriendsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static Task<HttpResponseMessage> Send(HttpClient from, string? username) =>
        from.PostAsJsonAsync("/friends/requests", new SendFriendRequest(username));

    private static async Task<string?> Title(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemDetails>())?.Title;

    private static Task<FriendsResponse> GetFriends(HttpClient client) =>
        client.GetFromJsonAsync<FriendsResponse>("/friends")!;

    /// <summary>Cria duas contas e já deixa o pedido de A para B pendente.</summary>
    private async Task<(HttpClient A, AuthResponse AuthA, HttpClient B, AuthResponse AuthB, FriendRequestDto Request)> PendingPair()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await factory.CreateLoggedUserAsync();
        var response = await Send(a, authB.User.Username);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (a, authA, b, authB, (await response.Content.ReadFromJsonAsync<FriendRequestDto>())!);
    }

    [Fact]
    public async Task Enviar_pedido_devolve_201_com_a_outra_pessoa()
    {
        var (_, _, _, authB, request) = await PendingPair();

        Assert.Equal(authB.User.Username, request.User.Username);
        Assert.NotEqual(Guid.Empty, request.Id);
    }

    [Fact]
    public async Task Arroba_com_arroba_e_maiusculas_tambem_funciona()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await factory.CreateLoggedUserAsync();

        var response = await Send(a, "@" + authB.User.Username.ToUpperInvariant());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData("naoexiste_zzzz")]
    [InlineData("!!")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Arroba_inexistente_ou_invalido_devolve_404(string? username)
    {
        var (a, _) = await factory.CreateLoggedUserAsync();

        var response = await Send(a, username);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Ninguém com esse @.", await Title(response));
    }

    [Fact]
    public async Task Adicionar_a_si_mesmo_devolve_400()
    {
        var (a, auth) = await factory.CreateLoggedUserAsync();

        var response = await Send(a, auth.User.Username);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Você não pode adicionar a si mesmo.", await Title(response));
    }

    [Fact]
    public async Task Pedido_repetido_devolve_409()
    {
        var (a, _, _, authB, _) = await PendingPair();

        var response = await Send(a, authB.User.Username);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Pedido já enviado.", await Title(response));
    }

    [Fact]
    public async Task Pedido_para_quem_ja_te_pediu_devolve_409_orientando_a_aceitar()
    {
        var (_, authA, b, _, _) = await PendingPair();

        var response = await Send(b, authA.User.Username);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Essa pessoa já te mandou um pedido. Aceite em Pendentes.", await Title(response));
    }

    [Fact]
    public async Task Pedido_para_quem_ja_e_amigo_devolve_409()
    {
        var (a, authA, b, authB, request) = await PendingPair();
        (await b.PostAsync($"/friends/requests/{request.Id}/accept", null)).EnsureSuccessStatusCode();

        var fromA = await Send(a, authB.User.Username);
        var fromB = await Send(b, authA.User.Username);

        Assert.Equal(HttpStatusCode.Conflict, fromA.StatusCode);
        Assert.Equal("Vocês já são amigos.", await Title(fromA));
        Assert.Equal("Vocês já são amigos.", await Title(fromB));
    }

    [Fact]
    public async Task Aceitar_so_vale_para_quem_recebeu()
    {
        var (a, _, b, authB, request) = await PendingPair();
        var (outsider, _) = await factory.CreateLoggedUserAsync();

        var bySender = await a.PostAsync($"/friends/requests/{request.Id}/accept", null);
        var byOutsider = await outsider.PostAsync($"/friends/requests/{request.Id}/accept", null);
        var byReceiver = await b.PostAsync($"/friends/requests/{request.Id}/accept", null);

        Assert.Equal(HttpStatusCode.NotFound, bySender.StatusCode);
        Assert.Equal("Pedido não encontrado.", await Title(bySender));
        Assert.Equal(HttpStatusCode.NotFound, byOutsider.StatusCode);
        Assert.Equal(HttpStatusCode.OK, byReceiver.StatusCode);
        var friend = (await byReceiver.Content.ReadFromJsonAsync<FriendDto>())!;
        Assert.NotEqual(authB.User.Username, friend.User.Username); // é a OUTRA pessoa
    }

    [Fact]
    public async Task Aceitar_pedido_inexistente_devolve_404()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();

        var response = await a.PostAsync($"/friends/requests/{Guid.NewGuid()}/accept", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Destinatario_recusa_e_o_pedido_some_dos_dois_lados()
    {
        var (a, _, b, _, request) = await PendingPair();

        Assert.Equal(HttpStatusCode.NoContent, (await b.DeleteAsync($"/friends/requests/{request.Id}")).StatusCode);

        Assert.Empty((await GetFriends(a)).Outgoing);
        Assert.Empty((await GetFriends(b)).Incoming);
    }

    [Fact]
    public async Task Remetente_cancela_o_pedido()
    {
        var (a, _, b, _, request) = await PendingPair();

        Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync($"/friends/requests/{request.Id}")).StatusCode);

        Assert.Empty((await GetFriends(a)).Outgoing);
        Assert.Empty((await GetFriends(b)).Incoming);
    }

    [Fact]
    public async Task Outro_usuario_nao_mexe_em_pedido_alheio()
    {
        var (a, _, _, _, request) = await PendingPair();
        var (outsider, _) = await factory.CreateLoggedUserAsync();

        var response = await outsider.DeleteAsync($"/friends/requests/{request.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Single((await GetFriends(a)).Outgoing);
    }

    [Fact]
    public async Task Recusado_pode_pedir_de_novo()
    {
        var (a, _, b, authB, request) = await PendingPair();
        (await b.DeleteAsync($"/friends/requests/{request.Id}")).EnsureSuccessStatusCode();

        var again = await Send(a, authB.User.Username);

        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    [Fact]
    public async Task Lista_mostra_pedidos_e_amigos_certos_para_cada_lado()
    {
        var (a, authA, b, authB, request) = await PendingPair();

        var beforeA = await GetFriends(a);
        var beforeB = await GetFriends(b);
        Assert.Equal(authB.User.Username, Assert.Single(beforeA.Outgoing).User.Username);
        Assert.Equal(authA.User.Username, Assert.Single(beforeB.Incoming).User.Username);
        Assert.Empty(beforeA.Friends);
        Assert.Empty(beforeB.Friends);

        (await b.PostAsync($"/friends/requests/{request.Id}/accept", null)).EnsureSuccessStatusCode();

        var afterA = await GetFriends(a);
        var afterB = await GetFriends(b);
        Assert.Equal(authB.User.Username, Assert.Single(afterA.Friends).User.Username);
        Assert.Equal(authA.User.Username, Assert.Single(afterB.Friends).User.Username);
        Assert.Equal("offline", afterA.Friends[0].Presence);
        Assert.Empty(afterA.Outgoing);
        Assert.Empty(afterB.Incoming);
    }

    [Fact]
    public async Task Desfazer_amizade_remove_dos_dois_lados_e_repetir_devolve_404()
    {
        var (a, authA, b, authB, request) = await PendingPair();
        (await b.PostAsync($"/friends/requests/{request.Id}/accept", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync($"/friends/{authB.User.Id}")).StatusCode);

        Assert.Empty((await GetFriends(a)).Friends);
        Assert.Empty((await GetFriends(b)).Friends);
        var again = await b.DeleteAsync($"/friends/{authA.User.Id}");
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
        Assert.Equal("Vocês não são amigos.", await Title(again));
    }

    [Fact]
    public async Task Desfazer_nao_apaga_pedido_pendente()
    {
        var (a, _, _, authB, _) = await PendingPair();

        var response = await a.DeleteAsync($"/friends/{authB.User.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Single((await GetFriends(a)).Outgoing);
    }

    [Fact]
    public async Task Rotas_de_amigos_exigem_login()
    {
        var anonymous = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/friends")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(anonymous, "alguem")).StatusCode);
    }
}

public class FriendRequestRateLimitTests
{
    [Fact]
    public async Task Muitos_pedidos_no_mesmo_minuto_devolvem_429()
    {
        using var factory = new ApiFactory { FriendRequestsPerMinute = 2 };
        var (client, _) = await factory.CreateLoggedUserAsync();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
            statuses.Add((await client.PostAsJsonAsync("/friends/requests", new SendFriendRequest("ninguem"))).StatusCode);

        Assert.Equal([HttpStatusCode.NotFound, HttpStatusCode.NotFound, HttpStatusCode.TooManyRequests], statuses);
    }
}
