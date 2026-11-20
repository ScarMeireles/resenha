using Resenha.Api.Calls;
using Resenha.Api.Data;

namespace Resenha.Api.Realtime;

/// <summary>
/// Quem está conectado agora, em memória (um servidor só, suficiente para amigos), e o status que cada um escolheu.
/// Uma pessoa pode ter vários aparelhos conectados: só conta como desconectada quando a última conexão cai.
/// </summary>
public class PresenceTracker(VoiceTracker voice)
{
    public const string Online = "online";
    public const string Away = "away";
    public const string Offline = "offline";
    public const string InCall = "in-call";

    private readonly Dictionary<Guid, HashSet<string>> _connections = [];
    private readonly Dictionary<Guid, string> _chosen = [];
    private readonly object _lock = new();

    /// <summary>
    /// Registra a conexão com o status salvo da pessoa. Devolve true se era a primeira (a pessoa acabou de conectar).
    /// </summary>
    public bool Connected(Guid userId, string connectionId, string chosenStatus)
    {
        lock (_lock)
        {
            if (!_connections.TryGetValue(userId, out var set))
                _connections[userId] = set = [];
            set.Add(connectionId);
            if (set.Count == 1) _chosen[userId] = chosenStatus;
            return set.Count == 1;
        }
    }

    /// <summary>Remove a conexão. Devolve true se era a última (a pessoa acabou de desconectar).</summary>
    public bool Disconnected(Guid userId, string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.TryGetValue(userId, out var set) || !set.Remove(connectionId)) return false;
            if (set.Count > 0) return false;
            _connections.Remove(userId);
            _chosen.Remove(userId);
            return true;
        }
    }

    /// <summary>Atualiza o status escolhido de quem está conectado (quem não está pega o salvo ao conectar).</summary>
    public void SetChosen(Guid userId, string chosenStatus)
    {
        lock (_lock)
        {
            if (_connections.ContainsKey(userId)) _chosen[userId] = chosenStatus;
        }
    }

    /// <summary>
    /// O app da pessoa está aberto e conectado, mesmo que ela esteja invisível.
    /// Use só para decidir se uma ligação pode tocar, nunca para mostrar aos outros.
    /// </summary>
    public bool IsConnected(Guid userId)
    {
        lock (_lock) return _connections.ContainsKey(userId);
    }

    /// <summary>Conexões abertas da pessoa (uma por aparelho/aba).</summary>
    public string[] ConnectionsOf(Guid userId)
    {
        lock (_lock) return _connections.TryGetValue(userId, out var set) ? [.. set] : [];
    }

    /// <summary>
    /// O que os outros veem: offline (desconectada ou invisível), em chamada, ausente ou online.
    /// Quem está invisível aparece offline mesmo em chamada.
    /// </summary>
    public string PresenceOf(Guid userId)
    {
        string chosen;
        lock (_lock)
        {
            if (!_chosen.TryGetValue(userId, out var value)) return Offline;
            chosen = value;
        }
        if (chosen == UserStatuses.Offline) return Offline;
        if (voice.IsInCall(userId)) return InCall;
        return chosen == UserStatuses.Away ? Away : Online;
    }
}
