namespace Resenha.Api.Calls;

/// <summary>Leitor simples de arquivos .env (CHAVE=VALOR), usado só no desenvolvimento para reaproveitar o infra/.env.</summary>
public static class DotEnv
{
    /// <summary>Ignora linhas vazias e comentários (#). Não suporta aspas nem "export".</summary>
    public static Dictionary<string, string> Parse(string content)
    {
        var result = new Dictionary<string, string>();
        foreach (var raw in content.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            result[line[..eq].Trim()] = line[(eq + 1)..].Trim();
        }
        return result;
    }

    /// <summary>Sobe a partir de <paramref name="startDirectory"/> procurando infra/.env. Devolve null se não achar.</summary>
    public static string? FindInfraEnv(string startDirectory)
    {
        for (var dir = new DirectoryInfo(startDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "infra", ".env");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }
}
