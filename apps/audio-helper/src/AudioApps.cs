using System.Runtime.InteropServices;

namespace ResenhaAudio;

/// <summary>Um processo do Windows: o PID, o pai e o nome do executável (ex.: "discord.exe").</summary>
public sealed record ProcessInfo(uint Pid, uint ParentPid, string Exe);

/// <summary>
/// Decide quais processos capturar no modo "todo o áudio, menos estes apps".
/// Lógica pura (sem Windows) para poder testar.
/// </summary>
public static class CapturePlan
{
    /// <summary>
    /// Recebe os PIDs que têm sessão de áudio e devolve os que devem ser capturados (modo IncludeTree).
    /// Fica de fora quem é, ou descende de, um PID excluído (o Resenha) ou um executável excluído.
    /// Também fica de fora quem descende de outro PID já capturado, para o mesmo som não entrar duas vezes.
    /// </summary>
    public static IReadOnlyList<uint> PidsToCapture(
        IEnumerable<uint> sessionPids,
        IReadOnlyDictionary<uint, ProcessInfo> processes,
        IReadOnlySet<uint> excludedPids,
        IReadOnlySet<string> excludedExes)
    {
        var candidates = new HashSet<uint>();
        foreach (var pid in sessionPids)
        {
            if (pid == 0) continue; // sessão de sons do sistema sem processo
            if (Ancestry(pid, processes).Any(p => excludedPids.Contains(p.Pid) || excludedExes.Contains(p.Exe))) continue;
            if (!processes.ContainsKey(pid)) continue;
            candidates.Add(pid);
        }
        return candidates
            .Where(pid => !Ancestry(pid, processes).Skip(1).Any(p => candidates.Contains(p.Pid)))
            .Order()
            .ToList();
    }

    /// <summary>O próprio processo seguido dos pais, com proteção contra PID reaproveitado que fecharia um ciclo.</summary>
    internal static IEnumerable<ProcessInfo> Ancestry(uint pid, IReadOnlyDictionary<uint, ProcessInfo> processes)
    {
        var seen = new HashSet<uint>();
        while (processes.TryGetValue(pid, out var info) && seen.Add(pid) && seen.Count <= 64)
        {
            yield return info;
            pid = info.ParentPid;
        }
    }

    /// <summary>Normaliza o nome do executável para comparar sem diferença de maiúsculas.</summary>
    public static string NormalizeExe(string exe) => Path.GetFileName(exe.Trim()).ToLowerInvariant();
}

/// <summary>Leitura do estado do Windows: processos e sessões de áudio abertas.</summary>
internal static class SystemAudio
{
    public static Dictionary<uint, ProcessInfo> Processes()
    {
        var result = new Dictionary<uint, ProcessInfo>();
        var snapshot = CreateToolhelp32Snapshot(0x2 /* TH32CS_SNAPPROCESS */, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return result;
        try
        {
            var entry = new ProcessEntry32 { dwSize = (uint)Marshal.SizeOf<ProcessEntry32>() };
            for (var ok = Process32FirstW(snapshot, ref entry); ok; ok = Process32NextW(snapshot, ref entry))
                result[entry.th32ProcessID] = new ProcessInfo(entry.th32ProcessID, entry.th32ParentProcessID, CapturePlan.NormalizeExe(entry.szExeFile));
        }
        finally
        {
            CloseHandle(snapshot);
        }
        return result;
    }

    /// <summary>PIDs com sessão de áudio em qualquer saída de som ativa (caixas, fone, HDMI...).</summary>
    public static HashSet<uint> SessionPids()
    {
        var pids = new HashSet<uint>();
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
        try
        {
            enumerator.EnumAudioEndpoints(EDataFlow.Render, 0x1 /* DEVICE_STATE_ACTIVE */, out var devices);
            devices.GetCount(out var count);
            for (uint i = 0; i < count; i++)
            {
                devices.Item(i, out var device);
                var iid = Guids.IAudioSessionManager2;
                device.Activate(ref iid, 0x17 /* CLSCTX_ALL */, IntPtr.Zero, out var managerObject);
                var manager = (IAudioSessionManager2)managerObject;
                manager.GetSessionEnumerator(out var sessions);
                sessions.GetCount(out var sessionCount);
                for (var s = 0; s < sessionCount; s++)
                {
                    sessions.GetSession(s, out var session);
                    session.GetState(out var state);
                    // 2 = AudioSessionStateExpired: a sessão já acabou.
                    if (state != 2 && session.IsSystemSoundsSession() != 0)
                    {
                        session.GetProcessId(out var pid);
                        pids.Add(pid);
                    }
                    Marshal.ReleaseComObject(session);
                }
                Marshal.ReleaseComObject(sessions);
                Marshal.ReleaseComObject(manager);
                Marshal.ReleaseComObject(device);
            }
            Marshal.ReleaseComObject(devices);
        }
        finally
        {
            Marshal.ReleaseComObject(enumerator);
        }
        return pids;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry32
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry32 entry);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry32 entry);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
}
