using System.Net;
using System.Security.Authentication;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.StaticFiles;
using PubQuiz.Server.Hubs;
using PubQuiz.Server.Models;
using PubQuiz.Server.Services;

static string? ResolveWebRoot()
{
    string[] candidates =
    [
        Path.Combine(AppContext.BaseDirectory, "wwwroot"),
        Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"),
        Path.Combine(Directory.GetCurrentDirectory(), "src", "PubQuiz.Server", "wwwroot")
    ];

    foreach (var candidate in candidates)
    {
        if (File.Exists(Path.Combine(candidate, "index.html")))
            return candidate;
    }

    return null;
}

static bool? ParseOptionalBool(string? value)
{
    if (string.IsNullOrWhiteSpace(value)) return null;
    if (bool.TryParse(value.Trim(), out var b)) return b;
    if (value.Trim() == "1") return true;
    if (value.Trim() == "0") return false;
    return null;
}

var webRoot = ResolveWebRoot();
var builder = webRoot is not null
    ? WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, WebRootPath = webRoot })
    : WebApplication.CreateBuilder(args);

var pubQuizConfig = builder.Configuration.GetSection("PubQuiz").Get<PubQuizOptions>() ?? new PubQuizOptions();
var portEnv = Environment.GetEnvironmentVariable("PORT");
var httpsEnvOverride = ParseOptionalBool(Environment.GetEnvironmentVariable("QUIZ_HTTPS_ENABLED"));
var trustProxy = pubQuizConfig.TrustForwardedHeaders
    || !string.IsNullOrWhiteSpace(portEnv)
    || ParseOptionalBool(Environment.GetEnvironmentVariable("QUIZ_TRUST_PROXY")) == true;

var httpsPort = int.TryParse(Environment.GetEnvironmentVariable("QUIZ_HTTPS_PORT"), out var envHttpsPort) && envHttpsPort > 0
    ? envHttpsPort
    : pubQuizConfig.Https.Port > 0 ? pubQuizConfig.Https.Port : 5443;

var httpRedirectPort = int.TryParse(Environment.GetEnvironmentVariable("QUIZ_HTTP_PORT"), out var envHttpPort) && envHttpPort >= 0
    ? envHttpPort
    : pubQuizConfig.Https.HttpRedirectPort;

// Locally (no cloud PORT env var): HTTPS is ON by default. On cloud hosts (Render/Fly/Docker with PORT):
// edge reverse proxy terminates TLS and forwards HTTP to PORT unless QUIZ_HTTPS_ENABLED=true is set.
var httpsEnabled = httpsEnvOverride ?? (string.IsNullOrWhiteSpace(portEnv) && pubQuizConfig.Https.Enabled);

ResolvedTlsCertificate? resolvedTlsCert = null;

if (!httpsEnabled && !string.IsNullOrWhiteSpace(portEnv) && int.TryParse(portEnv, out var cloudPort))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{cloudPort}");
}

if (httpsEnabled)
{
    resolvedTlsCert = LocalTlsCertificateService.LoadOrCreateCertificate(
        pubQuizConfig.Https,
        builder.Environment.ContentRootPath,
        pubQuizConfig.StateDirectory);
}

var explicitUrlsConfigured = !string.IsNullOrWhiteSpace(builder.Configuration["urls"])
    || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS"));

builder.WebHost.ConfigureKestrel(kestrel =>
{
    // Do not disclose Kestrel version header
    kestrel.AddServerHeader = false;
    // Defensive default payload cap for JSON APIs (media upload endpoint overrides to 52 MB)
    kestrel.Limits.MaxRequestBodySize = 2 * 1024 * 1024;
    kestrel.Limits.MaxRequestHeadersTotalSize = 16 * 1024;

    if (httpsEnabled && resolvedTlsCert is not null)
    {
        kestrel.ConfigureHttpsDefaults(https =>
        {
            https.ServerCertificate = resolvedTlsCert.Certificate;
            https.SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
        });

        // If no --urls / ASPNETCORE_URLS / launchSettings.json URLs were provided (e.g. direct `dotnet PubQuiz.Server.dll`),
        // bind HTTPS (+ optional HTTP->HTTPS redirect port) automatically on all interfaces.
        if (!explicitUrlsConfigured)
        {
            kestrel.ListenAnyIP(httpsPort, listen => listen.UseHttps());
            if (pubQuizConfig.Https.RedirectHttpToHttps && httpRedirectPort > 0 && httpRedirectPort != httpsPort)
            {
                kestrel.ListenAnyIP(httpRedirectPort);
            }
        }
    }
});

if (httpsEnabled && pubQuizConfig.Https.RedirectHttpToHttps)
{
    builder.Services.AddHttpsRedirection(opts =>
    {
        opts.HttpsPort = httpsPort;
        opts.RedirectStatusCode = StatusCodes.Status307TemporaryRedirect;
    });
}

builder.Services.Configure<PubQuizOptions>(builder.Configuration.GetSection("PubQuiz"));
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<NetworkInfoService>();
builder.Services.AddSingleton<QuizRepository>();
builder.Services.AddSingleton<StatePersistenceService>();
builder.Services.AddSingleton<GameEngineService>();

builder.Services.ConfigureHttpJsonOptions(opts =>
{
    opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    opts.SerializerOptions.MaxDepth = 32;
});

builder.Services.AddSignalR(opts =>
{
    opts.KeepAliveInterval = TimeSpan.FromSeconds(10);
    opts.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    opts.MaximumReceiveMessageSize = 32 * 1024;
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
}).AddJsonProtocol(opts =>
{
    opts.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

// Brute-force & flood protection (built-in ASP.NET Core Rate Limiter)
builder.Services.AddRateLimiter(opts =>
{
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opts.OnRejected = async (context, token) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                Math.Ceiling(retryAfter.TotalSeconds).ToString("F0");
        }
        context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
        await context.HttpContext.Response.WriteAsync(
            """{"error":"Příliš mnoho požadavků z vaší adresy. Počkejte prosím chvíli a zkuste to znovu."}""",
            token);
    };

    static string GetClientIp(HttpContext ctx) =>
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    // Strict limiter for Host PIN & Screen Pairing Code (prevents brute-forcing 6-digit PIN / 4-char code)
    opts.AddPolicy("auth-strict", ctx => RateLimitPartition.GetSlidingWindowLimiter(
        $"strict:{GetClientIp(ctx)}",
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 6,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueLimit = 0,
            AutoReplenishment = true
        }));

    // Limiter for player join / rejoin / recovery code (accommodates tables behind pub NAT while blocking brute-force)
    opts.AddPolicy("auth-join", ctx => RateLimitPartition.GetSlidingWindowLimiter(
        $"join:{GetClientIp(ctx)}",
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 25,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 5,
            QueueLimit = 2,
            AutoReplenishment = true
        }));

    opts.AddPolicy("csp-report", ctx => RateLimitPartition.GetFixedWindowLimiter(
        $"csp:{GetClientIp(ctx)}",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));

    // Global baseline limiter against HTTP floods on /api/*
    opts.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        if (!ctx.Request.Path.StartsWithSegments("/api"))
            return RateLimitPartition.GetNoLimiter("static");

        return RateLimitPartition.GetFixedWindowLimiter(
            $"api:{GetClientIp(ctx)}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 180,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 10,
                AutoReplenishment = true
            });
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

// Configure JwtBearer validation using the singleton JwtTokenService signing key
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<JwtTokenService>((jwtOpts, tokenService) =>
    {
        jwtOpts.TokenValidationParameters = tokenService.GetValidationParameters();
        jwtOpts.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // Support JWT in query string ONLY for SignalR (/hubs/quiz?token=...) and protected <audio>/<video>/<img> media URLs
                var token = context.Request.Query["token"].FirstOrDefault()
                            ?? context.Request.Query["access_token"].FirstOrDefault();
                var pathValue = context.HttpContext.Request.Path.Value ?? string.Empty;

                var isSignalR = context.HttpContext.Request.Path.StartsWithSegments("/hubs/quiz");
                var isMediaFile = pathValue.StartsWith("/api/quizzes/", StringComparison.OrdinalIgnoreCase) &&
                                  pathValue.Contains("/media/", StringComparison.OrdinalIgnoreCase);

                if (!string.IsNullOrEmpty(token) && (isSignalR || isMediaFile))
                {
                    context.Token = token;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

builder.Services.Configure<ForwardedHeadersOptions>(opts =>
{
    opts.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Security: ONLY trust arbitrary upstream proxies when running behind a cloud reverse proxy (PORT / QUIZ_TRUST_PROXY).
    // On local LAN, keep default loopback-only proxy trust so Wi-Fi clients cannot spoof X-Forwarded-For to bypass rate limits!
    if (trustProxy)
    {
        opts.KnownIPNetworks.Clear();
        opts.KnownProxies.Clear();
    }
});

var app = builder.Build();

// Safe global exception handling — never expose stack traces or internals in responses
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsync("""{"error":"Interní chyba serveru."}""");
    });
});

app.UseForwardedHeaders();

if (httpsEnabled && pubQuizConfig.Https.RedirectHttpToHttps)
{
    app.UseHttpsRedirection();
}

// Security Headers Middleware (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP)
const string appCspHeader =
    "default-src 'self'; " +
    "script-src 'self' 'report-sample'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "media-src 'self' blob: https:; " +
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com; " +
    "connect-src 'self' ws: wss:; " +
    "font-src 'self' data:; " +
    "object-src 'none'; " +
    "base-uri 'none'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "report-to csp-endpoint";

const string sandboxMediaCspHeader = "default-src 'none'; sandbox";
var hstsMaxAge = Math.Max(0, pubQuizConfig.Https.HstsMaxAgeSeconds);

app.Use((ctx, next) =>
{
    var pathValue = ctx.Request.Path.Value ?? string.Empty;
    var isMediaEndpoint = pathValue.StartsWith("/api/quizzes/", StringComparison.OrdinalIgnoreCase) &&
                          pathValue.Contains("/media/", StringComparison.OrdinalIgnoreCase);

    ctx.Response.OnStarting(() =>
    {
        var headers = ctx.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(), payment=(), usb=(), focus-without-user-activation=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";
        headers["Reporting-Endpoints"] = """csp-endpoint="/api/security/csp-report" """;
        headers["Content-Security-Policy"] = isMediaEndpoint ? sandboxMediaCspHeader : appCspHeader;

        if (ctx.Request.IsHttps && hstsMaxAge > 0)
        {
            headers["Strict-Transport-Security"] = $"max-age={hstsMaxAge}";
        }

        // Prevent caching of auth tokens, host secrets, and live session snapshots
        if (ctx.Request.Path.StartsWithSegments("/api/auth") ||
            ctx.Request.Path.StartsWithSegments("/api/state") ||
            ctx.Request.Path.StartsWithSegments("/api/host"))
        {
            headers["Cache-Control"] = "no-store";
        }

        return Task.CompletedTask;
    });

    return next();
});

// Fetch Metadata Resource Isolation (runs BEFORE authentication to block cross-site API requests & CSRF without timing leaks)
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.Headers.Append("Vary", "Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site");

        var fetchSite = ctx.Request.Headers["Sec-Fetch-Site"].FirstOrDefault();
        if (!string.IsNullOrEmpty(fetchSite))
        {
            var isAllowedSite = string.Equals(fetchSite, "same-origin", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(fetchSite, "none", StringComparison.OrdinalIgnoreCase);

            if (!isAllowedSite)
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                await ctx.Response.WriteAsync("""{"error":"Cross-site požadavek byl z bezpečnostních důvodů odmítnut."}""");
                return;
            }
        }
    }

    await next();
});

// Track public base URL ONLY from validated local/trusted hosts (NetworkInfoService rejects spoofed Host headers)
app.Use((ctx, next) =>
{
    var engine = ctx.RequestServices.GetRequiredService<GameEngineService>();
    engine.UpdatePublicBaseUrlFromRequest(ctx.Request.Scheme, ctx.Request.Host.Value);
    return next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".vtt"] = "text/vtt; charset=utf-8";
contentTypeProvider.Mappings[".webp"] = "image/webp";
contentTypeProvider.Mappings[".svg"] = "image/svg+xml";

// --- Public Health, Security Reporting & Auth Endpoints ---

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", serverUtc = DateTimeOffset.UtcNow }));

// CSP violation report collector with query-string stripping (prevents leaking ?token= / ?code= in logs)
app.MapPost("/api/security/csp-report", async (HttpRequest request, ILoggerFactory loggerFactory) =>
{
    if (request.ContentLength is > 8192)
        return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

    try
    {
        using var reader = new StreamReader(request.Body);
        var raw = await reader.ReadToEndAsync();
        if (raw.Length > 8192) raw = raw[..8192];

        // Redact any query parameters so tokens or join codes never hit server logs
        var sanitized = System.Text.RegularExpressions.Regex.Replace(raw, @"\?[^""'\s}]+", "?[redacted]");
        var logger = loggerFactory.CreateLogger("PubQuizCspReport");
        logger.LogWarning("CSP violation report: {Report}", sanitized);
    }
    catch
    {
        // Ignore malformed reports
    }
    return Results.NoContent();
}).RequireRateLimiting("csp-report");

app.MapPost("/api/auth/host", (HostLoginRequest req, JwtTokenService tokens) =>
{
    if (!tokens.VerifyHostPin(req.Pin))
        return Results.Json(new { error = "Nesprávný PIN moderátora." }, statusCode: StatusCodes.Status401Unauthorized);

    var (jwt, expires) = tokens.IssueToken(QuizRoles.Host);
    return Results.Ok(new AuthTokenResponse(jwt, QuizRoles.Host, null, null, expires));
}).RequireRateLimiting("auth-strict");

app.MapPost("/api/auth/screen", (ScreenPairRequest req, GameEngineService engine, JwtTokenService tokens) =>
{
    if (!engine.VerifyScreenCode(req.Code))
        return Results.Json(new { error = "Neplatný párovací kód obrazovky." }, statusCode: StatusCodes.Status401Unauthorized);

    var (jwt, expires) = tokens.IssueToken(QuizRoles.Screen);
    return Results.Ok(new AuthTokenResponse(jwt, QuizRoles.Screen, null, null, expires));
}).RequireRateLimiting("auth-strict");

app.MapPost("/api/auth/logout", (HttpResponse response) =>
{
    response.Headers["Clear-Site-Data"] = "\"cookies\", \"storage\", \"cache\"";
    return Results.Ok(new { success = true });
});

app.MapPost("/api/auth/join", async (PlayerJoinRequest req, GameEngineService engine, JwtTokenService tokens) =>
{
    string? existingTeamId = null;
    if (!string.IsNullOrWhiteSpace(req.ExistingTeamToken))
    {
        var principal = tokens.ValidateToken(req.ExistingTeamToken);
        if (principal?.FindFirstValue(ClaimTypes.Role) == QuizRoles.Player)
            existingTeamId = principal.FindFirstValue("teamId");
    }

    var (success, team, error) = await engine.JoinOrReconnectTeamAsync(
        req.JoinCode, req.TeamName, req.AvatarId, req.AvatarColor, existingTeamId);

    if (!success || team is null)
        return Results.BadRequest(new { error = error ?? "Nepodařilo se připojit do hry." });

    var (jwt, expires) = tokens.IssueToken(QuizRoles.Player, team.Id, team.Name);
    return Results.Ok(new AuthTokenResponse(jwt, QuizRoles.Player, team.Id, team.Name, expires));
}).RequireRateLimiting("auth-join");

app.MapPost("/api/auth/rejoin", async (RejoinTeamRequest req, GameEngineService engine, JwtTokenService tokens) =>
{
    var (success, team, error) = await engine.RejoinTeamAsync(req);
    if (!success || team is null)
        return Results.BadRequest(new { error = error ?? "Nepodařilo se znovu připojit k týmu." });

    var (jwt, expires) = tokens.IssueToken(QuizRoles.Player, team.Id, team.Name);
    return Results.Ok(new AuthTokenResponse(jwt, QuizRoles.Player, team.Id, team.Name, expires));
}).RequireRateLimiting("auth-join");

app.MapGet("/api/auth/teams-for-rejoin", async (string joinCode, GameEngineService engine) =>
{
    var teams = await engine.GetTeamsForRejoinAsync(joinCode);
    return Results.Ok(teams);
}).RequireRateLimiting("auth-join");

app.MapGet("/api/auth/me", async (ClaimsPrincipal user, GameEngineService engine) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
    var teamId = user.FindFirstValue("teamId");
    var teamName = user.FindFirstValue("teamName");
    var teamExists = role != QuizRoles.Player || await engine.TeamExistsAsync(teamId);
    return Results.Ok(new AuthInfoResponse(role, teamId, teamName, true, teamExists));
}).RequireAuthorization();

// --- Authenticated State & Media Endpoints ---

app.MapGet("/api/state", async (ClaimsPrincipal user, GameEngineService engine) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
    var teamId = user.FindFirstValue("teamId");
    var snapshot = await engine.BuildSnapshotAsync(role, teamId);
    return Results.Ok(snapshot);
}).RequireAuthorization();

app.MapGet("/api/quizzes/{quizId}/media/{**filePath}", (string quizId, string filePath, QuizRepository repo) =>
{
    var fullPath = repo.ResolveMediaFilePath(quizId, filePath);
    if (fullPath is null)
        return Results.NotFound();

    if (!contentTypeProvider.TryGetContentType(fullPath, out var contentType))
        contentType = "application/octet-stream";

    return Results.File(fullPath, contentType, enableRangeProcessing: true);
}).RequireAuthorization();

// --- Host-Only Control Endpoints ---

var hostApi = app.MapGroup("/api/host").RequireAuthorization(policy => policy.RequireRole(QuizRoles.Host));

hostApi.MapGet("/quizzes", (QuizRepository repo) => Results.Ok(repo.ListQuizzes()));

hostApi.MapPost("/quiz/load", async (LoadQuizRequest req, GameEngineService engine) =>
{
    var res = await engine.LoadQuizAsync(req.QuizId, req.Language, keepTeams: true);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/quiz/language", async (LoadQuizRequest req, GameEngineService engine) =>
{
    var res = await engine.SetQuizLanguageAsync(req.Language ?? "cs");
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/intro", async (GameEngineService engine) =>
{
    var res = await engine.StartQuizIntroAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/round/{roundIndex:int}", async (int roundIndex, GameEngineService engine) =>
{
    var res = await engine.StartRoundIntroAsync(roundIndex);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/question", async (int? roundIndex, int? questionIndex, bool? autoStart, GameEngineService engine) =>
{
    var res = await engine.StartQuestionAsync(roundIndex, questionIndex, autoStart);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/start-countdown", async (GameEngineService engine) =>
{
    var res = await engine.StartCountdownAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPatch("/settings", async (UpdateSessionSettingsRequest req, GameEngineService engine) =>
{
    var res = await engine.SetAutoStartTimerAsync(req.AutoStartTimer);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/pause", async (GameEngineService engine) =>
{
    var res = await engine.PauseQuestionAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/resume", async (GameEngineService engine) =>
{
    var res = await engine.ResumeQuestionAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPatch("/game/question-params", async (UpdateQuestionParamsRequest req, GameEngineService engine) =>
{
    var res = await engine.UpdateQuestionParamsAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/lock", async (GameEngineService engine) =>
{
    var res = await engine.LockQuestionAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/reveal", async (GameEngineService engine) =>
{
    var res = await engine.RevealAnswerAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/lobby", async (GameEngineService engine) =>
{
    var res = await engine.ShowLobbyQrAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/leaderboard", async (GameEngineService engine) =>
{
    var res = await engine.ShowLeaderboardAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/return", async (GameEngineService engine) =>
{
    var res = await engine.ReturnToPreviousScreenAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/finish", async (GameEngineService engine) =>
{
    var res = await engine.FinishGameAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/next", async (GameEngineService engine) =>
{
    var res = await engine.AdvanceNextAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/game/reset", async (bool? resetCodes, GameEngineService engine) =>
{
    var res = await engine.ResetSessionAsync(resetCodes ?? false);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/answers/override", async (OverrideEvaluationRequest req, GameEngineService engine) =>
{
    var res = await engine.OverrideAnswerEvaluationAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/teams/adjust-score", async (ManualScoreAdjustmentRequest req, GameEngineService engine) =>
{
    var res = await engine.AdjustTeamScoreAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapDelete("/teams/{teamId}", async (string teamId, GameEngineService engine) =>
{
    var res = await engine.RemoveTeamAsync(teamId);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/screen/banner", async (SendScreenBannerRequest req, GameEngineService engine) =>
{
    var res = await engine.SetScreenBannerAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapDelete("/screen/banner", async (GameEngineService engine) =>
{
    var res = await engine.ClearScreenBannerAsync();
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/players/message", async (SendPlayerMessageRequest req, GameEngineService engine) =>
{
    var res = await engine.SendPlayerMessageAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/tasks/review", async (ReviewBonusTaskClaimRequest req, GameEngineService engine) =>
{
    var res = await engine.ReviewBonusTaskClaimAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

hostApi.MapPost("/tasks/award", async (AwardBonusTaskRequest req, GameEngineService engine) =>
{
    var res = await engine.AwardBonusTaskDirectlyAsync(req);
    return res.Success ? Results.Ok(res) : Results.BadRequest(new { error = res.Error });
});

// --- Host Quiz Designer CRUD & Media Upload Endpoints ---

var designerApi = hostApi.MapGroup("/designer");

designerApi.MapGet("/quizzes", (QuizRepository repo) => Results.Ok(repo.ListQuizzes()));

designerApi.MapGet("/quizzes/{quizId}", (string quizId, QuizRepository repo) =>
{
    var detail = repo.LoadDesignerDetail(quizId);
    return detail is not null ? Results.Ok(detail) : Results.NotFound(new { error = "Kvíz nebyl nalezen." });
});

designerApi.MapPost("/quizzes", async (QuizPackage quiz, QuizRepository repo, GameEngineService engine) =>
{
    var (ok, err, saved) = repo.SaveQuiz(quiz);
    if (!ok || saved is null)
        return Results.BadRequest(new { error = err ?? "Nepodařilo se uložit kvíz." });

    await engine.RefreshLoadedQuizIfMatchingAsync(saved.Id);
    return Results.Ok(repo.LoadDesignerDetail(saved.Id));
});

designerApi.MapPut("/quizzes/{quizId}", async (string quizId, QuizPackage quiz, QuizRepository repo, GameEngineService engine) =>
{
    quiz.Id = quizId;
    var (ok, err, saved) = repo.SaveQuiz(quiz);
    if (!ok || saved is null)
        return Results.BadRequest(new { error = err ?? "Nepodařilo se uložit kvíz." });

    await engine.RefreshLoadedQuizIfMatchingAsync(saved.Id);
    return Results.Ok(repo.LoadDesignerDetail(saved.Id));
});

designerApi.MapDelete("/quizzes/{quizId}", (string quizId, QuizRepository repo) =>
{
    var (ok, err) = repo.DeleteQuiz(quizId);
    return ok ? Results.Ok(new { success = true }) : Results.BadRequest(new { error = err });
});

designerApi.MapPost("/quizzes/{quizId}/duplicate", (string quizId, DuplicateQuizRequest req, QuizRepository repo) =>
{
    var (ok, err, copy) = repo.DuplicateQuiz(quizId, req.NewId, req.NewTitle);
    if (!ok || copy is null)
        return Results.BadRequest(new { error = err ?? "Duplikace se nezdařila." });
    return Results.Ok(repo.LoadDesignerDetail(copy.Id));
});

designerApi.MapPost("/quizzes/{quizId}/media", async (string quizId, HttpRequest request, QuizRepository repo) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Očekáván multipart/form-data požadavek." });

    var form = await request.ReadFormAsync();
    var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
    if (file is null)
        return Results.BadRequest(new { error = "Nebyl přiložen žádný soubor." });

    var (ok, relPath, err) = await repo.SaveMediaFileAsync(quizId, file);
    if (!ok || relPath is null)
        return Results.BadRequest(new { error = err ?? "Nahrání souboru se nezdařilo." });

    return Results.Ok(new { src = relPath, mediaFiles = repo.ListMediaFiles(quizId) });
})
.WithMetadata(new RequestSizeLimitAttribute(52 * 1024 * 1024))
.DisableAntiforgery();

designerApi.MapDelete("/quizzes/{quizId}/media/{*fileName}", (string quizId, string fileName, QuizRepository repo) =>
{
    var (ok, err) = repo.DeleteMediaFile(quizId, fileName);
    return ok ? Results.Ok(new { mediaFiles = repo.ListMediaFiles(quizId) }) : Results.BadRequest(new { error = err });
});

designerApi.MapPut("/quizzes/{quizId}/translations/{lang}", async (string quizId, string lang, QuizTranslation tr, QuizRepository repo, GameEngineService engine) =>
{
    var (ok, err) = repo.SaveTranslation(quizId, lang, tr);
    if (!ok) return Results.BadRequest(new { error = err });
    await engine.RefreshLoadedQuizIfMatchingAsync(quizId);
    return Results.Ok(new { success = true });
});

designerApi.MapDelete("/quizzes/{quizId}/translations/{lang}", async (string quizId, string lang, QuizRepository repo, GameEngineService engine) =>
{
    var (ok, err) = repo.DeleteTranslation(quizId, lang);
    if (!ok) return Results.BadRequest(new { error = err });
    await engine.RefreshLoadedQuizIfMatchingAsync(quizId);
    return Results.Ok(new { success = true });
});

// --- SignalR Hub ---
app.MapHub<QuizHub>("/hubs/quiz");

// --- SPA Fallback for /screen, /host, /play ---
app.MapFallbackToFile("index.html");

// Print clear startup info for the host (PIN, Screen Code, Join Code, HTTPS LAN URLs, Local CA path)
app.Lifetime.ApplicationStarted.Register(() =>
{
    var tokens = app.Services.GetRequiredService<JwtTokenService>();
    var engine = app.Services.GetRequiredService<GameEngineService>();
    var net = app.Services.GetRequiredService<NetworkInfoService>();
    var server = app.Services.GetRequiredService<IServer>();
    var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("PubQuizStartup");

    var boundUris = (server.Features.Get<IServerAddressesFeature>()?.Addresses ?? [])
        .Select(a => Uri.TryCreate(
            a.Replace("://*", "://localhost").Replace("://+", "://localhost").Replace("://0.0.0.0", "://localhost"),
            UriKind.Absolute,
            out var u) ? u : null)
        .Where(u => u is not null)
        .Cast<Uri>()
        .ToList();

    // Prefer HTTPS endpoint when both HTTPS and HTTP redirect ports are bound
    var primaryUri = boundUris.FirstOrDefault(u => u.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
        ?? boundUris.FirstOrDefault();

    if (primaryUri is not null && primaryUri.Port > 0)
    {
        net.SetBoundEndpoint(primaryUri.Scheme, primaryUri.Port);
        engine.UpdatePublicBaseUrlFromRequest(primaryUri.Scheme, $"localhost:{primaryUri.Port}");
    }

    var baseUrl = net.GetPublicBaseUrl();
    var tlsInfoLine = resolvedTlsCert is not null
        ? $"  TLS / HTTPS          : aktivní ({resolvedTlsCert.SourceDescription})"
        : "  TLS / HTTPS          : vypnuto (za reverse proxy / HTTP)";
    var caHintLine = resolvedTlsCert?.CaCertificatePemPath is not null
        ? $"\n  Lokální CA certifikát: {resolvedTlsCert.CaCertificatePemPath}"
        : string.Empty;

    logger.LogInformation("""

        ============================================================
          PubQuiz Engine spuštěn!
          Lokální / LAN adresa : {BaseUrl}
          Moderátor (/host)    : {HostUrl}  | PIN: {HostPin}
          Projektor (/screen)  : {ScreenUrl}
          Hráči (/play)        : {PlayUrl}
        {TlsInfo}{CaHint}
        ============================================================
        """,
        baseUrl,
        $"{baseUrl}/host",
        tokens.HostPin,
        $"{baseUrl}/screen?code={engine.ScreenCode}",
        $"{baseUrl}/play?join={engine.JoinCode}",
        tlsInfoLine,
        caHintLine);
});

app.Run();
