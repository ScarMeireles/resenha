using System.Net;
using System.Net.Http.Json;
using Resenha.Api.Groups;
using static Resenha.Api.Tests.GroupTestHelpers;

namespace Resenha.Api.Tests;

public class GroupsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Criar_sem_membros_deixa_so_o_dono()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();

        var group = await CreateGroup(a, "  Resenha  ");

        Assert.Equal("Resenha", group.Name);
        Assert.Equal(authA.User.Id, group.OwnerId);
        var member = Assert.Single(group.Members);
        Assert.True(member.IsOwner);
        Assert.Equal(authA.User.Id, member.User.Id);
    }

    [Fact]
    public async Task Criar_com_amigos_inclui_todos()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, authB) = await FriendOf(factory, a);
        var (_, authC) = await FriendOf(factory, a);

        var group = await CreateGroup(a, "Trio", authB.User.Id, authC.User.Id);

        Assert.Equal(3, group.Members.Length);
        Assert.Single(group.Members, m => m.IsOwner);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Nome_vazio_devolve_400_no_campo_name(string? name)
    {
        var (a, _) = await factory.CreateLoggedUserAsync();

        var response = await a.PostAsJsonAsync("/groups", new CreateGroupRequest(name, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"name\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Nome_grande_demais_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();

        var response = await a.PostAsJsonAsync("/groups", new CreateGroupRequest(new string('x', GroupRules.NameMaxLength + 1), null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Membro_que_nao_e_amigo_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (_, stranger) = await factory.CreateLoggedUserAsync();

        var response = await a.PostAsJsonAsync("/groups", new CreateGroupRequest("G", [stranger.User.Id]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Só dá para adicionar amigos.", await Title(response));
    }

    [Fact]
    public async Task Acima_do_limite_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var ids = new List<Guid>();
        for (var i = 0; i < GroupRules.MaxMembers; i++) // 10 amigos + o dono = 11
            ids.Add((await FriendOf(factory, a)).Auth.User.Id);

        var response = await a.PostAsJsonAsync("/groups", new CreateGroupRequest("G", ids.ToArray()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal($"O grupo pode ter no máximo {GroupRules.MaxMembers} pessoas.", await Title(response));
    }

    [Fact]
    public async Task Nao_membro_recebe_404_em_todas_as_rotas()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (outsider, outsiderAuth) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "Secreto");
        var message = await Send(a, group.Id, "oi");

        var responses = new[]
        {
            await outsider.GetAsync($"/groups/{group.Id}"),
            await outsider.PatchAsJsonAsync($"/groups/{group.Id}", new RenameGroupRequest("X")),
            await outsider.PostAsJsonAsync($"/groups/{group.Id}/members", new AddMembersRequest([])),
            await outsider.DeleteAsync($"/groups/{group.Id}/members/{outsiderAuth.User.Id}"),
            await outsider.GetAsync($"/groups/{group.Id}/messages"),
            await outsider.PostAsync($"/groups/{group.Id}/messages", MessageForm("oi")),
            await outsider.DeleteAsync($"/groups/{group.Id}/messages/{message.Id}"),
        };

        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("Grupo não encontrado.", await Title(response));
        }
    }

    [Fact]
    public async Task Lista_so_os_meus_grupos_com_o_de_mensagem_mais_recente_primeiro()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var first = await CreateGroup(a, "Primeiro");
        var second = await CreateGroup(a, "Segundo");
        await CreateGroup((await factory.CreateLoggedUserAsync()).Client, "De outro");

        Assert.Equal([second.Id, first.Id], (await a.GetFromJsonAsync<GroupDto[]>("/groups"))!.Select(g => g.Id));

        await Send(a, first.Id, "oi");

        Assert.Equal([first.Id, second.Id], (await a.GetFromJsonAsync<GroupDto[]>("/groups"))!.Select(g => g.Id));
    }

    [Fact]
    public async Task So_o_dono_renomeia()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "Antigo", authB.User.Id);

        var denied = await b.PatchAsJsonAsync($"/groups/{group.Id}", new RenameGroupRequest("Novo"));
        var ok = await a.PatchAsJsonAsync($"/groups/{group.Id}", new RenameGroupRequest(" Novo "));
        var invalid = await a.PatchAsJsonAsync($"/groups/{group.Id}", new RenameGroupRequest(""));

        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("Só quem é dono do grupo pode fazer isso.", await Title(denied));
        Assert.Equal("Novo", (await ok.Content.ReadFromJsonAsync<GroupDto>())!.Name);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Qualquer_membro_adiciona_so_amigos_dele_e_ignora_quem_ja_esta()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id);
        var (_, friendOfB) = await FriendOf(factory, b);
        var (_, friendOfA) = await FriendOf(factory, a); // amigo do dono, mas não de B

        var notMyFriend = await b.PostAsJsonAsync($"/groups/{group.Id}/members", new AddMembersRequest([friendOfA.User.Id]));
        var ok = await b.PostAsJsonAsync($"/groups/{group.Id}/members", new AddMembersRequest([friendOfB.User.Id, authB.User.Id]));

        Assert.Equal(HttpStatusCode.BadRequest, notMyFriend.StatusCode);
        Assert.Equal("Só dá para adicionar amigos.", await Title(notMyFriend));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(3, (await ok.Content.ReadFromJsonAsync<GroupDto>())!.Members.Length);
    }

    [Fact]
    public async Task Adicionar_alem_do_limite_devolve_400()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var ids = new List<Guid>();
        for (var i = 0; i < GroupRules.MaxMembers - 1; i++)
            ids.Add((await FriendOf(factory, a)).Auth.User.Id);
        var group = await CreateGroup(a, "Cheio", ids.ToArray());
        var (_, extra) = await FriendOf(factory, a);

        var response = await a.PostAsJsonAsync($"/groups/{group.Id}/members", new AddMembersRequest([extra.User.Id]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Membro_comum_sai_e_o_grupo_continua()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id);

        var response = await b.DeleteAsync($"/groups/{group.Id}/members/{authB.User.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Single((await a.GetFromJsonAsync<GroupDto>($"/groups/{group.Id}"))!.Members);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/groups/{group.Id}")).StatusCode);
    }

    [Fact]
    public async Task Dono_sai_e_o_membro_mais_antigo_vira_dono()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id);
        var (_, authC) = await FriendOf(factory, a);
        (await a.PostAsJsonAsync($"/groups/{group.Id}/members", new AddMembersRequest([authC.User.Id]))).EnsureSuccessStatusCode();

        (await a.DeleteAsync($"/groups/{group.Id}/members/{authA.User.Id}")).EnsureSuccessStatusCode();

        var after = (await b.GetFromJsonAsync<GroupDto>($"/groups/{group.Id}"))!;
        Assert.Equal(authB.User.Id, after.OwnerId);
        Assert.Equal(2, after.Members.Length);
    }

    [Fact]
    public async Task Ultimo_a_sair_apaga_o_grupo_e_as_imagens()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "G");
        var message = await Send(a, group.Id, "foto", Png());
        var url = message.Images[0].Url;
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync(url)).StatusCode);

        var response = await a.DeleteAsync($"/groups/{group.Id}/members/{authA.User.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/groups/{group.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync(url)).StatusCode);
        Assert.Empty((await a.GetFromJsonAsync<GroupDto[]>("/groups"))!);
    }

    [Fact]
    public async Task So_o_dono_remove_outro_membro()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (b, authB) = await FriendOf(factory, a);
        var (_, authC) = await FriendOf(factory, a);
        var group = await CreateGroup(a, "G", authB.User.Id, authC.User.Id);

        var denied = await b.DeleteAsync($"/groups/{group.Id}/members/{authC.User.Id}");
        var ok = await a.DeleteAsync($"/groups/{group.Id}/members/{authC.User.Id}");
        var gone = await a.DeleteAsync($"/groups/{group.Id}/members/{authC.User.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }
}
