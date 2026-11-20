using ImageMagick;

namespace Resenha.Api.Media;

public enum MediaKind { Avatar, Banner }

public static class MediaKindExtensions
{
    public static string Folder(this MediaKind kind) => kind == MediaKind.Avatar ? "avatars" : "banners";

    /// <summary>Tamanho final salvo (largura, altura). Avatar quadrado; banner 3:1.</summary>
    public static (uint Width, uint Height) TargetSize(this MediaKind kind) =>
        kind == MediaKind.Avatar ? (256u, 256u) : (960u, 320u);
}

public class InvalidImageException(string message) : Exception(message);

/// <summary>
/// Converte o que a pessoa enviou (JPG, PNG, GIF ou WebP, animado ou não) num WebP
/// recortado no tamanho certo. Animações são mantidas.
/// </summary>
public class ImageProcessor
{
    public const long MaxUploadBytes = 10 * 1024 * 1024;

    // Limites técnicos contra "bomba de descompressão" (arquivo pequeno que vira gigabytes de pixels na memória).
    private const uint MaxSourceSide = 4096;
    private const int MaxFrames = 300;
    private const long MaxTotalPixels = 60_000_000; // soma de todos os quadros: ~240 MB de RAM no pior caso

    // WebP com perda, qualidade 82: nesse tamanho fica indistinguível do original e
    // de 5 a 10x menor que PNG/GIF. Suporta transparência e animação.
    private const uint WebpQuality = 82;

    static ImageProcessor()
    {
        // Rede de segurança global do ImageMagick, além das checagens abaixo.
        ResourceLimits.Width = MaxSourceSide * 2;
        ResourceLimits.Height = MaxSourceSide * 2;
        ResourceLimits.ListLength = MaxFrames;
    }

    public async Task<byte[]> ToWebpAsync(Stream input, MediaKind kind, CancellationToken ct = default)
    {
        // O formato é decidido pelos primeiros bytes do arquivo, nunca pelo nome ou pelo que o app disse.
        // Assim o ImageMagick só abre estes quatro formatos (ele sabe abrir dezenas, inclusive alguns perigosos).
        var format = DetectFormat(input)
                     ?? throw new InvalidImageException("Envie uma imagem JPG, PNG, GIF ou WebP.");
        var settings = new MagickReadSettings { Format = format };

        try
        {
            EnsureReasonableSize(input, settings);

            using var source = new MagickImageCollection();
            await source.ReadAsync(input, settings, ct);

            // GIF/WebP animados costumam guardar só o "pedaço que mudou" em cada quadro.
            // Coalesce reconstrói cada quadro inteiro, senão o recorte sairia torto.
            if (source.Count > 1) source.Coalesce();

            var (targetWidth, targetHeight) = kind.TargetSize();
            foreach (var frame in source)
            {
                frame.AutoOrient(); // foto de celular "deitada" fica em pé
                frame.Strip();      // remove EXIF (pode ter localização GPS), perfis e comentários
                frame.Resize(new MagickGeometry(targetWidth, targetHeight) { FillArea = true });
                frame.Crop(targetWidth, targetHeight, Gravity.Center); // preenche e corta o excesso, centralizado
                frame.ResetPage();
                frame.Quality = WebpQuality;
                frame.Settings.SetDefine(MagickFormat.WebP, "lossless", false);
                frame.Settings.SetDefine(MagickFormat.WebP, "method", 6); // compressão mais caprichada (mais lenta, menor)
            }

            using var output = new MemoryStream();
            await source.WriteAsync(output, MagickFormat.WebP, ct);
            return output.ToArray();
        }
        catch (MagickException)
        {
            throw new InvalidImageException("Não foi possível ler essa imagem. Ela pode estar corrompida.");
        }
    }

    /// <summary>Lê só o cabeçalho (rápido) para checar tamanho e quadros antes de abrir a imagem de verdade.</summary>
    private static void EnsureReasonableSize(Stream input, MagickReadSettings settings)
    {
        using var header = new MagickImageCollection();
        header.Ping(input, settings);
        input.Position = 0;

        if (header.Count > MaxFrames)
            throw new InvalidImageException($"A animação pode ter no máximo {MaxFrames} quadros.");

        long totalPixels = 0;
        foreach (var frame in header)
        {
            var width = Math.Max(frame.Width, frame.Page.Width);
            var height = Math.Max(frame.Height, frame.Page.Height);
            if (width > MaxSourceSide || height > MaxSourceSide)
                throw new InvalidImageException($"A imagem pode ter no máximo {MaxSourceSide} x {MaxSourceSide} pixels.");
            totalPixels += (long)width * height;
        }

        if (totalPixels > MaxTotalPixels)
            throw new InvalidImageException("A animação é grande demais. Tente com menos quadros ou resolução menor.");
    }

    private static MagickFormat? DetectFormat(Stream input)
    {
        Span<byte> header = stackalloc byte[12];
        var read = input.ReadAtLeast(header, header.Length, throwOnEndOfStream: false);
        input.Position = 0;
        if (read < header.Length) return null;

        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF) return MagickFormat.Jpeg;
        if (header[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return MagickFormat.Png;
        if (header[..6].SequenceEqual("GIF87a"u8) || header[..6].SequenceEqual("GIF89a"u8)) return MagickFormat.Gif;
        if (header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8)) return MagickFormat.WebP;
        return null;
    }
}
