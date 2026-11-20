using System.Text.Json;
using Resenha.Api.Media;

namespace Resenha.Api.Tests;

/// <summary>
/// O app desktop valida o formulário com shared/account-rules.json antes de chamar a API.
/// Este teste garante que esse arquivo e as regras do servidor nunca fiquem diferentes.
/// </summary>
public class SharedRulesTests
{
    [Fact]
    public void Regras_compartilhadas_batem_com_as_do_servidor()
    {
        var path = Path.Combine(FindRepoRoot(), "shared", "account-rules.json");
        using var json = JsonDocument.Parse(File.ReadAllText(path));
        var rules = json.RootElement;

        Assert.Equal(AccountRules.UsernameMinLength, rules.GetProperty("usernameMinLength").GetInt32());
        Assert.Equal(AccountRules.UsernameMaxLength, rules.GetProperty("usernameMaxLength").GetInt32());
        Assert.Equal(AccountRules.DisplayNameMaxLength, rules.GetProperty("displayNameMaxLength").GetInt32());
        Assert.Equal(AccountRules.PasswordMinLength, rules.GetProperty("passwordMinLength").GetInt32());
        Assert.Equal(AccountRules.PasswordMaxLength, rules.GetProperty("passwordMaxLength").GetInt32());
        Assert.Equal(ImageProcessor.MaxUploadBytes, rules.GetProperty("maxImageBytes").GetInt64());

        // O padrão do @ é conferido pelo comportamento: o servidor precisa aceitar e recusar os mesmos exemplos.
        var pattern = new System.Text.RegularExpressions.Regex(rules.GetProperty("usernamePattern").GetString()!);
        foreach (var sample in new[] { "leo", "ana_souza", "bruno.22", "Leo", "ana-souza", "joão", "a b" })
            Assert.Equal(AccountRules.ValidateUsername(sample) is null, pattern.IsMatch(sample) && sample.Length >= 3);
    }

    private static string FindRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (Directory.Exists(Path.Combine(dir.FullName, "shared")) && Directory.Exists(Path.Combine(dir.FullName, "server")))
                return dir.FullName;
        throw new DirectoryNotFoundException("Não encontrei a raiz do repositório a partir de " + AppContext.BaseDirectory);
    }
}
