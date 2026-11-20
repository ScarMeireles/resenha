namespace Resenha.Api.Calls;

public enum CallState { Ringing, Active }

/// <summary>Ligação 1:1 pendente (tocando) ou em andamento.</summary>
public record Call(Guid CallerId, Guid CalleeId, CallState State)
{
    public string Room => RoomNames.Direct(CallerId, CalleeId);
}

/// <summary>Uma ligação pendente/ativa por par de pessoas, em memória (um servidor só).</summary>
public class CallTracker
{
    private readonly Dictionary<string, Call> _calls = [];
    private readonly object _lock = new();

    /// <summary>Cria a ligação do par; se já havia uma, ela é sobrescrita.</summary>
    public void Set(Call call)
    {
        lock (_lock) _calls[call.Room] = call;
    }

    public Call? Get(Guid a, Guid b)
    {
        lock (_lock) return _calls.GetValueOrDefault(RoomNames.Direct(a, b));
    }

    public Call? Remove(Guid a, Guid b) => Remove(RoomNames.Direct(a, b));

    public Call? Remove(string room)
    {
        lock (_lock) return _calls.Remove(room, out var call) ? call : null;
    }

    /// <summary>Passa de "tocando" para "em andamento". Devolve a ligação nova, ou null se não havia.</summary>
    public Call? Activate(Guid a, Guid b)
    {
        lock (_lock)
        {
            var room = RoomNames.Direct(a, b);
            if (!_calls.TryGetValue(room, out var call)) return null;
            return _calls[room] = call with { State = CallState.Active };
        }
    }
}
