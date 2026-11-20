using Resenha.Api.Data;
using Resenha.Api.Media;

namespace Resenha.Api.Accounts;

/// <summary>O que o app recebe sobre uma conta. Nunca inclui hash nem carimbo de segurança.</summary>
public record UserDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, string? BannerUrl)
{
    public static UserDto From(User user) => new(
        user.Id,
        user.Username,
        user.DisplayName,
        user.AvatarFile is null ? null : $"/media/{MediaKind.Avatar.Folder()}/{user.AvatarFile}",
        user.BannerFile is null ? null : $"/media/{MediaKind.Banner.Folder()}/{user.BannerFile}");
}
