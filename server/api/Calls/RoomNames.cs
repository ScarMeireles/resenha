namespace Resenha.Api.Calls;

public enum RoomKind { Group, Direct }

/// <summary>Nomes das salas do LiveKit: "group-{id}" para grupos e "dm-{idMenor}-{idMaior}" para ligações 1:1.</summary>
public static class RoomNames
{
    public static string Group(Guid groupId) => $"group-{groupId:N}";

    public static string Direct(Guid a, Guid b)
    {
        var (first, second) = string.CompareOrdinal(a.ToString("N"), b.ToString("N")) <= 0 ? (a, b) : (b, a);
        return $"dm-{first:N}-{second:N}";
    }

    public static bool TryParse(string? room, out RoomKind kind, out Guid[] ids)
    {
        kind = default;
        ids = [];
        if (room is null) return false;
        if (room.StartsWith("group-", StringComparison.Ordinal)
            && Guid.TryParseExact(room["group-".Length..], "N", out var groupId))
        {
            kind = RoomKind.Group;
            ids = [groupId];
            return true;
        }
        if (room.StartsWith("dm-", StringComparison.Ordinal))
        {
            var parts = room["dm-".Length..].Split('-');
            if (parts.Length == 2
                && Guid.TryParseExact(parts[0], "N", out var a)
                && Guid.TryParseExact(parts[1], "N", out var b))
            {
                kind = RoomKind.Direct;
                ids = [a, b];
                return true;
            }
        }
        return false;
    }
}
