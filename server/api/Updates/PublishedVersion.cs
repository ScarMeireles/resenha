namespace Resenha.Api.Updates;

/// <summary>
/// Versão mais nova publicada: a que está no latest.yml da pasta de atualizações (gerado pelo electron-builder e
/// copiado pelo scripts/publicar-versao.mjs). Relê o arquivo só quando ele muda, então publicar não exige reiniciar a API.
/// Sem latest.yml (ou com um inválido) não há versão publicada e nada é bloqueado.
/// </summary>
public class PublishedVersion(UpdatesFolder folder)
{
    private readonly Lock _lock = new();
    private DateTime _readAt = DateTime.MinValue;
    private AppVersion? _cached;

    public AppVersion? Current
    {
        get
        {
            var file = Path.Combine(folder.Path, "latest.yml");
            var stamp = File.Exists(file) ? File.GetLastWriteTimeUtc(file) : DateTime.MinValue;
            lock (_lock)
            {
                if (stamp == _readAt) return _cached;
                if (stamp == DateTime.MinValue) _cached = null;
                else if (TryRead(file, out var content)) _cached = ParseLatestYml(content);
                else return _cached; // arquivo sendo copiado agora: mantém o anterior e lê de novo na próxima requisição
                _readAt = stamp;
                return _cached;
            }
        }
    }

    /// <summary>Lê a linha "version: x.y.z" do latest.yml. Exposta para teste.</summary>
    public static AppVersion? ParseLatestYml(string content)
    {
        foreach (var raw in content.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            if (!line.StartsWith("version:", StringComparison.Ordinal)) continue; // só a chave do topo (sem recuo)
            var value = line["version:".Length..].Trim().Trim('\'', '"');
            return AppVersion.TryParse(value, out var version) ? version : null;
        }
        return null;
    }

    private static bool TryRead(string file, out string content)
    {
        try
        {
            content = File.ReadAllText(file);
            return true;
        }
        catch (IOException)
        {
            content = "";
            return false;
        }
    }
}

/// <summary>Pasta onde ficam latest.yml, instalador e .blockmap (fora do Git).</summary>
public record UpdatesFolder(string Path);
