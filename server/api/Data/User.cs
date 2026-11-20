namespace Resenha.Api.Data;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>O @ da pessoa, sempre em minúsculas e sem o "@". Único.</summary>
    public required string Username { get; set; }

    public required string DisplayName { get; set; }

    /// <summary>Hash PBKDF2 gerado pelo PasswordHasher do ASP.NET. A senha em si nunca é guardada.</summary>
    public string PasswordHash { get; set; } = "";

    /// <summary>
    /// Muda sempre que a senha muda (ou num "sair de todos os aparelhos").
    /// Vai dentro do token: token com carimbo antigo deixa de valer.
    /// </summary>
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    /// <summary>Nome do arquivo WebP em media/avatars, ou null sem foto.</summary>
    public string? AvatarFile { get; set; }

    /// <summary>Nome do arquivo WebP em media/banners, ou null sem banner.</summary>
    public string? BannerFile { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
