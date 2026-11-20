namespace Resenha.Api.Data;

/// <summary>Status que a pessoa pode escolher clicando no próprio avatar.</summary>
public static class UserStatuses
{
    public const string Online = "online";
    public const string Away = "away";

    /// <summary>Invisível: os outros veem "offline", mas o app segue conectado e as ligações tocam.</summary>
    public const string Offline = "offline";

    public static readonly string[] All = [Online, Away, Offline];

    public static bool IsValid(string? status) => status is not null && All.Contains(status);
}
