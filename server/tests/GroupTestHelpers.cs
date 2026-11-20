using System.Net.Http.Headers;
using System.Net.Http.Json;
using ImageMagick;
using Microsoft.AspNetCore.Mvc;
using Resenha.Api.Auth;
using Resenha.Api.Friends;
using Resenha.Api.Groups;

namespace Resenha.Api.Tests;

/// <summary>Atalhos compartilhados pelos testes de grupos, chat e tempo real.</summary>
public static class GroupTestHelpers
{
    public static async Task MakeFriends(HttpClient a, AuthResponse authB, HttpClient b)
    {
        var response = await a.PostAsJsonAsync("/friends/requests", new SendFriendRequest(authB.User.Username));
        response.EnsureSuccessStatusCode();
        var request = (await response.Content.ReadFromJsonAsync<FriendRequestDto>())!;
        (await b.PostAsync($"/friends/requests/{request.Id}/accept", null)).EnsureSuccessStatusCode();
    }

    /// <summary>Cria uma conta nova que já é amiga de <paramref name="of"/>.</summary>
    public static async Task<(HttpClient Client, AuthResponse Auth)> FriendOf(ApiFactory factory, HttpClient of)
    {
        var (client, auth) = await factory.CreateLoggedUserAsync();
        await MakeFriends(of, auth, client);
        return (client, auth);
    }

    public static async Task<GroupDto> CreateGroup(HttpClient client, string name, params Guid[] memberIds)
    {
        var response = await client.PostAsJsonAsync("/groups", new CreateGroupRequest(name, memberIds));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<GroupDto>())!;
    }

    public static async Task<string?> Title(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemDetails>())?.Title;

    public static byte[] Png(uint width = 20, uint height = 10)
    {
        using var image = new MagickImage(MagickColors.Orange, width, height);
        return image.ToByteArray(MagickFormat.Png);
    }

    public static MultipartFormDataContent MessageForm(string? text, params byte[][] images)
    {
        var form = new MultipartFormDataContent();
        if (text is not null) form.Add(new StringContent(text), "text");
        foreach (var bytes in images)
        {
            var content = new ByteArrayContent(bytes);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(content, "images", "imagem");
        }
        return form;
    }

    public static async Task<MessageDto> Send(HttpClient client, Guid groupId, string? text, params byte[][] images)
    {
        var response = await client.PostAsync($"/groups/{groupId}/messages", MessageForm(text, images));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MessageDto>())!;
    }
}
