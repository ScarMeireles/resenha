using System.Net;
using System.Net.Http.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Resenha.Api.Calls;
using static Resenha.Api.Tests.GroupTestHelpers;

namespace Resenha.Api.Tests;

public class VoiceTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Membro_recebe_token_da_sala_do_grupo()
    {
        var (a, authA) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "Voz");

        var response = await a.PostAsync($"/groups/{group.Id}/voice/token", null);

        response.EnsureSuccessStatusCode();
        var join = (await response.Content.ReadFromJsonAsync<JoinRoomResponse>())!;
        Assert.Equal(TestLiveKit.Url, join.Url);
        Assert.Equal(RoomNames.Group(group.Id), join.Room);
        var jwt = new JsonWebToken(join.Token);
        Assert.Equal(authA.User.Id.ToString(), jwt.Subject);
        Assert.Equal(TestLiveKit.ApiKey, jwt.Issuer);
    }

    [Fact]
    public async Task Quem_nao_e_membro_recebe_404_no_token_e_na_lista()
    {
        var (a, _) = await factory.CreateLoggedUserAsync();
        var (outsider, _) = await factory.CreateLoggedUserAsync();
        var group = await CreateGroup(a, "Voz");

        var token = await outsider.PostAsync($"/groups/{group.Id}/voice/token", null);
        var list = await outsider.GetAsync($"/groups/{group.Id}/voice");

        Assert.Equal(HttpStatusCode.NotFound, token.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
    }

    [Fact]
    public async Task Sem_login_recebe_401()
    {
        var response = await factory.CreateClient().PostAsync($"/groups/{Guid.NewGuid()}/voice/token", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
