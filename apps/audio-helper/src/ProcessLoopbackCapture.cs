using System.Runtime.InteropServices;

namespace ResenhaAudio;

public enum LoopbackMode
{
    /// <summary>Só o som do processo alvo e dos filhos dele.</summary>
    IncludeTree = 0,
    /// <summary>Todo o som do PC, menos o do processo alvo e dos filhos dele.</summary>
    ExcludeTree = 1,
}

/// <summary>
/// Uma captura de "process loopback": recebe o som que um processo (e os filhos) toca, ou todo o resto.
/// O Windows só aceita um processo alvo por captura; para excluir vários apps, o <see cref="Mixer"/>
/// abre uma captura <see cref="LoopbackMode.IncludeTree"/> para cada app que fica e soma tudo.
/// </summary>
internal sealed class ProcessLoopbackCapture : IDisposable
{
    private const uint StreamFlagsLoopback = 0x00020000;
    private const uint StreamFlagsEventCallback = 0x00040000;
    private const uint StreamFlagsAutoConvertPcm = 0x80000000;
    private const uint StreamFlagsSrcDefaultQuality = 0x08000000;
    private const uint BufferFlagsSilent = 0x2;
    private const long BufferDuration100ns = 200_000; // 20 ms

    private readonly IAudioClient _client;
    private readonly IAudioCaptureClient _capture;
    private readonly AutoResetEvent _ready = new(false);
    private readonly Thread _thread;
    private readonly Action<ReadOnlySpan<float>> _onSamples;
    private volatile bool _running = true;
    private float[] _silence = new float[AudioFormat.SamplesPerBlock * 4];

    public uint TargetPid { get; }

    private ProcessLoopbackCapture(uint pid, IAudioClient client, Action<ReadOnlySpan<float>> onSamples)
    {
        TargetPid = pid;
        _client = client;
        _onSamples = onSamples;
        var iid = Guids.IAudioCaptureClient;
        _client.GetService(ref iid, out var service);
        _capture = (IAudioCaptureClient)service;
        _client.SetEventHandle(_ready.SafeWaitHandle.DangerousGetHandle());
        _thread = new Thread(Loop) { IsBackground = true, Name = $"captura-{pid}", Priority = ThreadPriority.AboveNormal };
    }

    /// <summary>Abre a captura (formato fixo: float 32 bits, estéreo, 48 kHz) e começa a entregar amostras.</summary>
    public static ProcessLoopbackCapture Start(uint pid, LoopbackMode mode, Action<ReadOnlySpan<float>> onSamples)
    {
        var client = Activate(pid, mode);
        var format = Marshal.AllocHGlobal(Marshal.SizeOf<WaveFormatEx>());
        try
        {
            Marshal.StructureToPtr(WaveFormatEx.Float(AudioFormat.SampleRate, AudioFormat.Channels), format, false);
            client.Initialize(0 /* compartilhado */,
                StreamFlagsLoopback | StreamFlagsEventCallback | StreamFlagsAutoConvertPcm | StreamFlagsSrcDefaultQuality,
                BufferDuration100ns, 0, format, IntPtr.Zero);
        }
        finally
        {
            Marshal.FreeHGlobal(format);
        }

        var capture = new ProcessLoopbackCapture(pid, client, onSamples);
        client.Start();
        capture._thread.Start();
        return capture;
    }

    private static unsafe IAudioClient Activate(uint pid, LoopbackMode mode)
    {
        var parameters = new AudioClientActivationParams { ActivationType = 1 /* PROCESS_LOOPBACK */, TargetProcessId = pid, ProcessLoopbackMode = (int)mode };
        var variant = new PropVariantBlob { vt = 65 /* VT_BLOB */, cbSize = (uint)sizeof(AudioClientActivationParams), pBlobData = (IntPtr)(&parameters) };

        var handler = new ActivationHandler();
        NativeMethods.ActivateAudioInterfaceAsync(NativeMethods.ProcessLoopbackDevice, Guids.IAudioClient, (IntPtr)(&variant), handler, out _);
        // Os parâmetros ficam na pilha: só saímos daqui depois que o Windows terminar a ativação.
        if (!handler.Done.Wait(TimeSpan.FromSeconds(5)))
            throw new TimeoutException("O Windows não respondeu à ativação da captura de áudio.");
        return handler.Result ?? throw new COMException("Falha ao ativar a captura de áudio.", handler.HResult);
    }

    private void Loop()
    {
        while (_running)
        {
            if (!_ready.WaitOne(100)) continue;
            try
            {
                Drain();
            }
            catch (COMException)
            {
                // O processo alvo fechou ou o aparelho de som mudou: a captura para; o Mixer decide se reabre.
                _running = false;
            }
        }
    }

    private unsafe void Drain()
    {
        _capture.GetNextPacketSize(out var packet);
        while (packet > 0)
        {
            _capture.GetBuffer(out var data, out var frames, out var flags, out _, out _);
            var count = (int)frames * AudioFormat.Channels;
            if ((flags & BufferFlagsSilent) != 0)
            {
                if (_silence.Length < count) _silence = new float[count];
                _onSamples(_silence.AsSpan(0, count));
            }
            else
            {
                _onSamples(new ReadOnlySpan<float>((void*)data, count));
            }
            _capture.ReleaseBuffer(frames);
            _capture.GetNextPacketSize(out packet);
        }
    }

    public bool IsRunning => _running;

    public void Dispose()
    {
        _running = false;
        _thread.Join(500);
        try { _client.Stop(); } catch (COMException) { }
        Marshal.ReleaseComObject(_capture);
        Marshal.ReleaseComObject(_client);
        _ready.Dispose();
    }

    [ComVisible(true)]
    private sealed class ActivationHandler : IActivateAudioInterfaceCompletionHandler
    {
        public readonly ManualResetEventSlim Done = new(false);
        public IAudioClient? Result;
        public int HResult;

        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            try
            {
                operation.GetActivateResult(out HResult, out var iface);
                if (HResult >= 0) Result = (IAudioClient)iface;
            }
            catch (COMException e)
            {
                HResult = e.HResult;
            }
            finally
            {
                Done.Set();
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AudioClientActivationParams
    {
        public int ActivationType;
        public uint TargetProcessId;
        public int ProcessLoopbackMode;
    }

    // PROPVARIANT com um BLOB (x64): vt (2 bytes) + 6 reservados, depois cbSize (4) + 4 de alinhamento + ponteiro.
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariantBlob
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public uint cbSize;
        [FieldOffset(16)] public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    private struct WaveFormatEx
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;

        public static WaveFormatEx Float(int rate, int channels) => new()
        {
            wFormatTag = 3, // WAVE_FORMAT_IEEE_FLOAT
            nChannels = (ushort)channels,
            nSamplesPerSec = (uint)rate,
            nBlockAlign = (ushort)(channels * 4),
            nAvgBytesPerSec = (uint)(rate * channels * 4),
            wBitsPerSample = 32,
            cbSize = 0,
        };
    }
}

public static class AudioFormat
{
    public const int SampleRate = 48_000;
    public const int Channels = 2;
    /// <summary>Bloco de 10 ms, o mesmo tamanho de quadro que o WebRTC usa.</summary>
    public const int FramesPerBlock = SampleRate / 100;
    public const int SamplesPerBlock = FramesPerBlock * Channels;
}
