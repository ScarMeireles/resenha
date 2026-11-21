namespace Resenha.Api.Updates;

/// <summary>
/// Versão do app no formato do package.json ("1.2.3", opcionalmente "1.2.3-beta.1").
/// Só o necessário para saber se uma versão é mais velha que outra.
/// </summary>
public readonly record struct AppVersion(int Major, int Minor, int Patch, string? PreRelease) : IComparable<AppVersion>
{
    public static bool TryParse(string? text, out AppVersion version)
    {
        version = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var value = text.Trim().TrimStart('v', 'V');
        var plus = value.IndexOf('+');
        if (plus >= 0) value = value[..plus]; // "+build" não conta na comparação
        string? pre = null;
        var dash = value.IndexOf('-');
        if (dash >= 0)
        {
            pre = value[(dash + 1)..];
            value = value[..dash];
            if (pre.Length == 0) return false;
        }

        var parts = value.Split('.');
        if (parts.Length != 3) return false;
        if (!int.TryParse(parts[0], out var major) || !int.TryParse(parts[1], out var minor) || !int.TryParse(parts[2], out var patch))
            return false;
        if (major < 0 || minor < 0 || patch < 0) return false;

        version = new AppVersion(major, minor, patch, pre);
        return true;
    }

    public int CompareTo(AppVersion other)
    {
        var result = Major.CompareTo(other.Major);
        if (result == 0) result = Minor.CompareTo(other.Minor);
        if (result == 0) result = Patch.CompareTo(other.Patch);
        if (result != 0) return result;
        // Pela regra do semver, "1.0.0-beta" vem antes de "1.0.0".
        if (PreRelease is null) return other.PreRelease is null ? 0 : 1;
        if (other.PreRelease is null) return -1;
        return string.CompareOrdinal(PreRelease, other.PreRelease);
    }

    public static bool operator <(AppVersion a, AppVersion b) => a.CompareTo(b) < 0;
    public static bool operator >(AppVersion a, AppVersion b) => a.CompareTo(b) > 0;

    public override string ToString() => PreRelease is null ? $"{Major}.{Minor}.{Patch}" : $"{Major}.{Minor}.{Patch}-{PreRelease}";
}
