using System.Diagnostics;

namespace Resenha.Api.Tests;

/// <summary>
/// Protege contra um erro que já aconteceu: no Windows "data/" e "Data/" são a mesma pasta,
/// e uma regra do .gitignore escondeu código-fonte do Git sem ninguém perceber.
/// </summary>
public class RepositoryHygieneTests
{
    private static readonly string[] SourceExtensions = [".cs", ".csproj", ".slnx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".ps1", ".md"];

    // Arquivos que DEVEM ficar fora do Git (segredos e saídas de build).
    private static readonly string[] AllowedIgnored = ["appsettings.Development.json", "/bin/", "/obj/", "/node_modules/", "/.data/", "/dist/", "/out/", "/release/"];

    [Fact]
    public void Nenhum_arquivo_de_codigo_fica_escondido_pelo_gitignore()
    {
        var repoRoot = Git("rev-parse --show-toplevel", AppContext.BaseDirectory).Trim();
        var ignored = Git("ls-files --others --ignored --exclude-standard", repoRoot)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(path => "/" + path)
            .Where(path => SourceExtensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
            .Where(path => !AllowedIgnored.Any(allowed => path.Contains(allowed, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        Assert.True(ignored.Count == 0, "Arquivos de código ignorados pelo Git:\n" + string.Join("\n", ignored));
    }

    private static string Git(string arguments, string workingDirectory)
    {
        var start = new ProcessStartInfo("git", arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        Assert.Equal(0, process.ExitCode);
        return output;
    }
}
