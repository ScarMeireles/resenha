using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Resenha.Api.Friends;
using Resenha.Api.Realtime;
using static Resenha.Api.Tests.GroupTestHelpers;
using static Resenha.Api.Tests.LiveKitTestHelpers;

namespace Resenha.Api.Tests;

public class StatusTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private readonly List<HubConnection> _connections = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var connection in _connections) await connection.DisposeAsync();
    }

    private static async Task<string> PresenceSeenBy(HttpClient viewer) =>
        (await viewer.GetFromJsonAsync<FriendsResponse>("/friends"))!.Friends[0].Presence;

    private static Task<JsonElement> ExpectPresence(HubConnection connection, Guid userId, string presence) =>
        Expect<JsonElement>(connection, "presenceChanged",
            e => e.GetProperty("userId").GetGuid() == userId && e.GetProperty("presence").GetString() == presence);

    [Fact]
    public async Task Conta_nova_comeca_online()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var status = await client.GetFromJsonAsync<StatusDto>("/me/status");

        Assert.Equal("online", status!.Status);
    }

    [Fact]
    public async Task Status_invalido_da_400()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var response = await client.PutAsJsonAsync("/me/status", new StatusDto("ocupado"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Status_escolhido_fica_salvo()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        (await client.PutAsJsonAsync("/me/status", new StatusDto("away"))).EnsureSuccessStatusCode();

        Assert.Equal("away", (await client.GetFromJsonAsync<StatusDto>("/me/status"))!.Status);
    }

    [Fact]
    public async Task Amigos_veem_ausente_e_invisivel_aparece_offline()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var watcher = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, watcher, authB.User.Id);
        var connA = Connect(factory, authA.Token, _connections);
        var online = ExpectPresence(watcher, authA.User.Id, "online");
        await StartAndWait(factory, connA, authA.User.Id);
        await online;

        var away = ExpectPresence(watcher, authA.User.Id, "away");
        (await a.PutAsJsonAsync("/me/status", new StatusDto("away"))).EnsureSuccessStatusCode();
        await away;
        Assert.Equal("away", await PresenceSeenBy(b));

        var offline = ExpectPresence(watcher, authA.User.Id, "offline");
        (await a.PutAsJsonAsync("/me/status", new StatusDto("offline"))).EnsureSuccessStatusCode();
        await offline;
        Assert.Equal("offline", await PresenceSeenBy(b));
    }

    [Fact]
    public async Task Quem_conecta_invisivel_segue_offline_para_os_amigos()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        (await a.PutAsJsonAsync("/me/status", new StatusDto("offline"))).EnsureSuccessStatusCode();
        var watcher = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, watcher, authB.User.Id);

        await StartAndWait(factory, Connect(factory, authA.Token, _connections), authA.User.Id);

        Assert.Equal("offline", await PresenceSeenBy(b));
        var online = ExpectPresence(watcher, authA.User.Id, "online");
        (await a.PutAsJsonAsync("/me/status", new StatusDto("online"))).EnsureSuccessStatusCode();
        await online; // ao sair do invisível, os amigos são avisados
    }
}
