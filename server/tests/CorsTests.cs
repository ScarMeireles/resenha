using System.Net;

namespace Resenha.Api.Tests;

/// <summary>O app desktop roda numa origem diferente da API; sem CORS o Chromium bloqueia as chamadas.</summary>
public class CorsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("http://localhost:5173")] // app em desenvolvimento (Vite)
    [InlineData("null")]                  // app instalado, carregado de file://
    public async Task Preflight_do_app_desktop_e_liberado_sem_cookies(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/login");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,authorization");

        var response = await factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("*", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }
}
