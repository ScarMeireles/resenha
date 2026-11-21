using System.Net;
using System.Net.Http.Json;
using Resenha.Api.Chat;
using Resenha.Api.Groups;
using static Resenha.Api.Tests.GroupTestHelpers;

namespace Resenha.Api.Tests;

public class DirectMessagesTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static async Task<HttpResponseMessage> OpenRaw(HttpClient client, Guid userId) =>
        await client.PostAsJsonAsync("/dms", new OpenDirectConversationRequest(userId));

    private static async Task<DirectConversationDto> Open(HttpClient client, Guid userId)
    {
        var response = await OpenRaw(client, userId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DirectConversationDto>())!;
    }

    private static async Task<DirectMessageDto> SendDm(HttpClient client, Guid conversationId, string? text, params byte[][] images)
    {
        var response = await client.PostAsync($"/dms/{conversationId}/messages", MessageForm(text, images));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DirectMessageDto>())!;
    }

    private static Task<DirectMessageDto[]> Page(HttpClient client, Guid conversationId, string query = "") =>
        client.GetFromJsonAsync<DirectMessageDto[]>($"/dms/{conversationId}/messages{query}")!;

    [Fact]
    public async Task Amigos_abrem_a_mesma_conversa_dos_dois_lados()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);

        var first = await OpenRaw(a, authB.User.Id);
        var fromA = (await first.Content.ReadFromJsonAsync<DirectConversationDto>())!;
        var fromB = await Open(b, authA.User.Id);
        var again = await OpenRaw(a, authB.User.Id);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(fromA.Id, fromB.Id);
        Assert.Equal(authB.User.Id, fromA.User.Id); // User é sempre a outra pessoa
        Assert.Equal(authA.User.Id, fromB.User.Id);
        Assert.True(fromA.CanSend);
        Assert.Null(fromA.LastMessage);
    }

    [Fact]
    public async Task Nao_amigo_nao_abre_conversa()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await factory.CreateLoggedUserAsync();

        var response = await OpenRaw(a, authB.User.Id);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Só dá para conversar com amigos.", await Title(response));
    }

    [Fact]
    public async Task Id_inexistente_responde_igual_a_nao_amigo()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();

        var response = await OpenRaw(a, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Conversa_consigo_mesmo_devolve_400()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await OpenRaw(a, authA.User.Id)).StatusCode);
    }

    [Fact]
    public async Task Envia_texto_e_imagens_e_o_outro_le_paginado()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);

        var withImages = await SendDm(a, conversation.Id, "olha", Png(40, 20), Png(), Png(), Png());
        for (var i = 0; i < 3; i++)
        {
            await Task.Delay(5);
            await SendDm(b, conversation.Id, $"r{i}");
        }

        Assert.Equal(conversation.Id, withImages.ConversationId);
        Assert.Equal(authA.User.Id, withImages.Author.Id);
        Assert.Equal(4, withImages.Images.Length);
        Assert.All(withImages.Images, i => Assert.StartsWith("/media/chat/", i.Url));
        var latest = await Page(b, conversation.Id, "?limit=2");
        var older = await Page(b, conversation.Id, $"?before={latest[0].Id}&limit=2");
        Assert.Equal(["r1", "r2"], latest.Select(m => m.Text));
        Assert.Equal(["olha", "r0"], older.Select(m => m.Text));
    }

    [Fact]
    public async Task Mais_de_4_imagens_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);

        var response = await a.PostAsync($"/dms/{conversation.Id}/messages", MessageForm("x", Png(), Png(), Png(), Png(), Png()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Mensagem_vazia_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);

        var response = await a.PostAsync($"/dms/{conversation.Id}/messages", MessageForm("  "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ex_amigo_le_o_historico_mas_nao_envia_ate_voltarem_a_ser_amigos()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);
        await SendDm(a, conversation.Id, "antes");

        (await a.DeleteAsync($"/friends/{authB.User.Id}")).EnsureSuccessStatusCode();

        var blocked = await b.PostAsync($"/dms/{conversation.Id}/messages", MessageForm("depois"));
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
        Assert.Contains("só para leitura", await Title(blocked));
        Assert.Equal(HttpStatusCode.Forbidden, (await a.PostAsync($"/dms/{conversation.Id}/messages", MessageForm("x"))).StatusCode);
        Assert.Equal(["antes"], (await Page(b, conversation.Id)).Select(m => m.Text));
        var reopened = await Open(b, authA.User.Id); // conversa que já existia reabre, só para leitura
        Assert.Equal(conversation.Id, reopened.Id);
        Assert.False(reopened.CanSend);
        var listed = Assert.Single(await b.GetFromJsonAsync<DirectConversationDto[]>("/dms") ?? []);
        Assert.False(listed.CanSend);

        await MakeFriends(a, authB, b);

        Assert.Equal("de novo", (await SendDm(b, conversation.Id, "de novo")).Text);
        Assert.True((await Open(a, authB.User.Id)).CanSend);
    }

    [Fact]
    public async Task Terceiro_nao_le_nem_envia_nem_apaga_na_dm_dos_outros()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var (c, _) = await FriendOf(factory, a); // amigo de A, mas fora da conversa A-B
        var conversation = await Open(a, authB.User.Id);
        var sent = await SendDm(a, conversation.Id, "segredo");

        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/dms/{conversation.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/dms/{conversation.Id}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await c.PostAsync($"/dms/{conversation.Id}/messages", MessageForm("intruso"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.DeleteAsync($"/dms/{conversation.Id}/messages/{sent.Id}")).StatusCode);
        Assert.Empty(await c.GetFromJsonAsync<DirectConversationDto[]>("/dms") ?? []);
        Assert.Equal(["segredo"], (await Page(a, conversation.Id)).Select(m => m.Text)); // nada mudou
    }

    [Fact]
    public async Task Mensagem_de_dm_nao_aparece_por_rota_de_grupo()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);
        await SendDm(a, conversation.Id, "oi");

        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/groups/{conversation.Id}/messages")).StatusCode);
    }

    [Fact]
    public async Task Cada_um_apaga_so_a_propria_mensagem_que_vira_mensagem_apagada()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);
        var sent = await SendDm(a, conversation.Id, "apaga", Png());
        var imageUrl = sent.Images[0].Url;

        Assert.Equal(HttpStatusCode.Forbidden, (await b.DeleteAsync($"/dms/{conversation.Id}/messages/{sent.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync($"/dms/{conversation.Id}/messages/{sent.Id}")).StatusCode);

        var deleted = Assert.Single(await Page(b, conversation.Id));
        Assert.True(deleted.Deleted);
        Assert.Equal("", deleted.Text);
        Assert.Empty(deleted.Images);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync(imageUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.DeleteAsync($"/dms/{conversation.Id}/messages/{sent.Id}")).StatusCode);
    }

    [Fact]
    public async Task Lista_traz_so_conversas_com_mensagem_da_mais_recente_e_com_a_ultima_mensagem()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var (_, authC) = await FriendOf(factory, a);
        var (_, authD) = await FriendOf(factory, a);
        var withB = await Open(a, authB.User.Id);
        var withC = await Open(a, authC.User.Id);
        await Open(a, authD.User.Id); // aberta e sem mensagem: não aparece na lista
        await SendDm(a, withB.Id, "b1");
        await Task.Delay(5);
        await SendDm(a, withC.Id, "c1");
        await Task.Delay(5);
        await SendDm(a, withB.Id, "b2");

        var list = await a.GetFromJsonAsync<DirectConversationDto[]>("/dms") ?? [];

        Assert.Equal([withB.Id, withC.Id], list.Select(c => c.Id));
        Assert.Equal("b2", list[0].LastMessage?.Text);
        Assert.Equal(authB.User.Id, list[0].User.Id);
        Assert.Equal("c1", list[1].LastMessage?.Text);
    }

    [Fact]
    public async Task Resposta_nao_traz_dados_sensiveis()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var conversation = await Open(a, authB.User.Id);
        await SendDm(a, conversation.Id, "oi");

        var json = (await a.GetStringAsync("/dms")) + await a.GetStringAsync($"/dms/{conversation.Id}/messages");

        foreach (var forbidden in new[] { "password", "hash", "securityStamp", "ip", "status" })
            Assert.DoesNotContain($"\"{forbidden}", json, StringComparison.OrdinalIgnoreCase);
    }
}
