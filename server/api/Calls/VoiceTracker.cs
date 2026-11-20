namespace Resenha.Api.Calls;

/// <summary>
/// Quem está em qual sala de voz agora, em memória. Uma pessoa conta numa sala só:
/// se entrar noutra, a nova vale e a antiga perde a pessoa.
/// </summary>
public class VoiceTracker
{
    private readonly Dictionary<string, HashSet<Guid>> _rooms = [];
    private readonly Dictionary<Guid, string> _roomOf = [];
    private readonly object _lock = new();

    /// <summary>Registra a entrada. Devolve true se algo mudou.</summary>
    public bool Joined(string room, Guid userId) => Joined(room, userId, out _);

    /// <summary>Registra a entrada. <paramref name="previousRoom"/> é a sala que a pessoa perdeu, se havia outra.</summary>
    public bool Joined(string room, Guid userId, out string? previousRoom)
    {
        lock (_lock)
        {
            previousRoom = null;
            if (_roomOf.TryGetValue(userId, out var current))
            {
                if (current == room) return false;
                RemoveFrom(current, userId);
                previousRoom = current;
            }
            _roomOf[userId] = room;
            if (!_rooms.TryGetValue(room, out var set)) _rooms[room] = set = [];
            set.Add(userId);
            return true;
        }
    }

    /// <summary>Registra a saída. Devolve false se a pessoa não estava nessa sala.</summary>
    public bool Left(string room, Guid userId)
    {
        lock (_lock)
        {
            if (!_roomOf.TryGetValue(userId, out var current) || current != room) return false;
            RemoveFrom(room, userId);
            _roomOf.Remove(userId);
            return true;
        }
    }

    public Guid[] ParticipantsOf(string room)
    {
        lock (_lock) return _rooms.TryGetValue(room, out var set) ? [.. set] : [];
    }

    public string? RoomOf(Guid userId)
    {
        lock (_lock) return _roomOf.GetValueOrDefault(userId);
    }

    public bool IsInCall(Guid userId)
    {
        lock (_lock) return _roomOf.ContainsKey(userId);
    }

    private void RemoveFrom(string room, Guid userId)
    {
        if (_rooms.TryGetValue(room, out var set) && set.Remove(userId) && set.Count == 0)
            _rooms.Remove(room);
    }
}
