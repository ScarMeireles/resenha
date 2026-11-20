using Resenha.Api.Calls;

namespace Resenha.Api.Tests;

public class DotEnvTests
{
    [Fact]
    public void Le_chave_valor_e_ignora_comentarios_e_linhas_vazias()
    {
        var content = "# comentário\r\n\r\nLIVEKIT_API_KEY=APIabc\r\n  LIVEKIT_API_SECRET = segredo=com=igual \n=sem-chave\nsem-igual\n";

        var values = DotEnv.Parse(content);

        Assert.Equal(2, values.Count);
        Assert.Equal("APIabc", values["LIVEKIT_API_KEY"]);
        Assert.Equal("segredo=com=igual", values["LIVEKIT_API_SECRET"]);
    }

    [Fact]
    public void Acha_infra_env_subindo_as_pastas()
    {
        var root = Path.Combine(Path.GetTempPath(), "resenha-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "infra"));
        Directory.CreateDirectory(Path.Combine(root, "server", "api"));
        try
        {
            File.WriteAllText(Path.Combine(root, "infra", ".env"), "A=1");

            Assert.Equal(Path.Combine(root, "infra", ".env"), DotEnv.FindInfraEnv(Path.Combine(root, "server", "api")));
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
