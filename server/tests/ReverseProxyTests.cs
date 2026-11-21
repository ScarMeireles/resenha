using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Resenha.Api.Auth;

namespace Resenha.Api.Tests;

/// <summary>
/// No servidor real a API fica atrás do Caddy. O limite de login por IP tem de enxergar o IP de quem usa o app
/// (X-Forwarded-For), mas só quando o pedido chega pela rede interna; senão qualquer um forjaria o cabeçalho.
/// </summary>
public class ReverseProxyTests
{
    /// <summary>API com o proxy ligado, fingindo que todo pedido chega do endereço <paramref name="remoteIp"/>.</summary>
    private sealed class ProxiedApiFactory(string remoteIp) : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("ReverseProxy:Enabled", "true");
            builder.ConfigureServices(services =>
                services.AddSingleton<IStartupFilter>(new FakeRemoteIp(IPAddress.Parse(remoteIp))));
        }
    }

    /// <summary>O TestServer não tem IP de origem; este filtro coloca um antes de qualquer middleware da API.</summary>
    private sealed class FakeRemoteIp(IPAddress ip) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = ip;
                return nextMiddleware(context);
            });
            next(app);
        };
    }

    private static async Task<HttpStatusCode> LoginFrom(HttpClient client, string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/auth/login")
        {
            Content = JsonContent.Create(new LoginRequest("ninguem", "Senha!1")),
        };
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return (await client.SendAsync(request)).StatusCode;
    }

    [Fact]
    public async Task Pela_rede_interna_cada_IP_real_tem_o_proprio_limite()
    {
        using var factory = new ProxiedApiFactory("172.18.0.5") { AuthPerMinute = 1 }; // IP do Caddy no Docker
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, "203.0.113.2")); // outra pessoa não é bloqueada
    }

    [Fact]
    public async Task Cabecalho_vindo_de_fora_da_rede_interna_e_ignorado()
    {
        using var factory = new ProxiedApiFactory("198.51.100.7") { AuthPerMinute = 1 }; // alguém direto da internet
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, "203.0.113.2")); // trocar o cabeçalho não fura o limite
    }
}
