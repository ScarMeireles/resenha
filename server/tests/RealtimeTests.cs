using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Resenha.Api.Auth;
using Resenha.Api.Friends;

namespace Resenha.Api.Tests;

public class RealtimeTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);
    private readonly List<HubConnection> _connections = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var connection in _connections) await connection.DisposeAsync();
    }

    private HubConnection CreateConnection(string? token)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "/hubs/app"), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
                options.AccessTokenProvider = () => Task.FromResult(token);
            })
            .Build();
        _connections.Add(connection);
        return connection;
    }

    /// <summary>Registra o ouvinte ANTES de conectar/agir, para não perder o evento.</summary>
    private static Task<T> Expect<T>(HubConnection connection, string eventName, Func<T, bool>? filter = null)
    {
        var source = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<T>(eventName, value =>
        {
            if (filter is null || filter(value)) source.TrySetResult(value);
        });
        return source.Task.WaitAsync(Timeout);
    }

    private static async Task<FriendRequestDto> SendRequest(HttpClient from, AuthResponse to)
    {
        var response = await from.PostAsJsonAsync("/friends/requests", new SendFriendRequest(to.User.Username));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<FriendRequestDto>())!;
    }

    private static async Task MakeFriends(HttpClient a, AuthResponse authB, HttpClient b)
    {
        var request = await SendRequest(a, authB);
        (await b.PostAsync($"/friends/requests/{request.Id}/accept", null)).EnsureSuccessStatusCode();
    }

    private static Task<FriendsResponse> GetFriends(HttpClient client) =>
        client.GetFromJsonAsync<FriendsResponse>("/friends")!;

    [Fact]
    public async Task Conexao_sem_token_e_recusada()
    {
        var connection = CreateConnection(null);

        await Assert.ThrowsAnyAsync<HttpRequestException>(() => connection.StartAsync());
    }

    [Fact]
    public async Task Destinatario_recebe_friendRequestReceived()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await factory.CreateLoggedUserAsync();
        var connection = CreateConnection(authB.Token);
        var received = Expect<FriendRequestDto>(connection, "friendRequestReceived");
        await connection.StartAsync();

        await SendRequest(a, authB);

        var request = await received;
        Assert.Equal(authA.User.Username, request.User.Username); // do ponto de vista de quem recebe
    }

    [Fact]
    public async Task Quem_enviou_recebe_friendAdded_quando_aceitam()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await factory.CreateLoggedUserAsync();
        var connection = CreateConnection(authA.Token);
        var added = Expect<FriendDto>(connection, "friendAdded");
        await connection.StartAsync();

        await MakeFriends(a, authB, b);

        var friend = await added;
        Assert.Equal(authB.User.Username, friend.User.Username);
    }

    [Fact]
    public async Task Recusar_avisa_quem_enviou_com_friendRequestRemoved()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await factory.CreateLoggedUserAsync();
        var connection = CreateConnection(authA.Token);
        var removed = Expect<JsonElement>(connection, "friendRequestRemoved");
        await connection.StartAsync();
        var request = await SendRequest(a, authB);

        (await b.DeleteAsync($"/friends/requests/{request.Id}")).EnsureSuccessStatusCode();

        Assert.Equal(request.Id, (await removed).GetProperty("requestId").GetGuid());
    }

    [Fact]
    public async Task Desfazer_amizade_avisa_a_outra_pessoa_com_friendRemoved()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await factory.CreateLoggedUserAsync();
        await MakeFriends(a, authB, b);
        var connection = CreateConnection(authB.Token);
        var removed = Expect<JsonElement>(connection, "friendRemoved");
        await connection.StartAsync();

        (await a.DeleteAsync($"/friends/{authB.User.Id}")).EnsureSuccessStatusCode();

        Assert.Equal(authA.User.Id, (await removed).GetProperty("userId").GetGuid());
    }

    [Fact]
    public async Task Amigo_recebe_presenceChanged_online_ao_conectar_e_offline_ao_desconectar()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await factory.CreateLoggedUserAsync();
        await MakeFriends(a, authB, b);

        var watcher = CreateConnection(authB.Token);
        var online = Expect<JsonElement>(watcher, "presenceChanged", e => e.GetProperty("presence").GetString() == "online");
        var offline = Expect<JsonElement>(watcher, "presenceChanged", e => e.GetProperty("presence").GetString() == "offline");
        await watcher.StartAsync();

        var other = CreateConnection(authA.Token);
        await other.StartAsync();
        Assert.Equal(authA.User.Id, (await online).GetProperty("userId").GetGuid());
        Assert.Equal("online", (await GetFriends(b)).Friends[0].Presence);

        await other.StopAsync();
        Assert.Equal(authA.User.Id, (await offline).GetProperty("userId").GetGuid());
        Assert.Equal("offline", (await GetFriends(b)).Friends[0].Presence);
    }
}
