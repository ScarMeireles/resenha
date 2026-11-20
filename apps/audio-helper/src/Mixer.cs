namespace ResenhaAudio;

/// <summary>
/// Fila de amostras de uma fonte (uma captura). A captura escreve quando o Windows entrega pacotes,
/// e o relógio de saída lê blocos de 10 ms.
/// <para>
/// Por que existe a "escorva" (<see cref="PrimeSamples"/>): os pacotes chegam com um pouco de variação
/// de tempo. Se a leitura começasse com a fila quase vazia, faltaria som a cada tique e sairiam estalos.
/// Por isso a fonte só começa a ser lida com 30 ms guardados e, se esvaziar, espera encher de novo.
/// A fila tem teto de 200 ms. Se o relógio do aparelho andar mais rápido que o nosso, o excesso
/// é descartado e o atraso volta para perto da escorva, sem crescer para sempre.
/// </para>
/// </summary>
internal sealed class SourceBuffer
{
    public const int PrimeSamples = AudioFormat.SamplesPerBlock * 3;     // 30 ms
    public const int MaxSamples = AudioFormat.SamplesPerBlock * 20;      // 200 ms

    private readonly float[] _ring = new float[MaxSamples];
    private readonly object _lock = new();
    private int _start;
    private int _count;
    private bool _primed;

    public int Count { get { lock (_lock) return _count; } }

    public void Write(ReadOnlySpan<float> samples)
    {
        lock (_lock)
        {
            if (samples.Length >= MaxSamples)
            {
                samples = samples[^MaxSamples..];
                _start = 0;
                _count = 0;
            }
            var overflow = _count + samples.Length - MaxSamples;
            if (overflow > 0)
            {
                // Acumulou demais: joga fora o mais antigo e volta para o atraso da escorva.
                var drop = Math.Min(_count, Math.Max(overflow, _count - PrimeSamples));
                drop -= drop % AudioFormat.Channels;
                _start = (_start + drop) % MaxSamples;
                _count -= drop;
            }
            foreach (var s in samples)
            {
                _ring[(_start + _count) % MaxSamples] = s;
                _count++;
            }
        }
    }

    /// <summary>Soma o próximo bloco desta fonte em <paramref name="mix"/>. Falta de som vira silêncio.</summary>
    public void MixInto(Span<float> mix)
    {
        lock (_lock)
        {
            if (!_primed)
            {
                if (_count < PrimeSamples) return;
                _primed = true;
            }
            var n = Math.Min(mix.Length, _count);
            for (var i = 0; i < n; i++)
                mix[i] += _ring[(_start + i) % MaxSamples];
            _start = (_start + n) % MaxSamples;
            _count -= n;
            if (_count == 0) _primed = false;
        }
    }
}

/// <summary>Soma as fontes ativas num bloco de 10 ms, com limite em [-1, 1] para não distorcer em overflow.</summary>
internal sealed class Mixer
{
    private readonly object _lock = new();
    private readonly Dictionary<uint, SourceBuffer> _sources = new();

    public SourceBuffer AddSource(uint id)
    {
        lock (_lock)
        {
            if (!_sources.TryGetValue(id, out var buffer))
                _sources[id] = buffer = new SourceBuffer();
            return buffer;
        }
    }

    public void RemoveSource(uint id)
    {
        lock (_lock) _sources.Remove(id);
    }

    public IReadOnlyCollection<uint> SourceIds
    {
        get { lock (_lock) return _sources.Keys.ToArray(); }
    }

    public void MixBlock(Span<float> output)
    {
        output.Clear();
        lock (_lock)
        {
            foreach (var source in _sources.Values)
                source.MixInto(output);
        }
        for (var i = 0; i < output.Length; i++)
            output[i] = Math.Clamp(output[i], -1f, 1f);
    }
}
