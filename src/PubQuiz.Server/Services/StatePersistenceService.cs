using System.Text.Json;
using Microsoft.Extensions.Options;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed class StatePersistenceService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _sessionFilePath;
    private readonly ILogger<StatePersistenceService> _logger;

    public StatePersistenceService(IOptions<PubQuizOptions> options, IHostEnvironment env, ILogger<StatePersistenceService> logger)
    {
        _logger = logger;
        var envDataDir = Environment.GetEnvironmentVariable("QUIZ_DATA_DIR");
        var stateDir = !string.IsNullOrWhiteSpace(envDataDir)
            ? Path.GetFullPath(Path.Combine(envDataDir, "state"))
            : JwtTokenService.ResolvePath(env.ContentRootPath, options.Value.StateDirectory);

        Directory.CreateDirectory(stateDir);
        _sessionFilePath = Path.Combine(stateDir, "active-session.json");
    }

    public string SessionFilePath => _sessionFilePath;

    public ActiveSessionData? LoadSession()
    {
        if (!File.Exists(_sessionFilePath))
            return null;

        try
        {
            var json = File.ReadAllText(_sessionFilePath);
            return JsonSerializer.Deserialize<ActiveSessionData>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load persisted session from {Path}", _sessionFilePath);
            return null;
        }
    }

    public void SaveSessionAtomic(ActiveSessionData session)
    {
        try
        {
            session.UpdatedAtUtc = DateTimeOffset.UtcNow;
            var json = JsonSerializer.Serialize(session, JsonOptions);
            var tempPath = _sessionFilePath + ".tmp";
            File.WriteAllText(tempPath, json);
            LocalTlsCertificateService.RestrictFilePermissions(tempPath);
            File.Move(tempPath, _sessionFilePath, overwrite: true);
            LocalTlsCertificateService.RestrictFilePermissions(_sessionFilePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist active session to {Path}", _sessionFilePath);
        }
    }
}
