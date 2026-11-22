namespace PubQuiz.Server.Models;

public static class QuizRoles
{
    public const string Host = "Host";
    public const string Screen = "Screen";
    public const string Player = "Player";
}

public sealed class HttpsOptions
{
    public bool Enabled { get; set; } = true;
    public int Port { get; set; } = 5443;
    public int HttpRedirectPort { get; set; } = 5080;
    public bool RedirectHttpToHttps { get; set; } = true;
    public string CertificatePath { get; set; } = string.Empty;
    public string CertificateKeyPath { get; set; } = string.Empty;
    public string CertificatePassword { get; set; } = string.Empty;
    public int HstsMaxAgeSeconds { get; set; } = 300;
}

public sealed class PubQuizOptions
{
    public string QuizzesDirectory { get; set; } = "quizzes";
    public string StateDirectory { get; set; } = "state";
    public string HostPin { get; set; } = string.Empty;
    public string PublicBaseUrl { get; set; } = string.Empty;
    public string JwtIssuer { get; set; } = "PubQuizEngine";
    public string JwtAudience { get; set; } = "PubQuizClients";
    public string JwtSecret { get; set; } = string.Empty;
    public int LatePacketGraceMs { get; set; } = 450;
    public int MaxLatencyCompensationMs { get; set; } = 500;
    public bool TrustForwardedHeaders { get; set; } = false;
    public HttpsOptions Https { get; set; } = new();
}

public sealed record HostLoginRequest(string Pin);

public sealed record ScreenPairRequest(string Code);

public sealed record PlayerJoinRequest(
    string JoinCode,
    string TeamName,
    string? AvatarId,
    string? AvatarColor,
    string? ExistingTeamToken
);

public sealed record AuthTokenResponse(
    string Token,
    string Role,
    string? TeamId,
    string? TeamName,
    DateTimeOffset ExpiresAtUtc
);

public sealed record AuthInfoResponse(
    string Role,
    string? TeamId,
    string? TeamName,
    bool IsValid,
    bool TeamExists = true
);
