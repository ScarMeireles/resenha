using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using ResenhaAudio;

// resenha-audio — ajudante do Resenha para o áudio do compartilhamento de tela.
//
//   resenha-audio list [--exclude-pid <pid>]
//       Imprime em JSON os apps que têm sessão de áudio aberta (para a lista "menos estes apps"),
//       sem o <pid> e os filhos dele.
//
//   resenha-audio capture [--exclude-pid <pid>] [--exclude-exe discord.exe ...]
//       Escreve no stdout PCM float 32 bits little-endian, estéreo, 48 kHz, em blocos de 10 ms,
//       com todo o som do PC menos o do <pid> (o Resenha) e dos executáveis listados (precisa de pelo menos um).
//       Termina quando o stdin fecha (o app que abriu o ajudante saiu) ou o stdout quebra.
//
// Mensagens de erro vão para o stderr. Código de saída: 0 ok, 2 argumentos inválidos, 3 falha na captura.

try
{
    var options = Options.Parse(args);
    return options.Command switch
    {
        "list" => ListApps(options),
        "capture" => Capture(options),
        _ => Usage(),
    };
}
catch (ArgumentException e)
{
    Console.Error.WriteLine(e.Message);
    return Usage();
}
catch (Exception e) when (e is COMException or TimeoutException)
{
    Console.Error.WriteLine($"Falha na captura de áudio: {e.Message}");
    return 3;
}

static int Usage()
{
    Console.Error.WriteLine("Uso: resenha-audio list|capture --exclude-pid <pid> [--exclude-exe app.exe ...]");
    return 2;
}

static int ListApps(Options options)
{
    var processes = SystemAudio.Processes();
    var pids = CapturePlan.PidsToCapture(SystemAudio.SessionPids(), processes, options.ExcludedPids, new HashSet<string>());
    var exes = pids.Select(pid => processes[pid].Exe).Distinct().Order().ToArray();
    Console.Out.Write(JsonSerializer.Serialize(exes, AppJson.Default.StringArray));
    return 0;
}

static int Capture(Options options)
{
    using var stop = new CancellationTokenSource();
    // Quando o app fecha o stdin (ou morre), o ajudante para junto.
    new Thread(() =>
    {
        try { using var stdin = Console.OpenStandardInput(); stdin.CopyTo(Stream.Null); } catch (IOException) { }
        stop.Cancel();
    }) { IsBackground = true }.Start();

    var mixer = new Mixer();
    using var captures = new CaptureSet(mixer, options);
    captures.Refresh();

    using var stdout = Console.OpenStandardOutput();
    var block = new float[AudioFormat.SamplesPerBlock];
    var bytes = MemoryMarshal.AsBytes(block.AsSpan());
    var clock = Stopwatch.StartNew();
    long sent = 0;
    var nextRefresh = TimeSpan.FromSeconds(2);

    while (!stop.IsCancellationRequested)
    {
        // Relógio próprio de 10 ms: mesmo sem nenhum som tocando, sai silêncio contínuo,
        // e o WebRTC do outro lado não vê buracos na faixa.
        var due = clock.ElapsedTicks * 100 / Stopwatch.Frequency; // blocos de 10 ms que já deviam ter saído
        while (sent < due)
        {
            mixer.MixBlock(block);
            try { stdout.Write(bytes); }
            catch (IOException) { return 0; }
            sent++;
        }
        stdout.Flush();

        if (clock.Elapsed >= nextRefresh)
        {
            // Apps que abriram ou fecharam o som entram e saem da mistura (só no modo com lista de apps).
            captures.Refresh();
            nextRefresh = clock.Elapsed + TimeSpan.FromSeconds(2);
        }
        Thread.Sleep(5);
    }
    return 0;
}

/// <summary>Mantém as capturas abertas de acordo com o modo escolhido.</summary>
internal sealed class CaptureSet(Mixer mixer, Options options) : IDisposable
{
    private readonly Dictionary<uint, ProcessLoopbackCapture> _captures = new();

    public void Refresh()
    {
        if (options.ExcludedExes.Count == 0)
        {
            // Só o Resenha sai: uma captura no modo "tudo menos este processo" resolve.
            var pid = options.ExcludedPids.First();
            if (_captures.TryGetValue(pid, out var running) && running.IsRunning) return;
            Open(pid, LoopbackMode.ExcludeTree);
            return;
        }

        // Vários apps saem: o Windows só exclui um por captura, então capturamos um a um os que ficam.
        var wanted = CapturePlan.PidsToCapture(SystemAudio.SessionPids(), SystemAudio.Processes(), options.ExcludedPids, options.ExcludedExes).ToHashSet();
        foreach (var (pid, capture) in _captures.ToArray())
        {
            if (wanted.Contains(pid) && capture.IsRunning) continue;
            Close(pid);
        }
        foreach (var pid in wanted)
        {
            if (!_captures.ContainsKey(pid)) Open(pid, LoopbackMode.IncludeTree);
        }
    }

    private void Open(uint pid, LoopbackMode mode)
    {
        Close(pid);
        try
        {
            var buffer = mixer.AddSource(pid);
            _captures[pid] = ProcessLoopbackCapture.Start(pid, mode, buffer.Write);
        }
        catch (Exception e) when (e is COMException or TimeoutException)
        {
            mixer.RemoveSource(pid);
            // No modo de exclusão, sem essa captura não há áudio nenhum: o erro sobe.
            if (mode == LoopbackMode.ExcludeTree) throw;
            Console.Error.WriteLine($"Não foi possível capturar o processo {pid}: {e.Message}");
        }
    }

    private void Close(uint pid)
    {
        if (!_captures.Remove(pid, out var capture)) return;
        capture.Dispose();
        mixer.RemoveSource(pid);
    }

    public void Dispose()
    {
        foreach (var pid in _captures.Keys.ToArray()) Close(pid);
    }
}

internal sealed record Options(string Command, IReadOnlySet<uint> ExcludedPids, IReadOnlySet<string> ExcludedExes)
{
    public static Options Parse(string[] args)
    {
        if (args.Length == 0) throw new ArgumentException("Falta o comando.");
        var pids = new HashSet<uint>();
        var exes = new HashSet<string>();
        for (var i = 1; i < args.Length; i++)
        {
            var value = i + 1 < args.Length ? args[i + 1] : throw new ArgumentException($"Falta o valor de {args[i]}.");
            switch (args[i])
            {
                case "--exclude-pid":
                    pids.Add(uint.TryParse(value, out var pid) && pid > 0 ? pid : throw new ArgumentException($"PID inválido: {value}"));
                    break;
                case "--exclude-exe":
                    exes.Add(CapturePlan.NormalizeExe(value));
                    break;
                default:
                    throw new ArgumentException($"Opção desconhecida: {args[i]}");
            }
            i++;
        }
        if (args[0] == "capture" && pids.Count == 0 && exes.Count == 0)
            throw new ArgumentException("Informe o que excluir: --exclude-pid e/ou --exclude-exe.");
        return new Options(args[0], pids, exes);
    }
}

[System.Text.Json.Serialization.JsonSerializable(typeof(string[]), TypeInfoPropertyName = "StringArray")]
internal partial class AppJson : System.Text.Json.Serialization.JsonSerializerContext { }
