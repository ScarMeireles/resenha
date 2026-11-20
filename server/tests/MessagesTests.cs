using System.Net;
using System.Net.Http.Json;
using ImageMagick;
using Resenha.Api.Groups;
using static Resenha.Api.Tests.GroupTestHelpers;

namespace Resenha.Api.Tests;

public class MessagesTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static Task<MessageDto[]> Page(HttpClient client, Guid groupId, string query = "") =>
        client.GetFromJsonAsync<MessageDto[]>($"/groups/{groupId}/messages{query}")!;

    [Fact]
    public async Task Paginacao_devolve_em_ordem_cronologica_antes_do_cursor()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");
        var sent = new List<MessageDto>();
        for (var i = 0; i < 5; i++)
        {
            sent.Add(await Send(a, group.Id, $"m{i}"));
            await Task.Delay(5);
        }

        var latest = await Page(a, group.Id, "?limit=2");
        var older = await Page(a, group.Id, $"?before={latest[0].Id}&limit=2");
        var all = await Page(a, group.Id);

        Assert.Equal(["m3", "m4"], latest.Select(m => m.Text));
        Assert.Equal(["m1", "m2"], older.Select(m => m.Text));
        Assert.Equal(sent.Select(m => m.Id), all.Select(m => m.Id));
    }

    [Fact]
    public async Task Mensagem_vazia_sem_imagem_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var response = await a.PostAsync($"/groups/{group.Id}/messages", MessageForm("   "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Texto_grande_demais_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var response = await a.PostAsync($"/groups/{group.Id}/messages", MessageForm(new string('x', GroupRules.MessageMaxLength + 1)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Mensagem_so_com_imagem_vira_webp_com_dimensoes()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var message = await Send(a, group.Id, null, Png(40, 20));

        Assert.Equal(authA.User.Id, message.Author.Id);
        Assert.Equal("", message.Text);
        var image = Assert.Single(message.Images);
        Assert.StartsWith("/media/chat/", image.Url);
        Assert.EndsWith(".webp", image.Url);
        Assert.Equal((40, 20), (image.Width, image.Height));
        using var saved = new MagickImage(await a.GetByteArrayAsync(image.Url));
        Assert.Equal(MagickFormat.WebP, saved.Format);
        Assert.Equal((40u, 20u), (saved.Width, saved.Height));
    }

    [Fact]
    public async Task Imagem_grande_e_reduzida_para_1920_sem_ampliar_as_pequenas()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var message = await Send(a, group.Id, "x", Png(3000, 1500), Png(100, 50));

        Assert.Equal((1920, 960), (message.Images[0].Width, message.Images[0].Height));
        Assert.Equal((100, 50), (message.Images[1].Width, message.Images[1].Height));
    }

    [Fact]
    public async Task Cinco_imagens_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var response = await a.PostAsync($"/groups/{group.Id}/messages",
            MessageForm("x", Png(), Png(), Png(), Png(), Png()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Arquivo_que_nao_e_imagem_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        var response = await a.PostAsync($"/groups/{group.Id}/messages", MessageForm("x", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Autor_apaga_a_mensagem_e_o_arquivo_some()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");
        var message = await Send(a, group.Id, "segredo", Png());
        var url = message.Images[0].Url;

        var response = await a.DeleteAsync($"/groups/{group.Id}/messages/{message.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var shown = Assert.Single(await Page(a, group.Id));
        Assert.True(shown.Deleted);
        Assert.Equal("", shown.Text);
        Assert.Empty(shown.Images);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Outro_membro_nao_apaga_e_apagar_duas_vezes_devolve_404()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id);
        var message = await Send(a, group.Id, "oi");

        var denied = await b.DeleteAsync($"/groups/{group.Id}/messages/{message.Id}");
        var ok = await a.DeleteAsync($"/groups/{group.Id}/messages/{message.Id}");
        var again = await a.DeleteAsync($"/groups/{group.Id}/messages/{message.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("Só quem escreveu pode apagar a mensagem.", await Title(denied));
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
        Assert.Equal("Mensagem não encontrada.", await Title(again));
    }

    [Fact]
    public async Task Limite_de_mensagens_por_minuto_devolve_429()
    {
        using var limited = new ApiFactory { MessagesPerMinute = 2 };
        var (a, _) = await limited.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");

        await Send(a, group.Id, "1");
        await Send(a, group.Id, "2");
        var third = await a.PostAsync($"/groups/{group.Id}/messages", MessageForm("3"));

        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }
}
