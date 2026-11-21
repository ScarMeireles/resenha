using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Resenha.Api.Auth;
using Resenha.Api.Updates;

namespace Resenha.Api.Tests;

/// <summary>Atualização obrigatória (R13): app mais velho que a versão publicada é barrado com 426.</summary>
public class UpdateTests
{
    private const string Header = UpdateEndpoints.VersionHeader;

    /// <summary>Sobe uma API nova e, se pedido, "publica" uma versão (latest.yml + instalador na pasta de atualizações).</summary>
    private static ApiFactory StartApi(string? published = null)
    {
        var factory = new ApiFactory();
        factory.CreateClient().Dispose(); // sobe o servidor, que cria a pasta
        if (published is not null)
        {
            var folder = Path.Combine(factory.DataRoot, "updates");
            File.WriteAllText(Path.Combine(folder, $"Resenha-Setup-{published}.exe"), "instalador falso");
            File.WriteAllText(Path.Combine(folder, $"Resenha-Setup-{published}.exe.blockmap"), "0123456789");
            File.WriteAllText(Path.Combine(folder, "notas.txt"), "não deve ser servido");
            File.WriteAllText(Path.Combine(folder, "latest.yml"),
                $"version: {published}\nfiles:\n  - url: Resenha-Setup-{published}.exe\n    version: 9.9.9\npath: Resenha-Setup-{published}.exe\n");
        }
        return factory;
    }

    private static HttpClient Client(ApiFactory factory, string? version)
    {
        var client = factory.CreateClient();
        if (version is not null) client.DefaultRequestHeaders.Add(Header, version);
        return client;
    }

    private static Task<HttpResponseMessage> Register(HttpClient client) =>
        client.PostAsJsonAsync("/auth/register", new RegisterRequest($"u{Guid.NewGuid().ToString("N")[..10]}", "Pessoa", "Senha!1"));

    [Theory]
    [InlineData(null)]
    [InlineData("0.0.1")]
    public async Task Sem_versao_publicada_nada_e_bloqueado(string? version)
    {
        using var factory = StartApi();
        var client = Client(factory, version);

        Assert.Equal(HttpStatusCode.Created, (await Register(client)).StatusCode);
        var dto = await client.GetFromJsonAsync<VersionDto>("/version");
        Assert.Null(dto!.Version);
    }

    [Theory]
    [InlineData(null)]          // app anterior a este sistema, navegador ou curl
    [InlineData("0.1.9")]
    [InlineData("0.2.0-beta.1")]
    [InlineData("isso-nao-e-versao")]
    public async Task Versao_menor_que_a_publicada_recebe_426(string? version)
    {
        using var factory = StartApi("0.2.0");

        var response = await Register(Client(factory, version));

        Assert.Equal(HttpStatusCode.UpgradeRequired, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("versão nova do Resenha (0.2.0)", problem.GetProperty("title").GetString());
        Assert.Equal("0.2.0", problem.GetProperty("latestVersion").GetString());
    }

    [Theory]
    [InlineData("0.2.0")]
    [InlineData("0.3.0")]
    public async Task Versao_igual_ou_maior_passa(string version)
    {
        using var factory = StartApi("0.2.0");

        Assert.Equal(HttpStatusCode.Created, (await Register(Client(factory, version))).StatusCode);
    }

    [Fact]
    public async Task Resposta_426_sai_com_cors_para_o_app_conseguir_ler()
    {
        using var factory = StartApi("0.2.0");
        var request = new HttpRequestMessage(HttpMethod.Get, "/friends");
        request.Headers.Add("Origin", "null");
        request.Headers.Add(Header, "0.1.0");

        var response = await factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.UpgradeRequired, response.StatusCode);
        Assert.Equal("*", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Preflight_com_o_cabecalho_de_versao_e_liberado()
    {
        using var factory = StartApi("0.2.0");
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/login");
        request.Headers.Add("Origin", "null");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,x-resenha-version");

        var response = await factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Atualizacao_e_versao_funcionam_sem_login_mesmo_com_app_desatualizado()
    {
        using var factory = StartApi("0.2.0");
        var client = Client(factory, "0.1.0");

        var yml = await client.GetAsync("/updates/latest.yml");
        Assert.Equal(HttpStatusCode.OK, yml.StatusCode);
        Assert.Equal("text/yaml", yml.Content.Headers.ContentType!.MediaType);
        Assert.True(yml.Headers.CacheControl!.NoCache);
        Assert.StartsWith("version: 0.2.0", await yml.Content.ReadAsStringAsync());

        var installer = await client.GetAsync("/updates/Resenha-Setup-0.2.0.exe");
        Assert.Equal(HttpStatusCode.OK, installer.StatusCode);
        Assert.Equal("application/octet-stream", installer.Content.Headers.ContentType!.MediaType);

        Assert.Equal("0.2.0", (await client.GetFromJsonAsync<VersionDto>("/version"))!.Version);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Download_em_partes_funciona_para_a_atualizacao_diferencial()
    {
        using var factory = StartApi("0.2.0");
        var request = new HttpRequestMessage(HttpMethod.Get, "/updates/Resenha-Setup-0.2.0.exe.blockmap");
        request.Headers.Range = new RangeHeaderValue(2, 4);

        var response = await factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal("234", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/updates/")]          // não lista a pasta
    [InlineData("/updates/notas.txt")] // só latest.yml, .exe e .blockmap são servidos
    [InlineData("/updates/../resenha.db")]
    public async Task Pasta_de_atualizacoes_nao_expoe_outros_arquivos(string path)
    {
        using var factory = StartApi("0.2.0");

        var response = await Client(factory, "0.2.0").GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SignalR_manda_a_versao_pela_url_e_app_antigo_e_barrado()
    {
        using var factory = StartApi("0.2.0");
        var client = factory.CreateClient();

        var old = await client.PostAsync($"/hubs/app/negotiate?negotiateVersion=1&{UpdateEndpoints.VersionQuery}=0.1.0", null);
        Assert.Equal(HttpStatusCode.UpgradeRequired, old.StatusCode);

        // Versão em dia passa do bloqueio e cai no login (sem token = 401).
        var current = await client.PostAsync($"/hubs/app/negotiate?negotiateVersion=1&{UpdateEndpoints.VersionQuery}=0.2.0", null);
        Assert.Equal(HttpStatusCode.Unauthorized, current.StatusCode);

        // A versão pela URL só vale para o SignalR.
        var elsewhere = await client.GetAsync($"/friends?{UpdateEndpoints.VersionQuery}=0.2.0");
        Assert.Equal(HttpStatusCode.UpgradeRequired, elsewhere.StatusCode);
    }

    [Fact]
    public async Task Publicar_versao_nova_vale_sem_reiniciar_a_api()
    {
        using var factory = StartApi("0.2.0");
        var client = Client(factory, "0.2.0");
        Assert.Equal(HttpStatusCode.Created, (await Register(client)).StatusCode);

        var latest = Path.Combine(factory.DataRoot, "updates", "latest.yml");
        File.WriteAllText(latest, "version: 0.2.1\n");
        File.SetLastWriteTimeUtc(latest, DateTime.UtcNow.AddMinutes(1)); // garante carimbo diferente

        Assert.Equal(HttpStatusCode.UpgradeRequired, (await Register(client)).StatusCode);
    }

    [Theory]
    [InlineData("0.1.0", "0.1.1", true)]
    [InlineData("0.9.9", "0.10.0", true)]   // número, não texto
    [InlineData("1.0.0-beta.1", "1.0.0", true)]
    [InlineData("1.0.0", "1.0.0", false)]
    [InlineData("v1.0.0", "1.0.0", false)]
    [InlineData("1.0.0+build.5", "1.0.0", false)]
    [InlineData("2.0.0", "1.9.9", false)]
    [InlineData("1.0", "1.0.0", true)]       // inválido conta como desatualizado
    [InlineData("", "1.0.0", true)]
    public void Comparacao_de_versoes(string client, string latest, bool outdated)
    {
        Assert.True(AppVersion.TryParse(latest, out var published));
        Assert.Equal(outdated, UpdateEndpoints.IsOutdated(client, published));
    }

    [Theory]
    [InlineData("version: 0.2.0\nfiles: []\n", "0.2.0")]
    [InlineData("version: '1.2.3'\r\npath: x.exe\r\n", "1.2.3")]
    [InlineData("files:\n  - url: a.exe\n    version: 9.9.9\n", null)] // só a chave do topo vale
    [InlineData("version: lixo\n", null)]
    public void Le_a_versao_do_latest_yml(string content, string? expected)
    {
        Assert.Equal(expected, PublishedVersion.ParseLatestYml(content)?.ToString());
    }
}
