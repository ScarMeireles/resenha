using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Resenha.Api.Accounts;
using Resenha.Api.Calls;
using static Resenha.Api.Tests.GroupTestHelpers;
using static Resenha.Api.Tests.LiveKitTestHelpers;

namespace Resenha.Api.Tests;

public class CallTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private readonly List<HubConnection> _connections = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var connection in _connections) await connection.DisposeAsync();
    }

    private record Incoming(string Room, UserDto From);
    private record Signal(string Room, Guid UserId);

    [Fact]
    public async Task Ligar_para_quem_nao_e_amigo_da_404()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, stranger) = await factory.CreateLoggedUserAsync();

        var response = await a.PostAsync($"/calls/{stranger.User.Id}", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Ligar_para_amigo_offline_da_409()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, friend) = await FriendOf(factory, a);

        var response = await a.PostAsync($"/calls/{friend.User.Id}", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal($"{friend.User.DisplayName} está offline", await Title(response));
    }

    [Fact]
    public async Task Fluxo_ligar_atender_e_desligar()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var connA = Connect(factory, authA.Token, _connections);
        var connB = Connect(factory, authB.Token, _connections);
        var incoming = Expect<Incoming>(connB, "callIncoming");
        var accepted = Expect<Signal>(connA, "callAccepted");
        await StartAndWait(factory, connA, authA.User.Id);
        await StartAndWait(factory, connB, authB.User.Id);

        var call = await a.PostAsync($"/calls/{authB.User.Id}", null);

        call.EnsureSuccessStatusCode();
        var room = RoomNames.Direct(authA.User.Id, authB.User.Id);
        var join = (await call.Content.ReadFromJsonAsync<JoinRoomResponse>())!;
        Assert.Equal(room, join.Room);
        Assert.Equal(TestLiveKit.Url, join.Url);
        Assert.NotEmpty(join.Token);
        var ring = await incoming;
        Assert.Equal(room, ring.Room);
        Assert.Equal(authA.User.Id, ring.From.Id);
        Assert.Equal(authA.User.Username, ring.From.Username);

        var accept = await b.PostAsync($"/calls/{authA.User.Id}/accept", null);

        accept.EnsureSuccessStatusCode();
        Assert.Equal(room, (await accept.Content.ReadFromJsonAsync<JoinRoomResponse>())!.Room);
        var signal = await accepted;
        Assert.Equal(room, signal.Room);
        Assert.Equal(authB.User.Id, signal.UserId);

        var ended = Expect<Signal>(connB, "callEnded");
        Assert.Equal(HttpStatusCode.NoContent, (await a.PostAsync($"/calls/{authB.User.Id}/hangup", null)).StatusCode);
        Assert.Equal(authA.User.Id, (await ended).UserId);
    }

    [Fact]
    public async Task Recusar_avisa_quem_ligou()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var connA = Connect(factory, authA.Token, _connections);
        var connB = Connect(factory, authB.Token, _connections);
        var declined = Expect<Signal>(connA, "callDeclined");
        await StartAndWait(factory, connA, authA.User.Id);
        await StartAndWait(factory, connB, authB.User.Id);
        (await a.PostAsync($"/calls/{authB.User.Id}", null)).EnsureSuccessStatusCode();

        var response = await b.PostAsync($"/calls/{authA.User.Id}/decline", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(authB.User.Id, (await declined).UserId);
        // Depois de recusada, não dá mais para atender.
        Assert.Equal(HttpStatusCode.NotFound, (await b.PostAsync($"/calls/{authA.User.Id}/accept", null)).StatusCode);
    }

    [Fact]
    public async Task Cancelar_avisa_o_amigo()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var connA = Connect(factory, authA.Token, _connections);
        var connB = Connect(factory, authB.Token, _connections);
        var cancelled = Expect<Signal>(connB, "callCancelled");
        await StartAndWait(factory, connA, authA.User.Id);
        await StartAndWait(factory, connB, authB.User.Id);
        (await a.PostAsync($"/calls/{authB.User.Id}", null)).EnsureSuccessStatusCode();

        var response = await a.PostAsync($"/calls/{authB.User.Id}/cancel", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(authA.User.Id, (await cancelled).UserId);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PostAsync($"/calls/{authA.User.Id}/accept", null)).StatusCode);
    }

    [Fact]
    public async Task Atender_sem_ligacao_da_404()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);

        var response = await b.PostAsync($"/calls/{authA.User.Id}/accept", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Quem_ligou_nao_atende_a_propria_ligacao()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var connB = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, connB, authB.User.Id);
        (await a.PostAsync($"/calls/{authB.User.Id}", null)).EnsureSuccessStatusCode();

        var response = await a.PostAsync($"/calls/{authB.User.Id}/accept", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Sala_1a1_vazia_encerra_a_ligacao_no_webhook()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var connB = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, connB, authB.User.Id);
        (await a.PostAsync($"/calls/{authB.User.Id}", null)).EnsureSuccessStatusCode();
        (await b.PostAsync($"/calls/{authA.User.Id}/accept", null)).EnsureSuccessStatusCode();
        var room = RoomNames.Direct(authA.User.Id, authB.User.Id);
        var calls = factory.Services.GetRequiredService<CallTracker>();
        await Webhook(factory, "participant_joined", room, authA.User.Id);
        await Webhook(factory, "participant_joined", room, authB.User.Id);

        await Webhook(factory, "participant_left", room, authA.User.Id);
        Assert.NotNull(calls.Get(authA.User.Id, authB.User.Id)); // ainda tem gente na sala

        await Webhook(factory, "participant_left", room, authB.User.Id);
        Assert.Null(calls.Get(authA.User.Id, authB.User.Id));
    }
}
