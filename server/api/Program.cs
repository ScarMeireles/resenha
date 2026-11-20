using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Resenha.Api.Accounts;
using Resenha.Api.Auth;
using Resenha.Api.Data;
using Resenha.Api.Friends;
using Resenha.Api.Groups;
using Resenha.Api.Media;
using Resenha.Api.Realtime;

var builder = WebApplication.CreateBuilder(args);

// --- Pastas de dados: banco SQLite e imagens ficam em {Storage:Root} (padrão: server/api/.data, ignorada no Git)
var dataRoot = Path.GetFullPath(builder.Configuration["Storage:Root"] ?? ".data", builder.Environment.ContentRootPath);
var mediaRoot = Path.Combine(dataRoot, "media");
Directory.CreateDirectory(mediaRoot);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={Path.Combine(dataRoot, "resenha.db")}"));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(new MediaStorage(mediaRoot));
builder.Services.AddSingleton<ImageProcessor>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddProblemDetails();
builder.Services.AddSignalR();
builder.Services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, SubUserIdProvider>();
builder.Services.AddSingleton<PresenceTracker>();
builder.Services.AddSingleton<FriendNotifier>();
builder.Services.AddSingleton<GroupNotifier>();

// --- Login: token JWT assinado com Jwt:SigningKey (segredo fora do Git)
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.Section))
    .ValidateDataAnnotations()
    .ValidateOnStart(); // sem chave configurada a API nem sobe, com mensagem clara

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwt) =>
    {
        bearer.MapInboundClaims = false; // mantém os nomes curtos ("sub", "sst") como foram gerados
        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Value.Issuer,
            ValidAudience = jwt.Value.Audience,
            IssuerSigningKey = TokenService.CreateKey(jwt.Value.SigningKey),
            NameClaimType = JwtRegisteredClaimNames.UniqueName,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        bearer.Events = new JwtBearerEvents
        {
            // O SignalR (WebSocket/long polling) não consegue mandar cabeçalho Authorization: o token vai na query.
            // Só aceitamos isso nas rotas /hubs, para o token não circular em URL de outras rotas.
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    context.Token = token;
                return Task.CompletedTask;
            },
            // Token só vale se a conta ainda existe e o carimbo de segurança não mudou
            // (ex.: troca de senha encerra as sessões antigas).
            OnTokenValidated = async context =>
            {
                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var valid = Guid.TryParse(context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId)
                            && Guid.TryParse(context.Principal?.FindFirstValue(TokenService.SecurityStampClaim), out var stamp)
                            && await db.Users.AnyAsync(u => u.Id == userId && u.SecurityStamp == stamp);
                if (!valid) context.Fail("Sessão encerrada.");
            },
        };
    });
builder.Services.AddAuthorization();

// --- CORS: o app desktop chama a API de outra "origem" (localhost:5173 no dev, file:// no instalado).
// Qualquer origem pode chamar, mas SEM cookies: o login vai no cabeçalho Authorization, que o navegador
// nunca envia sozinho. Então um site qualquer não consegue agir em nome de ninguém.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// --- Limite de tentativas em cadastro/login, por IP, contra quem tenta adivinhar senha
var authPerMinute = builder.Configuration.GetValue("RateLimit:AuthPerMinute", 10);
var friendRequestsPerMinute = builder.Configuration.GetValue("RateLimit:FriendRequestsPerMinute", 20);
var messagesPerMinute = builder.Configuration.GetValue("RateLimit:MessagesPerMinute", 30);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthEndpoints.RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPerMinute, Window = TimeSpan.FromMinutes(1) }));
    // Checagem de @ disponível (tela de cadastro): mesmo limite, mas balde separado, para não gastar as tentativas de cadastro/login.
    options.AddPolicy(AuthEndpoints.UsernameCheckRateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPerMinute, Window = TimeSpan.FromMinutes(1) }));
    // Pedidos de amizade: por usuário logado (IP se não houver).
    options.AddPolicy(FriendEndpoints.RequestRateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        FriendEndpoints.RateLimitKey(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = friendRequestsPerMinute, Window = TimeSpan.FromMinutes(1) }));
    // Mensagens do chat: por usuário logado.
    options.AddPolicy(GroupEndpoints.MessageRateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        FriendEndpoints.RateLimitKey(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = messagesPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// Cria/atualiza o banco ao subir. Para um app entre amigos, é mais simples que rodar migração à mão.
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();

app.UseExceptionHandler();
app.UseStatusCodePages();

// Imagens: /media/avatars/xxx.webp. Nome muda a cada envio, então pode ficar em cache por 1 ano.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = "/media",
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable",
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok("ok"));
app.MapAuthEndpoints();
app.MapAccountEndpoints();
app.MapFriendEndpoints();
app.MapGroupEndpoints();
app.MapHub<AppHub>("/hubs/app");

app.Run();
