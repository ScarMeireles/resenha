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
using Resenha.Api.Media;

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

// --- Limite de tentativas em cadastro/login, por IP, contra quem tenta adivinhar senha
var authPerMinute = builder.Configuration.GetValue("RateLimit:AuthPerMinute", 10);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthEndpoints.RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPerMinute, Window = TimeSpan.FromMinutes(1) }));
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

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok("ok"));
app.MapAuthEndpoints();
app.MapAccountEndpoints();

app.Run();
