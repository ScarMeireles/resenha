namespace Resenha.Api.Realtime;

/// <summary>
/// Quem está online agora, em memória (um servidor só, suficiente para amigos).
/// Uma pessoa pode ter vários aparelhos conectados: só conta como offline quando a última conexão cai.
/// </summary>
public class PresenceTracker
{
    public const string Online = "online";
    public const string Offline = "offline";
    // O estado "in-call" entra no passo 6 (chamadas).

    private readonly Dictionary<Guid, HashSet<string>> _connections = [];
    private readonly object _lock = new();

    /// <summary>Registra a conexão. Devolve true se era a primeira (a pessoa acabou de ficar online).</summary>
    public bool Connected(Guid userId, string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.TryGetValue(userId, out var set))
                _connections[userId] = set = [];
            set.Add(connectionId);
            return set.Count == 1;
        }
    }

    /// <summary>Remove a conexão. Devolve true se era a última (a pessoa acabou de ficar offline).</summary>
    public bool Disconnected(Guid userId, string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.TryGetValue(userId, out var set) || !set.Remove(connectionId)) return false;
            if (set.Count > 0) return false;
            _connections.Remove(userId);
            return true;
        }
    }

    public bool IsOnline(Guid userId)
    {
        lock (_lock) return _connections.ContainsKey(userId);
    }

    public IReadOnlySet<Guid> OnlineUsers
    {
        get { lock (_lock) return _connections.Keys.ToHashSet(); }
    }

    public string PresenceOf(Guid userId) => IsOnline(userId) ? Online : Offline;
}
