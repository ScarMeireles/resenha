using ResenhaAudio;

public class MixerTests
{
    private const int Block = AudioFormat.SamplesPerBlock;

    private static float[] Filled(int count, float value) => Enumerable.Repeat(value, count).ToArray();

    [Fact]
    public void Fonte_so_toca_depois_de_juntar_30_ms()
    {
        var mixer = new Mixer();
        var source = mixer.AddSource(1);
        var output = new float[Block];

        source.Write(Filled(Block * 2, 0.5f)); // 20 ms: ainda não escorvou
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(0f, s));

        source.Write(Filled(Block, 0.5f)); // 30 ms
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(0.5f, s));
        Assert.Equal(Block * 2, source.Count);
    }

    [Fact]
    public void Fonte_que_esvazia_espera_escorvar_de_novo()
    {
        var mixer = new Mixer();
        var source = mixer.AddSource(1);
        var output = new float[Block];
        source.Write(Filled(SourceBuffer.PrimeSamples, 0.2f));
        for (var i = 0; i < 3; i++) mixer.MixBlock(output);
        Assert.Equal(0, source.Count);

        source.Write(Filled(Block, 0.2f)); // só 10 ms: não volta a tocar ainda
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(0f, s));
        Assert.Equal(Block, source.Count);
    }

    [Fact]
    public void Soma_as_fontes_e_limita_em_um()
    {
        var mixer = new Mixer();
        mixer.AddSource(1).Write(Filled(SourceBuffer.PrimeSamples, 0.25f));
        mixer.AddSource(2).Write(Filled(SourceBuffer.PrimeSamples, 0.5f));
        var output = new float[Block];
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(0.75f, s));

        mixer.AddSource(3).Write(Filled(SourceBuffer.PrimeSamples, 0.9f));
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(1f, s));
    }

    [Fact]
    public void Fila_cheia_descarta_o_mais_antigo_e_volta_para_o_atraso_da_escorva()
    {
        var source = new SourceBuffer();
        source.Write(Filled(SourceBuffer.MaxSamples - Block, 0.1f));
        source.Write(Filled(Block * 2, 0.9f)); // passaria do teto de 200 ms

        Assert.Equal(SourceBuffer.PrimeSamples + Block * 2, source.Count);
        var output = new float[SourceBuffer.PrimeSamples + Block * 2];
        source.MixInto(output);
        // Fica o fim da fila: 30 ms do som antigo e depois os 20 ms novos.
        Assert.Equal(0.1f, output[0]);
        Assert.Equal(0.9f, output[^1]);
        Assert.Equal(0.9f, output[SourceBuffer.PrimeSamples]);
    }

    [Fact]
    public void Descarte_nunca_troca_os_canais_de_lugar()
    {
        var source = new SourceBuffer();
        // Esquerdo = 0.1, direito = -0.1, alternando; a escrita grande força descarte.
        var stereo = Enumerable.Range(0, SourceBuffer.MaxSamples + Block).Select(i => i % 2 == 0 ? 0.1f : -0.1f).ToArray();
        source.Write(stereo.AsSpan(0, Block * 5 + 2));
        source.Write(stereo);
        var output = new float[Block];
        source.MixInto(output);
        Assert.Equal(0.1f, output[0]);
        Assert.Equal(-0.1f, output[1]);
    }

    [Fact]
    public void Fonte_removida_sai_da_mistura()
    {
        var mixer = new Mixer();
        mixer.AddSource(7).Write(Filled(SourceBuffer.PrimeSamples, 0.5f));
        mixer.RemoveSource(7);
        var output = new float[Block];
        mixer.MixBlock(output);
        Assert.All(output, s => Assert.Equal(0f, s));
        Assert.Empty(mixer.SourceIds);
    }
}
