using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Resenha.Api.Friends;
using static Resenha.Api.Tests.GroupTestHelpers;
using static Resenha.Api.Tests.LiveKitTestHelpers;

namespace Resenha.Api.Tests;

public class LiveKitWebhookTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private readonly List<HubConnection> _connections = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var connection in _connections) await connection.DisposeAsync();
    }

    private record VoiceUsers(Guid[] UserIds);
    private record VoiceEvent(Guid GroupId, Guid[] UserIds);
    private record PresenceEvent(Guid UserId, string Presence);

    [Fact]
    public async Task Assinatura_errada_ou_ausente_e_recusada()
    {
        var client = factory.CreateClient();
        var body = WebhookBody("participant_joined", RoomNames(Guid.NewGuid()), Guid.NewGuid());

        var wrongSecret = await PostWebhook(client, body, SignWebhook(body, secret: "outro-segredo-qualquer-com-mais-de-32-caracteres"));
        var wrongKey = await PostWebhook(client, body, SignWebhook(body, apiKey: "outraChave"));
        var otherBody = await PostWebhook(client, body, SignWebhook(body + " "));
        var none = await client.PostAsync("/livekit/webhook", new StringContent(body));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongSecret.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongKey.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, otherBody.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
    }

    [Fact]
    public async Task Evento_desconhecido_e_ignorado_com_200()
    {
        var body = WebhookBody("track_published", RoomNames(Guid.NewGuid()), Guid.NewGuid());

        var response = await PostWebhook(factory.CreateClient(), body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Entrar_e_sair_atualiza_a_lista_e_a_presenca()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "Voz", authB.User.Id);
        var room = RoomNames(group.Id);

        Assert.Empty((await a.GetFromJsonAsync<VoiceUsers>($"/groups/{group.Id}/voice"))!.UserIds);

        var connection = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, connection, authB.User.Id);
        await StartAndWait(factory, Connect(factory, authA.Token, _connections), authA.User.Id); // quem está em chamada precisa estar online
        var inCall = Expect<PresenceEvent>(connection, "presenceChanged", e => e.UserId == authA.User.Id && e.Presence == "in-call");
        await Webhook(factory, "participant_joined", room, authA.User.Id);
        await inCall;

        Assert.Equal([authA.User.Id], (await b.GetFromJsonAsync<VoiceUsers>($"/groups/{group.Id}/voice"))!.UserIds);

        var back = Expect<PresenceEvent>(connection, "presenceChanged", e => e.UserId == authA.User.Id && e.Presence == "online");
        await Webhook(factory, "participant_left", room, authA.User.Id);
        await back; // sair da chamada volta a "online"

        Assert.Empty((await b.GetFromJsonAsync<VoiceUsers>($"/groups/{group.Id}/voice"))!.UserIds);
    }

    [Fact]
    public async Task Lista_de_amigos_mostra_in_call_para_quem_esta_online_em_chamada()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var connection = Connect(factory, authB.Token, _connections);
        await StartAndWait(factory, connection, authB.User.Id);

        await Webhook(factory, "participant_joined", Api.Calls.RoomNames.Direct(authA.User.Id, authB.User.Id), authB.User.Id);

        var friends = (await a.GetFromJsonAsync<FriendsResponse>("/friends"))!;
        Assert.Equal("in-call", friends.Friends.Single().Presence);
    }

    [Fact]
    public async Task Membros_recebem_voiceParticipants_pelo_signalr()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "Voz", authB.User.Id);
        var connection = Connect(factory, authB.Token, _connections);
        var joined = Expect<VoiceEvent>(connection, "voiceParticipants", e => e.GroupId == group.Id && e.UserIds.Length == 1);
        await StartAndWait(factory, connection, authB.User.Id);

        await Webhook(factory, "participant_joined", RoomNames(group.Id), authA.User.Id);

        Assert.Equal([authA.User.Id], (await joined).UserIds);

        var left = Expect<VoiceEvent>(connection, "voiceParticipants", e => e.GroupId == group.Id && e.UserIds.Length == 0);
        await Webhook(factory, "participant_left", RoomNames(group.Id), authA.User.Id);
        await left;
    }

    [Fact]
    public async Task Sala_encerrada_tira_todos()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "Voz", authB.User.Id);
        await Webhook(factory, "participant_joined", RoomNames(group.Id), authA.User.Id);
        await Webhook(factory, "participant_joined", RoomNames(group.Id), authB.User.Id);

        await Webhook(factory, "room_finished", RoomNames(group.Id));

        Assert.Empty((await a.GetFromJsonAsync<VoiceUsers>($"/groups/{group.Id}/voice"))!.UserIds);
    }

    private static string RoomNames(Guid groupId) => Api.Calls.RoomNames.Group(groupId);
}
