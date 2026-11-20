using ResenhaAudio;

public class CapturePlanTests
{
    // Árvore de exemplo:
    //   1 explorer ─┬─ 10 resenha ── 11 resenha (serviço de áudio do Electron)
    //               ├─ 20 discord ── 21 discord (áudio)
    //               ├─ 30 chrome ─── 31 chrome (áudio)
    //               └─ 40 game
    private static readonly Dictionary<uint, ProcessInfo> Processes = new[]
    {
        new ProcessInfo(1, 0, "explorer.exe"),
        new ProcessInfo(10, 1, "resenha.exe"), new ProcessInfo(11, 10, "resenha.exe"),
        new ProcessInfo(20, 1, "discord.exe"), new ProcessInfo(21, 20, "discord.exe"),
        new ProcessInfo(30, 1, "chrome.exe"), new ProcessInfo(31, 30, "chrome.exe"),
        new ProcessInfo(40, 1, "game.exe"),
    }.ToDictionary(p => p.Pid);

    private static IReadOnlyList<uint> Plan(uint[] sessions, string[]? exes = null) =>
        CapturePlan.PidsToCapture(sessions, Processes, new HashSet<uint> { 10 }, (exes ?? []).ToHashSet());

    [Fact]
    public void Tira_o_Resenha_pela_arvore_do_processo()
    {
        Assert.Equal([31u, 40u], Plan([11, 31, 40]));
    }

    [Fact]
    public void Tira_os_apps_marcados_pelo_executavel_ou_pelo_pai()
    {
        Assert.Equal([40u], Plan([11, 21, 31, 40], ["discord.exe", "chrome.exe"]));
    }

    [Fact]
    public void Nao_captura_o_mesmo_som_duas_vezes_quando_pai_e_filho_tem_sessao()
    {
        Assert.Equal([30u, 40u], Plan([30, 31, 40]));
    }

    [Fact]
    public void Ignora_sessao_de_sons_do_sistema_e_processo_que_ja_fechou()
    {
        Assert.Equal([40u], Plan([0, 99, 40]));
    }

    [Fact]
    public void Pid_reaproveitado_que_fecha_ciclo_nao_trava()
    {
        var cyclic = new Dictionary<uint, ProcessInfo> { [5] = new(5, 6, "a.exe"), [6] = new(6, 5, "b.exe") };
        Assert.Equal([5u], CapturePlan.PidsToCapture([5], cyclic, new HashSet<uint> { 10 }, new HashSet<string>()));
    }

    [Theory]
    [InlineData("Discord.exe", "discord.exe")]
    [InlineData(@"C:\Apps\Game.EXE ", "game.exe")]
    public void Normaliza_o_nome_do_executavel(string raw, string expected)
    {
        Assert.Equal(expected, CapturePlan.NormalizeExe(raw));
    }
}
