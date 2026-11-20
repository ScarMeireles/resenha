using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ImageMagick;
using Resenha.Api.Accounts;

namespace Resenha.Api.Tests;

public class ProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    // --- Imagens geradas na hora, para não versionar arquivos de teste

    private static byte[] StaticImage(MagickFormat format, uint width, uint height)
    {
        using var image = new MagickImage(MagickColors.Orange, width, height);
        return image.ToByteArray(format);
    }

    private static byte[] AnimatedGif(int frames, uint width, uint height)
    {
        using var collection = new MagickImageCollection();
        for (var i = 0; i < frames; i++)
        {
            var image = new MagickImage(i % 2 == 0 ? MagickColors.Orange : MagickColors.Green, width, height) { AnimationDelay = 10 };
            collection.Add(image);
        }
        return collection.ToByteArray(MagickFormat.Gif);
    }

    private static MultipartFormDataContent Upload(byte[] bytes, string fileName = "imagem")
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return new MultipartFormDataContent { { content, "file", fileName } };
    }

    private async Task<MagickImageCollection> DownloadAsync(HttpClient client, string url)
    {
        var bytes = await client.GetByteArrayAsync(url);
        var collection = new MagickImageCollection();
        collection.Read(bytes);
        return collection;
    }

    // --- Testes

    [Fact]
    public async Task Me_devolve_a_conta_e_permite_trocar_o_nome()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        var me = await client.GetFromJsonAsync<UserDto>("/me");
        var updated = await client.PatchAsJsonAsync("/me", new UpdateMeRequest("  Novo Nome "));
        var invalid = await client.PatchAsJsonAsync("/me", new UpdateMeRequest(""));

        Assert.Equal(auth.User.Username, me!.Username);
        Assert.Equal("Novo Nome", (await updated.Content.ReadFromJsonAsync<UserDto>())!.DisplayName);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Perfil_publico_por_arroba()
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();

        var found = await client.GetAsync($"/users/@{auth.User.Username.ToUpperInvariant()}");
        var missing = await client.GetAsync("/users/nao_existe_ninguem");

        Assert.Equal(HttpStatusCode.OK, found.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Theory]
    [InlineData(MagickFormat.Png)]
    [InlineData(MagickFormat.Jpeg)]
    [InlineData(MagickFormat.WebP)]
    public async Task Avatar_vira_webp_256_quadrado(MagickFormat format)
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var response = await client.PutAsync("/me/avatar", Upload(StaticImage(format, 800, 500)));
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<UserDto>())!;

        Assert.EndsWith(".webp", user.AvatarUrl);
        using var saved = await DownloadAsync(client, user.AvatarUrl!);
        Assert.Equal(MagickFormat.WebP, saved[0].Format);
        Assert.Equal((256u, 256u), (saved[0].Width, saved[0].Height));
    }

    [Fact]
    public async Task Banner_gif_animado_continua_animado_em_960x320()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var response = await client.PutAsync("/me/banner", Upload(AnimatedGif(frames: 6, 1200, 600)));
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<UserDto>())!;

        using var saved = await DownloadAsync(client, user.BannerUrl!);
        Assert.Equal(MagickFormat.WebP, saved[0].Format);
        Assert.Equal(6, saved.Count);
        Assert.All(saved, frame => Assert.Equal((960u, 320u), (frame.Width, frame.Height)));
    }

    [Fact]
    public async Task Avatar_gif_animado_continua_animado()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var response = await client.PutAsync("/me/avatar", Upload(AnimatedGif(frames: 4, 300, 300)));
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<UserDto>())!;

        using var saved = await DownloadAsync(client, user.AvatarUrl!);
        Assert.Equal(4, saved.Count);
    }

    [Fact]
    public async Task Trocar_avatar_apaga_o_arquivo_antigo_e_remover_limpa_tudo()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var first = (await (await client.PutAsync("/me/avatar", Upload(StaticImage(MagickFormat.Png, 100, 100))))
            .Content.ReadFromJsonAsync<UserDto>())!;
        var second = (await (await client.PutAsync("/me/avatar", Upload(StaticImage(MagickFormat.Png, 100, 100))))
            .Content.ReadFromJsonAsync<UserDto>())!;

        Assert.NotEqual(first.AvatarUrl, second.AvatarUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(first.AvatarUrl)).StatusCode);

        var removed = (await (await client.DeleteAsync("/me/avatar")).Content.ReadFromJsonAsync<UserDto>())!;
        Assert.Null(removed.AvatarUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(second.AvatarUrl)).StatusCode);
    }

    [Theory]
    [InlineData("texto")]
    [InlineData("svg")]
    [InlineData("bmp")]
    public async Task Arquivo_que_nao_e_jpg_png_gif_ou_webp_e_recusado(string kind)
    {
        var (client, _) = await factory.CreateLoggedUserAsync();
        var bytes = kind switch
        {
            "texto" => "isso não é uma imagem, só texto qualquer"u8.ToArray(),
            "svg" => "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>"u8.ToArray(),
            _ => StaticImage(MagickFormat.Bmp, 50, 50),
        };

        var response = await client.PutAsync("/me/avatar", Upload(bytes, "foto.png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Imagem_corrompida_e_recusada()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();
        var png = StaticImage(MagickFormat.Png, 200, 200);

        var response = await client.PutAsync("/me/avatar", Upload(png[..40]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Imagem_com_mais_de_4096_pixels_de_lado_e_recusada()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();

        var response = await client.PutAsync("/me/banner", Upload(StaticImage(MagickFormat.Png, 5000, 100)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Arquivo_acima_de_10MB_e_recusado()
    {
        var (client, _) = await factory.CreateLoggedUserAsync();
        var big = new byte[10 * 1024 * 1024 + 1];
        StaticImage(MagickFormat.Png, 10, 10).CopyTo(big, 0);

        var response = await client.PutAsync("/me/avatar", Upload(big));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Upload_exige_login()
    {
        var response = await factory.CreateClient().PutAsync("/me/avatar", Upload(StaticImage(MagickFormat.Png, 10, 10)));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
