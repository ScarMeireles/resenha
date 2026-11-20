namespace Resenha.Api.Media;

/// <summary>Guarda as imagens no disco, em {raiz}/avatars, {raiz}/banners e {raiz}/chat.</summary>
public class MediaStorage(string root)
{
    public string Root { get; } = root;

    /// <summary>Salva com nome aleatório. Um nome novo a cada envio mantém o cache do app sempre correto.</summary>
    public async Task<string> SaveAsync(MediaKind kind, byte[] webp, CancellationToken ct = default)
    {
        var fileName = $"{Guid.NewGuid():N}.webp";
        var folder = Path.Combine(Root, kind.Folder());
        Directory.CreateDirectory(folder);
        await File.WriteAllBytesAsync(Path.Combine(folder, fileName), webp, ct);
        return fileName;
    }

    public void Delete(MediaKind kind, string? fileName)
    {
        if (string.IsNullOrEmpty(fileName)) return;
        // Path.GetFileName impede que um nome com "../" apague algo fora da pasta.
        var path = Path.Combine(Root, kind.Folder(), Path.GetFileName(fileName));
        if (File.Exists(path)) File.Delete(path);
    }
}
