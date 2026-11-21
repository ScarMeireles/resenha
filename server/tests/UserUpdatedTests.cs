using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;

namespace Resenha.Api.Tests;

/// <summary>Evento "userUpdated": quem conhece a pessoa recebe o UserDto novo; estranho não recebe nada.</summary>
public class UserUpdatedTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);
    private readonly List<HubConnection> _connections = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var connection in _connections) await connection.DisposeAsync();
    }

    private async Task<HubConnection> Connect(string token)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "/hubs/app"), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();
        _connections.Add(connection);
        return connection;
    }

    /// <summary>Guarda todos os "userUpdated" que chegarem nessa conexão.</summary>
    private static List<JsonElement> Collect(HubConnection connection)
    {
        var received = new List<JsonElement>();
        connection.On<JsonElement>("userUpdated", e => { lock (received) received.Add(e); });
        return received;
    }

    private static Task<JsonElement> Expect(HubConnection connection, Func<JsonElement, bool> filter)
    {
        var source = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<JsonElement>("userUpdated", e => { if (filter(e)) source.TrySetResult(e); });
        return source.Task.WaitAsync(Timeout);
    }

    private static MultipartFormDataContent Image()
    {
        var content = new ByteArrayContent(GroupTestHelpers.Png(64, 64));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return new MultipartFormDataContent { { content, "file", "imagem" } };
    }

    [Fact]
    public async Task Amigo_membro_de_grupo_e_a_propria_pessoa_recebem_a_troca_de_nome_e_estranho_nao()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await GroupTestHelpers.FriendOf(factory, a);   // amigo
        var (c, authC) = await GroupTestHelpers.FriendOf(factory, b);   // só divide grupo com A
        var (_, authStranger) = await factory.CreateLoggedUserAsync(); // não conhece A
        await GroupTestHelpers.CreateGroup(b, "G", authA.User.Id, authC.User.Id);

        var friend = await Connect(authB.Token);
        var groupMate = await Connect(authC.Token);
        var self = await Connect(authA.Token); // outra janela de A
        var stranger = await Connect(authStranger.Token);
        bool IsA(JsonElement e) => e.GetProperty("id").GetGuid() == authA.User.Id && e.GetProperty("displayName").GetString() == "Nome Novo";
        var toFriend = Expect(friend, IsA);
        var toGroupMate = Expect(groupMate, IsA);
        var toSelf = Expect(self, IsA);
        var leaked = Collect(stranger);
        await Task.WhenAll(friend.StartAsync(), groupMate.StartAsync(), self.StartAsync(), stranger.StartAsync());

        (await a.PatchAsJsonAsync("/me", new UpdateMeRequest("Nome Novo"))).EnsureSuccessStatusCode();

        var payload = await toFriend;
        await toGroupMate;
        await toSelf;
        // Só os campos públicos do UserDto: nada de senha, carimbo de segurança ou IP.
        Assert.Equal(["avatarUrl", "bannerUrl", "displayName", "id", "username"],
            payload.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal));
        await Task.Delay(500);
        Assert.Empty(leaked);
    }

    [Fact]
    public async Task Trocar_foto_banner_e_arroba_avisa_o_amigo()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await GroupTestHelpers.FriendOf(factory, a);
        var friend = await Connect(authB.Token);
        var events = Collect(friend);
        await friend.StartAsync();
        var newName = $"novo_{Guid.NewGuid().ToString("N")[..8]}";

        (await a.PutAsync("/me/avatar", Image())).EnsureSuccessStatusCode();
        (await a.PutAsync("/me/banner", Image())).EnsureSuccessStatusCode();
        (await a.DeleteAsync("/me/banner")).EnsureSuccessStatusCode();
        (await a.PutAsJsonAsync("/me/username", new ChangeUsernameRequest(newName))).EnsureSuccessStatusCode();

        var deadline = DateTime.UtcNow + Timeout;
        while (DateTime.UtcNow < deadline && Count() < 4) await Task.Delay(50);
        int Count() { lock (events) return events.Count; }

        lock (events)
        {
            Assert.Equal(4, events.Count);
            Assert.All(events, e => Assert.Equal(authA.User.Id, e.GetProperty("id").GetGuid()));
            Assert.NotEqual(JsonValueKind.Null, events[0].GetProperty("avatarUrl").ValueKind);
            Assert.NotEqual(JsonValueKind.Null, events[1].GetProperty("bannerUrl").ValueKind);
            Assert.Equal(JsonValueKind.Null, events[2].GetProperty("bannerUrl").ValueKind);
            Assert.Equal(newName, events[3].GetProperty("username").GetString());
        }
    }

    [Fact]
    public async Task Nada_muda_nada_e_enviado()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await GroupTestHelpers.FriendOf(factory, a);
        var friend = await Connect(authB.Token);
        var events = Collect(friend);
        await friend.StartAsync();

        // Mesmo nome, mesmo @ e remover um banner que não existe: nada mudou, ninguém é avisado.
        (await a.PatchAsJsonAsync("/me", new UpdateMeRequest(authA.User.DisplayName))).EnsureSuccessStatusCode();
        (await a.PutAsJsonAsync("/me/username", new ChangeUsernameRequest(authA.User.Username))).EnsureSuccessStatusCode();
        (await a.DeleteAsync("/me/banner")).EnsureSuccessStatusCode();
        await Task.Delay(500);

        lock (events) Assert.Empty(events);
    }
}
