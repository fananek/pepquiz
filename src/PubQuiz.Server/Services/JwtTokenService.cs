using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed class RuntimeSecrets
{
    public string JwtSecret { get; set; } = string.Empty;
    public string HostPin { get; set; } = string.Empty;
}

public sealed class JwtTokenService
{
    private readonly PubQuizOptions _options;
    private readonly SymmetricSecurityKey _signingKey;
    private readonly SigningCredentials _signingCredentials;
    private readonly ConcurrentDictionary<string, DateTimeOffset> _screenLaunchTokens = new(StringComparer.Ordinal);
    public string HostPin { get; }

    public JwtTokenService(IOptions<PubQuizOptions> options, IHostEnvironment env)
    {
        _options = options.Value;
        var envDataDir = Environment.GetEnvironmentVariable("QUIZ_DATA_DIR");
        var stateDir = !string.IsNullOrWhiteSpace(envDataDir)
            ? Path.GetFullPath(Path.Combine(envDataDir, "state"))
            : ResolvePath(env.ContentRootPath, _options.StateDirectory);
        Directory.CreateDirectory(stateDir);

        var secretsFile = Path.Combine(stateDir, "runtime-secrets.json");
        var persisted = LoadOrCreateSecrets(secretsFile);

        var envJwt = Environment.GetEnvironmentVariable("QUIZ_JWT_SECRET");
        var effectiveSecret = !string.IsNullOrWhiteSpace(envJwt) ? envJwt
            : !string.IsNullOrWhiteSpace(_options.JwtSecret) ? _options.JwtSecret
            : persisted.JwtSecret;

        var envPin = Environment.GetEnvironmentVariable("QUIZ_HOST_PIN");
        HostPin = !string.IsNullOrWhiteSpace(envPin) ? envPin.Trim()
            : !string.IsNullOrWhiteSpace(_options.HostPin) ? _options.HostPin.Trim()
            : persisted.HostPin;

        var keyBytes = Encoding.UTF8.GetBytes(effectiveSecret);
        if (keyBytes.Length < 32)
            keyBytes = SHA256.HashData(keyBytes);

        _signingKey = new SymmetricSecurityKey(keyBytes);
        _signingCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256);
    }

    public TokenValidationParameters GetValidationParameters() => new()
    {
        ValidateIssuer = true,
        ValidIssuer = _options.JwtIssuer,
        ValidateAudience = true,
        ValidAudience = _options.JwtAudience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = _signingKey,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
        RoleClaimType = ClaimTypes.Role
    };

    public (string Token, DateTimeOffset ExpiresAtUtc) IssueToken(string role, string? teamId = null, string? teamName = null)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.AddHours(24);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, teamId ?? role.ToLowerInvariant()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(ClaimTypes.Role, role)
        };

        if (!string.IsNullOrWhiteSpace(teamId))
            claims.Add(new Claim("teamId", teamId));
        if (!string.IsNullOrWhiteSpace(teamName))
            claims.Add(new Claim("teamName", teamName));

        var descriptor = new JwtSecurityToken(
            issuer: _options.JwtIssuer,
            audience: _options.JwtAudience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: _signingCredentials
        );

        var token = new JwtSecurityTokenHandler().WriteToken(descriptor);
        return (token, expires);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            return handler.ValidateToken(token, GetValidationParameters(), out _);
        }
        catch
        {
            return null;
        }
    }

    public bool VerifyHostPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin))
            return false;

        var expected = Encoding.UTF8.GetBytes(HostPin);
        var actual = Encoding.UTF8.GetBytes(pin.Trim());
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(expected),
            SHA256.HashData(actual));
    }

    /// <summary>
    /// Creates a cryptographically random, single-use, short-lived launch token so an authenticated Host
    /// can open /screen on another computer/TV without typing or exposing the Host PIN in a URL.
    /// </summary>
    public (string LaunchToken, DateTimeOffset ExpiresAtUtc) CreateScreenLaunchToken(TimeSpan? ttl = null)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var kv in _screenLaunchTokens)
        {
            if (kv.Value <= now)
                _screenLaunchTokens.TryRemove(kv.Key, out _);
        }

        // Cap active launch tokens defensively
        if (_screenLaunchTokens.Count >= 32)
        {
            var oldest = _screenLaunchTokens.OrderBy(kv => kv.Value).FirstOrDefault();
            if (!string.IsNullOrEmpty(oldest.Key))
                _screenLaunchTokens.TryRemove(oldest.Key, out _);
        }

        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(24));
        var expires = now.Add(ttl ?? TimeSpan.FromMinutes(5));
        _screenLaunchTokens[token] = expires;
        return (token, expires);
    }

    /// <summary>
    /// Atomically consumes a one-time screen launch token. Returns true only once before expiration.
    /// </summary>
    public bool ConsumeScreenLaunchToken(string? launchToken)
    {
        if (string.IsNullOrWhiteSpace(launchToken))
            return false;

        var trimmed = launchToken.Trim();
        return _screenLaunchTokens.TryRemove(trimmed, out var expiresAtUtc)
            && expiresAtUtc > DateTimeOffset.UtcNow;
    }

    private static RuntimeSecrets LoadOrCreateSecrets(string secretsFile)
    {
        if (File.Exists(secretsFile))
        {
            try
            {
                var existing = JsonSerializer.Deserialize<RuntimeSecrets>(File.ReadAllText(secretsFile));
                if (existing is not null &&
                    !string.IsNullOrWhiteSpace(existing.JwtSecret) &&
                    !string.IsNullOrWhiteSpace(existing.HostPin))
                {
                    return existing;
                }
            }
            catch
            {
                // Regenerate if corrupt
            }
        }

        var secrets = new RuntimeSecrets
        {
            JwtSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)),
            HostPin = RandomNumberGenerator.GetInt32(100000, 1000000).ToString()
        };

        var json = JsonSerializer.Serialize(secrets, new JsonSerializerOptions { WriteIndented = true });
        LocalTlsCertificateService.WriteSecretFile(secretsFile, Encoding.UTF8.GetBytes(json));
        return secrets;
    }

    public static string ResolvePath(string contentRoot, string configuredPath)
    {
        if (Path.IsPathRooted(configuredPath))
            return configuredPath;

        // Prefer workspace root if running from src/PubQuiz.Server
        var candidate = Path.GetFullPath(Path.Combine(contentRoot, configuredPath));
        if (Directory.Exists(candidate))
            return candidate;

        var repoRootCandidate = Path.GetFullPath(Path.Combine(contentRoot, "..", "..", configuredPath));
        if (Directory.Exists(repoRootCandidate))
            return repoRootCandidate;

        // For state directory, prefer repo root if quizzes exist there
        var repoQuizzes = Path.GetFullPath(Path.Combine(contentRoot, "..", "..", "quizzes"));
        if (Directory.Exists(repoQuizzes))
            return repoRootCandidate;

        return candidate;
    }
}
