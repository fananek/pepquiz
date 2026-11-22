using System.Security.Cryptography;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using PubQuiz.Server.Hubs;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed record OperationResult(bool Success, string? Error = null);

public sealed record SubmitAnswerResult(
    bool Success,
    string? Error,
    int? AnswerSequence,
    double? EffectiveElapsedSeconds,
    bool AlreadySubmitted
);

public sealed class GameEngineService : IDisposable
{
    private const int MaxTeamsPerSession = 200;
    private const int MaxAnswerTextLength = 300;
    private const int MaxOrderedItemsCount = 20;
    private const int MaxOrderedItemLength = 200;
    private const int MaxBannerLength = 300;
    private const int MaxPlayerMessageLength = 500;
    private const int MaxReasonLength = 200;

    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly QuizRepository _quizRepository;
    private readonly StatePersistenceService _persistence;
    private readonly NetworkInfoService _networkInfo;
    private readonly IHubContext<QuizHub> _hubContext;
    private readonly PubQuizOptions _options;
    private readonly ILogger<GameEngineService> _logger;

    private ActiveSessionData _session;
    private QuizPackage? _loadedQuiz;
    private Dictionary<string, int> _previousRanks = new();
    private readonly Dictionary<string, HashSet<string>> _teamConnections = new(StringComparer.Ordinal);
    private CancellationTokenSource? _questionTimerCts;
    private string _cachedBaseUrl;

    public GameEngineService(
        QuizRepository quizRepository,
        StatePersistenceService persistence,
        NetworkInfoService networkInfo,
        IHubContext<QuizHub> hubContext,
        IOptions<PubQuizOptions> options,
        ILogger<GameEngineService> logger)
    {
        _quizRepository = quizRepository;
        _persistence = persistence;
        _networkInfo = networkInfo;
        _hubContext = hubContext;
        _options = options.Value;
        _logger = logger;
        _cachedBaseUrl = _networkInfo.GetPublicBaseUrl();

        var restored = _persistence.LoadSession();
        if (restored is not null && !string.IsNullOrWhiteSpace(restored.JoinCode))
        {
            _session = restored;
            if (_session.JoinCode.Trim().Length < 6)
                _session.JoinCode = GenerateCode(6);
            if (string.IsNullOrWhiteSpace(_session.ScreenCode) || _session.ScreenCode.Trim().Length < 6)
                _session.ScreenCode = GenerateCode(6);
            foreach (var team in _session.Teams.Values)
            {
                team.IsConnected = false;
                if (string.IsNullOrWhiteSpace(team.RecoveryCode))
                    team.RecoveryCode = GenerateUniqueRecoveryCodeUnlocked();
            }

            if (!string.IsNullOrWhiteSpace(_session.QuizId))
                _loadedQuiz = _quizRepository.LoadQuiz(_session.QuizId, _session.QuizLanguage);

            // Crash recovery safety: if server stopped mid-question, restore paused with preserved remaining time
            if (_session.State == GameState.QuestionActive && !_session.IsPaused)
            {
                var remaining = _session.QuestionEndsAtUtc.HasValue
                    ? Math.Max(5.0, (_session.QuestionEndsAtUtc.Value - DateTimeOffset.UtcNow).TotalSeconds)
                    : Math.Max(5.0, _session.ActiveTimeLimitSeconds);
                _session.IsPaused = true;
                _session.PausedRemainingSeconds = Math.Min(remaining, _session.ActiveTimeLimitSeconds);
                _session.QuestionEndsAtUtc = null;
            }

            _persistence.SaveSessionAtomic(_session);
            _logger.LogInformation("Restored active quiz session {SessionId} in state {State} with {TeamCount} teams.",
                _session.SessionId, _session.State, _session.Teams.Count);
        }
        else
        {
            _session = CreateFreshSession();
            var available = _quizRepository.ListQuizzes();
            var preferred = available.FirstOrDefault(q => q.Id == "demo-kviz") ?? available.FirstOrDefault();
            if (preferred is not null)
            {
                _loadedQuiz = _quizRepository.LoadQuiz(preferred.Id, preferred.DefaultLanguage);
                _session.QuizId = _loadedQuiz?.Id;
                _session.QuizLanguage = _loadedQuiz?.DefaultLanguage ?? "cs";
                _session.AutoStartTimer = _loadedQuiz?.Settings.AutoStartTimer ?? false;
            }
            _persistence.SaveSessionAtomic(_session);
        }
    }

    public string JoinCode => _session.JoinCode;
    public string ScreenCode => _session.ScreenCode;

    public void UpdatePublicBaseUrlFromRequest(string? scheme, string? host)
    {
        var computed = _networkInfo.GetPublicBaseUrl(scheme, host);
        if (!string.IsNullOrWhiteSpace(computed))
            _cachedBaseUrl = computed;
    }

    public bool VerifyScreenCode(string? code) =>
        ConstantTimeEqualsIgnoreCase(code?.Trim(), _session.ScreenCode);

    public bool VerifyJoinCode(string? code) =>
        ConstantTimeEqualsIgnoreCase(code?.Trim(), _session.JoinCode);

    private static bool ConstantTimeEqualsIgnoreCase(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
            return false;

        var aBytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(a.ToUpperInvariant()));
        var bBytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(b.ToUpperInvariant()));
        return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }

    public async Task<bool> TeamExistsAsync(string? teamId)
    {
        if (string.IsNullOrWhiteSpace(teamId)) return false;
        await _lock.WaitAsync();
        try
        {
            return _session.Teams.ContainsKey(teamId);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<PublicTeamSummaryDto>> GetTeamsForRejoinAsync(string? joinCode)
    {
        await _lock.WaitAsync();
        try
        {
            if (!VerifyJoinCode(joinCode))
                return [];

            return _session.Teams.Values
                .OrderByDescending(t => t.Score)
                .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
                .Select(t => new PublicTeamSummaryDto(
                    t.Id,
                    t.Name,
                    t.AvatarId,
                    t.AvatarColor,
                    t.IsConnected,
                    t.Score
                ))
                .ToList();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<(bool Success, TeamState? Team, string? Error)> JoinOrReconnectTeamAsync(
        string? joinCode,
        string? teamName,
        string? avatarId,
        string? avatarColor,
        string? existingTeamId)
    {
        await _lock.WaitAsync();
        try
        {
            // Fast reconnect with valid existing teamId from verified JWT
            if (!string.IsNullOrWhiteSpace(existingTeamId) && _session.Teams.TryGetValue(existingTeamId, out var existing))
            {
                existing.LastSeenUtc = DateTimeOffset.UtcNow;
                if (!string.IsNullOrWhiteSpace(teamName))
                    existing.Name = SanitizeTeamName(teamName);
                if (!string.IsNullOrWhiteSpace(avatarId))
                    existing.AvatarId = SanitizeAvatarId(avatarId);
                if (!string.IsNullOrWhiteSpace(avatarColor))
                    existing.AvatarColor = SanitizeAvatarColor(avatarColor);
                _persistence.SaveSessionAtomic(_session);
                await BroadcastStateUnlockedAsync();
                return (true, existing, null);
            }

            if (!VerifyJoinCode(joinCode))
                return (false, null, "Neplatný kód hry. Zkontrolujte kód na projektoru.");

            var cleanName = SanitizeTeamName(teamName);
            if (string.IsNullOrWhiteSpace(cleanName) || cleanName.Length < 2)
                return (false, null, "Název týmu musí mít alespoň 2 znaky.");

            var duplicate = _session.Teams.Values.FirstOrDefault(
                t => string.Equals(t.Name, cleanName, StringComparison.OrdinalIgnoreCase));
            if (duplicate is not null)
            {
                // Seamless recovery: if this team is currently offline, let them immediately reclaim their progress!
                if (!duplicate.IsConnected)
                {
                    duplicate.LastSeenUtc = DateTimeOffset.UtcNow;
                    if (!string.IsNullOrWhiteSpace(avatarId))
                        duplicate.AvatarId = SanitizeAvatarId(avatarId);
                    if (!string.IsNullOrWhiteSpace(avatarColor))
                        duplicate.AvatarColor = SanitizeAvatarColor(avatarColor);
                    _persistence.SaveSessionAtomic(_session);
                    await BroadcastStateUnlockedAsync();
                    return (true, duplicate, null);
                }

                return (false, null, "Tým s tímto názvem je právě online. Pro převzetí týmu na jiné zařízení použijte záložku „Vrátit se do týmu“ s obnovovacím kódem.");
            }

            if (_session.Teams.Count >= MaxTeamsPerSession)
                return (false, null, "Byl dosažen maximální počet týmů v jedné hře.");

            var team = new TeamState
            {
                Id = "team-" + Guid.NewGuid().ToString("N")[..8],
                Name = cleanName,
                AvatarId = SanitizeAvatarId(avatarId),
                AvatarColor = SanitizeAvatarColor(avatarColor),
                RecoveryCode = GenerateUniqueRecoveryCodeUnlocked(),
                Score = 0,
                IsConnected = false, // Set to true immediately when SignalR connects (or via RegisterTeamConnectionAsync)
                JoinedAtUtc = DateTimeOffset.UtcNow,
                LastSeenUtc = DateTimeOffset.UtcNow
            };

            _session.Teams[team.Id] = team;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return (true, team, null);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<(bool Success, TeamState? Team, string? Error)> RejoinTeamAsync(RejoinTeamRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            // Method 1: RecoveryCode (works from any device, even if old device hasn't timed out yet!)
            if (!string.IsNullOrWhiteSpace(req.RecoveryCode))
            {
                var code = req.RecoveryCode.Trim();
                // Evaluate all teams in constant time without short-circuit timing leakage
                TeamState? byCode = null;
                foreach (var candidate in _session.Teams.Values)
                {
                    if (ConstantTimeEqualsIgnoreCase(candidate.RecoveryCode, code))
                        byCode = candidate;
                }
                if (byCode is null)
                    return (false, null, "Neplatný obnovovací kód týmu. Vyžádejte si kód nebo QR odkaz od moderátora.");

                byCode.LastSeenUtc = DateTimeOffset.UtcNow;
                _persistence.SaveSessionAtomic(_session);
                await BroadcastStateUnlockedAsync();
                return (true, byCode, null);
            }

            // Method 2: JoinCode + TeamId / TeamName (allowed seamlessly when team is offline)
            if (!VerifyJoinCode(req.JoinCode))
                return (false, null, "Neplatný kód hry.");

            TeamState? matched = null;
            if (!string.IsNullOrWhiteSpace(req.TeamId))
            {
                _session.Teams.TryGetValue(req.TeamId.Trim(), out matched);
            }
            else if (!string.IsNullOrWhiteSpace(req.TeamName))
            {
                var target = req.TeamName.Trim();
                matched = _session.Teams.Values.FirstOrDefault(
                    t => string.Equals(t.Name, target, StringComparison.OrdinalIgnoreCase));
            }

            if (matched is null)
                return (false, null, "Vybraný tým nebyl v aktuální hře nalezen.");

            if (matched.IsConnected)
                return (false, null, "Tento tým je stále připojen na jiném zařízení. Zadejte 6znakový obnovovací kód týmu od moderátora.");

            matched.LastSeenUtc = DateTimeOffset.UtcNow;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return (true, matched, null);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> UpdateTeamProfileAsync(string teamId, UpdateProfileRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(teamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var cleanName = SanitizeTeamName(req.TeamName);
            if (cleanName.Length < 2)
                return new OperationResult(false, "Název týmu musí mít alespoň 2 znaky.");

            var duplicate = _session.Teams.Values.FirstOrDefault(
                t => t.Id != teamId && string.Equals(t.Name, cleanName, StringComparison.OrdinalIgnoreCase));
            if (duplicate is not null)
                return new OperationResult(false, "Tým s tímto názvem už existuje.");

            team.Name = cleanName;
            if (!string.IsNullOrWhiteSpace(req.AvatarId)) team.AvatarId = SanitizeAvatarId(req.AvatarId);
            if (!string.IsNullOrWhiteSpace(req.AvatarColor)) team.AvatarColor = SanitizeAvatarColor(req.AvatarColor);
            team.LastSeenUtc = DateTimeOffset.UtcNow;

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>
    /// Reference-counted SignalR connection registration so page reloads never cause
    /// the closing old socket to mark an actively reconnected team offline.
    /// </summary>
    public async Task<bool> RegisterTeamConnectionAsync(string teamId, string connectionId)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(teamId, out var team))
                return false;

            if (!_teamConnections.TryGetValue(teamId, out var set))
            {
                set = new HashSet<string>(StringComparer.Ordinal);
                _teamConnections[teamId] = set;
            }

            set.Add(connectionId);
            var wasConnected = team.IsConnected;
            team.IsConnected = true;
            team.LastSeenUtc = DateTimeOffset.UtcNow;

            if (!wasConnected)
            {
                await BroadcastStateUnlockedAsync();
            }

            return true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task UnregisterTeamConnectionAsync(string teamId, string connectionId)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(teamId, out var team))
                return;

            if (_teamConnections.TryGetValue(teamId, out var set))
            {
                set.Remove(connectionId);
                if (set.Count > 0)
                {
                    // Another live socket (e.g. from page reload) is already connected!
                    return;
                }
            }

            if (team.IsConnected)
            {
                team.IsConnected = false;
                team.LastSeenUtc = DateTimeOffset.UtcNow;
                await BroadcastStateUnlockedAsync();
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task UpdateTeamLatencyAsync(string teamId, int oneWayLatencyMs)
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.Teams.TryGetValue(teamId, out var team))
            {
                var clamped = Math.Clamp(oneWayLatencyMs, 0, 2000);
                team.LastLatencyMs = team.LastLatencyMs == 0
                    ? clamped
                    : (int)Math.Round(team.LastLatencyMs * 0.6 + clamped * 0.4);
                team.LastSeenUtc = DateTimeOffset.UtcNow;
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> RemoveTeamAsync(string teamId)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.Remove(teamId))
                return new OperationResult(false, "Tým nebyl nalezen.");

            _teamConnections.Remove(teamId);
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> SetAutoStartTimerAsync(bool autoStart)
    {
        await _lock.WaitAsync();
        try
        {
            _session.AutoStartTimer = autoStart;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task RefreshLoadedQuizIfMatchingAsync(string quizId)
    {
        await _lock.WaitAsync();
        try
        {
            if (string.Equals(_session.QuizId, quizId, StringComparison.OrdinalIgnoreCase))
            {
                var reloaded = _quizRepository.LoadQuiz(quizId, _session.QuizLanguage);
                if (reloaded is not null)
                {
                    _loadedQuiz = reloaded;
                    await BroadcastStateUnlockedAsync();
                }
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> LoadQuizAsync(string quizId, string? language = null, bool keepTeams = true)
    {
        await _lock.WaitAsync();
        try
        {
            var quiz = _quizRepository.LoadQuiz(quizId, language);
            if (quiz is null)
                return new OperationResult(false, $"Kvíz '{quizId}' nebyl nalezen.");

            CancelTimerUnlocked();
            _loadedQuiz = quiz;

            var preservedTeams = keepTeams ? _session.Teams : new Dictionary<string, TeamState>();
            foreach (var team in preservedTeams.Values)
            {
                team.Score = 0;
                team.JokersUsed = 0;
                team.PreSelectedJokerQuestionIds.Clear();
                team.DismissedMessageIds.Clear();
                team.ManualAdjustments.Clear();
                team.CorrectCount = 0;
                team.HalfPointCount = 0;
                team.WrongCount = 0;
                team.TotalResponseTimeMs = 0;
                team.ResponseCount = 0;
                team.PointsByRound.Clear();
            }

            _session.QuizId = quiz.Id;
            _session.QuizLanguage = string.IsNullOrWhiteSpace(language) ? quiz.DefaultLanguage : language;
            _session.AutoStartTimer = quiz.Settings.AutoStartTimer;
            _session.State = GameState.Lobby;
            _session.ReturnScreen = null;
            _session.CurrentRoundIndex = -1;
            _session.CurrentQuestionIndex = -1;
            _session.QuestionStartedAtUtc = null;
            _session.QuestionEndsAtUtc = null;
            _session.IsPaused = false;
            _session.PausedRemainingSeconds = null;
            _session.ShuffledOrderingOptions = null;
            _session.QuestionOverrides.Clear();
            _session.AnswersByQuestion.Clear();
            _session.BonusTaskClaims.Clear();
            _session.Teams = preservedTeams;
            _session.ScreenBanner = null;
            _previousRanks.Clear();

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> SetQuizLanguageAsync(string language)
    {
        await _lock.WaitAsync();
        try
        {
            if (string.IsNullOrWhiteSpace(_session.QuizId))
                return new OperationResult(false, "Není načten žádný kvíz.");

            var reloaded = _quizRepository.LoadQuiz(_session.QuizId, language);
            if (reloaded is null)
                return new OperationResult(false, "Nepodařilo se načíst jazykovou mutaci.");

            _loadedQuiz = reloaded;
            _session.QuizLanguage = language;

            var currentQ = GetCurrentQuestionUnlocked();
            if (currentQ is { Type: QuestionType.Ordering })
            {
                _session.ShuffledOrderingOptions = DeterministicShuffle(
                    currentQ.GetEffectiveCorrectOrder(),
                    $"{_session.SessionId}:{currentQ.Id}");
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ResetSessionAsync(bool resetCodes = false)
    {
        await _lock.WaitAsync();
        try
        {
            CancelTimerUnlocked();
            var quizId = _session.QuizId;
            var quizLang = _session.QuizLanguage;
            var autoStart = _session.AutoStartTimer;
            var joinCode = resetCodes ? GenerateCode(6) : _session.JoinCode;
            var screenCode = resetCodes ? GenerateCode(6) : _session.ScreenCode;

            _session = CreateFreshSession(joinCode, screenCode);
            _session.QuizId = quizId;
            _session.QuizLanguage = quizLang;
            _session.AutoStartTimer = autoStart;
            if (!string.IsNullOrWhiteSpace(quizId))
                _loadedQuiz = _quizRepository.LoadQuiz(quizId, quizLang);
            _previousRanks.Clear();
            _teamConnections.Clear();

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> StartQuizIntroAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null)
                return new OperationResult(false, "Nejprve vyberte kvízový balíček.");

            CancelTimerUnlocked();
            _session.State = GameState.QuizIntro;
            _session.ReturnScreen = null;
            _session.IsPaused = false;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> StartRoundIntroAsync(int? roundIndex = null)
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null || _loadedQuiz.Rounds.Count == 0)
                return new OperationResult(false, "Kvíz neobsahuje žádná kola.");

            var targetRound = roundIndex ?? (_session.CurrentRoundIndex + 1);
            if (targetRound < 0 || targetRound >= _loadedQuiz.Rounds.Count)
                return new OperationResult(false, "Neplatný index kola.");

            CancelTimerUnlocked();
            _session.CurrentRoundIndex = targetRound;
            _session.CurrentQuestionIndex = -1;
            _session.State = GameState.RoundIntro;
            _session.ReturnScreen = null;
            _session.IsPaused = false;
            _session.PausedRemainingSeconds = null;
            _session.QuestionStartedAtUtc = null;
            _session.QuestionEndsAtUtc = null;

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>
    /// Opens a question. When AutoStartTimer is false (default), enters QuestionReady and waits for StartCountdownAsync().
    /// </summary>
    public async Task<OperationResult> StartQuestionAsync(int? roundIndex = null, int? questionIndex = null, bool? autoStartOverride = null)
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null || _loadedQuiz.Rounds.Count == 0)
                return new OperationResult(false, "Není načten žádný kvíz.");

            var rIdx = roundIndex ?? Math.Max(0, _session.CurrentRoundIndex);
            if (rIdx < 0 || rIdx >= _loadedQuiz.Rounds.Count)
                return new OperationResult(false, "Neplatné kolo.");

            var round = _loadedQuiz.Rounds[rIdx];
            var qIdx = questionIndex ?? (rIdx == _session.CurrentRoundIndex ? _session.CurrentQuestionIndex + 1 : 0);
            if (qIdx < 0 || qIdx >= round.Questions.Count)
                return new OperationResult(false, "V tomto kole už nejsou další otázky.");

            var question = round.Questions[qIdx];
            CancelTimerUnlocked();

            _session.ReturnScreen = null;
            _session.CurrentRoundIndex = rIdx;
            _session.CurrentQuestionIndex = qIdx;
            _session.IsPaused = false;
            _session.CurrentQuestionSequenceCounter = 0;

            _session.QuestionOverrides.TryGetValue(question.Id, out var overrides);

            var timeLimit = overrides?.TimeLimitSeconds ?? question.TimeLimitSeconds ?? _loadedQuiz.Settings.DefaultTimeLimitSeconds;
            var basePoints = overrides?.BasePoints ?? question.BasePoints ?? (int)Math.Round(_loadedQuiz.Settings.BasePoints * round.PointMultiplier);
            var speedBonus = overrides?.SpeedBonusMax ?? question.SpeedBonusMax ?? _loadedQuiz.Settings.SpeedBonusMax;
            var gracePeriod = overrides?.GracePeriodSeconds ?? question.GracePeriodSeconds ?? _loadedQuiz.Settings.GracePeriodSeconds;

            _session.ActiveTimeLimitSeconds = Math.Max(5, timeLimit);
            _session.ActiveBasePoints = Math.Max(0, basePoints);
            _session.ActiveSpeedBonusMax = Math.Max(0, speedBonus);
            _session.ActiveGracePeriodSeconds = Math.Clamp(gracePeriod, 0, (int)_session.ActiveTimeLimitSeconds);

            _session.ShuffledOrderingOptions = question.Type == QuestionType.Ordering
                ? DeterministicShuffle(question.GetEffectiveCorrectOrder(), $"{_session.SessionId}:{question.Id}")
                : null;

            if (!_session.AnswersByQuestion.ContainsKey(question.Id))
                _session.AnswersByQuestion[question.Id] = new Dictionary<string, TeamAnswerRecord>();

            var shouldAutoStart = autoStartOverride ?? _session.AutoStartTimer;
            if (shouldAutoStart)
            {
                var now = DateTimeOffset.UtcNow;
                _session.State = GameState.QuestionActive;
                _session.PausedRemainingSeconds = null;
                _session.QuestionStartedAtUtc = now;
                _session.QuestionEndsAtUtc = now.AddSeconds(_session.ActiveTimeLimitSeconds);
                ScheduleAutoLockUnlocked(question.Id, TimeSpan.FromSeconds(_session.ActiveTimeLimitSeconds) + TimeSpan.FromMilliseconds(_options.LatePacketGraceMs));
            }
            else
            {
                _session.State = GameState.QuestionReady;
                _session.QuestionStartedAtUtc = null;
                _session.QuestionEndsAtUtc = null;
                _session.PausedRemainingSeconds = _session.ActiveTimeLimitSeconds;
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>
    /// Host triggers the countdown & unlocks answering from QuestionReady -> QuestionActive.
    /// </summary>
    public async Task<OperationResult> StartCountdownAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State != GameState.QuestionReady)
                return new OperationResult(false, "Odpočet lze spustit jen z připravené otázky.");

            var question = GetCurrentQuestionUnlocked();
            if (question is null)
                return new OperationResult(false, "Aktivní otázka nebyla nalezena.");

            var duration = Math.Max(5.0, _session.PausedRemainingSeconds ?? _session.ActiveTimeLimitSeconds);
            var now = DateTimeOffset.UtcNow;

            _session.State = GameState.QuestionActive;
            _session.IsPaused = false;
            _session.PausedRemainingSeconds = null;
            _session.QuestionStartedAtUtc = now;
            _session.QuestionEndsAtUtc = now.AddSeconds(duration);

            ScheduleAutoLockUnlocked(question.Id, TimeSpan.FromSeconds(duration) + TimeSpan.FromMilliseconds(_options.LatePacketGraceMs));
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> PauseQuestionAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State != GameState.QuestionActive)
                return new OperationResult(false, "Pozastavit lze pouze aktivní otázku.");
            if (_session.IsPaused)
                return new OperationResult(true);

            CancelTimerUnlocked();
            var remaining = _session.QuestionEndsAtUtc.HasValue
                ? Math.Max(0, (_session.QuestionEndsAtUtc.Value - DateTimeOffset.UtcNow).TotalSeconds)
                : _session.ActiveTimeLimitSeconds;

            _session.IsPaused = true;
            _session.PausedRemainingSeconds = remaining;
            _session.QuestionEndsAtUtc = null;

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ResumeQuestionAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State != GameState.QuestionActive || !_session.IsPaused)
                return new OperationResult(false, "Otázka není pozastavena.");

            var question = GetCurrentQuestionUnlocked();
            if (question is null)
                return new OperationResult(false, "Aktivní otázka nebyla nalezena.");

            var remaining = Math.Max(1.0, _session.PausedRemainingSeconds ?? _session.ActiveTimeLimitSeconds);
            var now = DateTimeOffset.UtcNow;

            _session.IsPaused = false;
            _session.PausedRemainingSeconds = null;
            _session.QuestionEndsAtUtc = now.AddSeconds(remaining);
            var elapsedBeforePause = Math.Max(0, _session.ActiveTimeLimitSeconds - remaining);
            _session.QuestionStartedAtUtc = now.AddSeconds(-elapsedBeforePause);

            ScheduleAutoLockUnlocked(question.Id, TimeSpan.FromSeconds(remaining) + TimeSpan.FromMilliseconds(_options.LatePacketGraceMs));
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> UpdateQuestionParamsAsync(UpdateQuestionParamsRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            var question = GetCurrentQuestionUnlocked();
            if (question is null)
                return new OperationResult(false, "Není vybrána žádná otázka.");

            if (!_session.QuestionOverrides.TryGetValue(question.Id, out var overrides))
            {
                overrides = new QuestionRuntimeOverrides();
                _session.QuestionOverrides[question.Id] = overrides;
            }

            if (req.TimeLimitSeconds.HasValue && req.TimeLimitSeconds.Value >= 5)
            {
                overrides.TimeLimitSeconds = req.TimeLimitSeconds.Value;
                _session.ActiveTimeLimitSeconds = req.TimeLimitSeconds.Value;
                if (_session.State == GameState.QuestionReady)
                    _session.PausedRemainingSeconds = req.TimeLimitSeconds.Value;
            }

            if (req.BasePoints.HasValue && req.BasePoints.Value >= 0)
            {
                overrides.BasePoints = req.BasePoints.Value;
                _session.ActiveBasePoints = req.BasePoints.Value;
            }

            if (req.SpeedBonusMax.HasValue && req.SpeedBonusMax.Value >= 0)
            {
                overrides.SpeedBonusMax = req.SpeedBonusMax.Value;
                _session.ActiveSpeedBonusMax = req.SpeedBonusMax.Value;
            }

            if (req.GracePeriodSeconds.HasValue && req.GracePeriodSeconds.Value >= 0)
            {
                overrides.GracePeriodSeconds = req.GracePeriodSeconds.Value;
                _session.ActiveGracePeriodSeconds = Math.Clamp(req.GracePeriodSeconds.Value, 0, (int)_session.ActiveTimeLimitSeconds);
            }

            if (req.Text is not null && !string.IsNullOrWhiteSpace(req.Text))
                overrides.Text = req.Text.Trim();

            if (req.AcceptedAnswers is not null)
                overrides.AcceptedAnswers = req.AcceptedAnswers.Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a.Trim()).ToList();

            if (req.HostNote is not null)
                overrides.HostNote = req.HostNote;

            if (req.RemainingSeconds.HasValue && _session.State is GameState.QuestionActive or GameState.QuestionReady)
            {
                var newRem = Math.Max(1.0, req.RemainingSeconds.Value);
                if (newRem > _session.ActiveTimeLimitSeconds)
                    _session.ActiveTimeLimitSeconds = newRem;

                if (_session.IsPaused || _session.State == GameState.QuestionReady)
                {
                    _session.PausedRemainingSeconds = newRem;
                }
                else
                {
                    var now = DateTimeOffset.UtcNow;
                    _session.QuestionEndsAtUtc = now.AddSeconds(newRem);
                    CancelTimerUnlocked();
                    ScheduleAutoLockUnlocked(question.Id, TimeSpan.FromSeconds(newRem) + TimeSpan.FromMilliseconds(_options.LatePacketGraceMs));
                }
            }

            RecomputeQuestionScoresUnlocked(question);

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> PreSelectJokersAsync(string teamId, List<string> questionIds)
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null)
                return new OperationResult(false, "Není načten žádný kvíz.");

            if (!_session.Teams.TryGetValue(teamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var finalRound = _loadedQuiz.Rounds.FirstOrDefault(r => r.IsFinal);
            if (finalRound is null)
                return new OperationResult(false, "Tento kvíz nemá finálové kolo.");

            var currentRound = GetCurrentRoundUnlocked();
            if (currentRound is not null && currentRound.IsFinal && _session.State != GameState.RoundIntro)
                return new OperationResult(false, "Výběr žolíků předem je možný pouze před zahájením finálového kola.");

            var validIds = finalRound.Questions.Select(q => q.Id).ToHashSet(StringComparer.Ordinal);
            var distinctSelected = questionIds.Where(id => validIds.Contains(id)).Distinct(StringComparer.Ordinal).ToList();

            if (distinctSelected.Count > _loadedQuiz.Settings.JokerCount)
                return new OperationResult(false, $"Lze vybrat maximálně {_loadedQuiz.Settings.JokerCount} otázky pro žolíka.");

            team.PreSelectedJokerQuestionIds = distinctSelected;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<SubmitAnswerResult> SubmitAnswerAsync(string teamId, SubmitAnswerRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(teamId, out var team))
                return new SubmitAnswerResult(false, "Tým není zaregistrován.", null, null, false);

            var round = GetCurrentRoundUnlocked();
            var question = GetCurrentQuestionUnlocked();
            if (round is null || question is null || _loadedQuiz is null)
                return new SubmitAnswerResult(false, "Momentálně neprobíhá žádná otázka.", null, null, false);

            if (!string.Equals(question.Id, req.QuestionId, StringComparison.Ordinal))
                return new SubmitAnswerResult(false, "Tato otázka již není aktivní.", null, null, false);

            if (_session.State == GameState.QuestionReady)
                return new SubmitAnswerResult(false, "Počkejte, až moderátor spustí odpočet.", null, null, false);

            if (_session.State != GameState.QuestionActive)
                return new SubmitAnswerResult(false, "Hlasování pro tuto otázku je již uzavřeno.", null, null, false);

            if (_session.IsPaused)
                return new SubmitAnswerResult(false, "Hra je dočasně pozastavena moderátorem.", null, null, false);

            if (!_session.AnswersByQuestion.TryGetValue(question.Id, out var questionAnswers))
            {
                questionAnswers = new Dictionary<string, TeamAnswerRecord>();
                _session.AnswersByQuestion[question.Id] = questionAnswers;
            }

            if (questionAnswers.TryGetValue(teamId, out var existing))
            {
                if (string.Equals(existing.SubmissionId, req.SubmissionId, StringComparison.Ordinal))
                {
                    return new SubmitAnswerResult(true, null, existing.AnswerSequence, existing.EffectiveElapsedMs / 1000.0, true);
                }
                return new SubmitAnswerResult(false, "Odpověď už byla odeslána a uzamčena.", existing.AnswerSequence, existing.EffectiveElapsedMs / 1000.0, true);
            }

            var now = DateTimeOffset.UtcNow;
            if (_session.QuestionEndsAtUtc.HasValue &&
                now > _session.QuestionEndsAtUtc.Value.AddMilliseconds(_options.LatePacketGraceMs))
            {
                return new SubmitAnswerResult(false, "Čas pro odpověď vypršel.", null, null, false);
            }

            var jokerActive = false;
            if (round.IsFinal)
            {
                if (_loadedQuiz.Settings.JokerMode == JokerMode.PreSelect)
                {
                    jokerActive = team.PreSelectedJokerQuestionIds.Contains(question.Id);
                }
                else if (req.UseJoker && team.JokersUsed < _loadedQuiz.Settings.JokerCount)
                {
                    jokerActive = true;
                }
            }

            var rawElapsedMs = _session.QuestionStartedAtUtc.HasValue
                ? (now - _session.QuestionStartedAtUtc.Value).TotalMilliseconds
                : 0;

            var latencyCompMs = Math.Clamp(team.LastLatencyMs, 0, _options.MaxLatencyCompensationMs);
            var effectiveElapsedMs = (int)Math.Clamp(
                Math.Round(rawElapsedMs - latencyCompMs),
                0,
                _session.ActiveTimeLimitSeconds * 1000.0);

            var sanitizedAnswerText = SanitizeLength(req.AnswerText, MaxAnswerTextLength);
            var sanitizedOrderedItems = req.OrderedItems?
                .Take(MaxOrderedItemsCount)
                .Select(item => SanitizeLength(item, MaxOrderedItemLength))
                .ToList();
            var sanitizedSubmissionId = string.IsNullOrWhiteSpace(req.SubmissionId)
                ? Guid.NewGuid().ToString("N")
                : SanitizeLength(req.SubmissionId, 64);

            _session.QuestionOverrides.TryGetValue(question.Id, out var overrides);
            var eval = AnswerEvaluator.Evaluate(
                question,
                sanitizedAnswerText,
                sanitizedOrderedItems,
                overrides,
                _loadedQuiz.Settings.TextMatchMaxDistance);

            var breakdown = AnswerEvaluator.CalculateScore(
                eval.Evaluation,
                _session.ActiveBasePoints,
                _session.ActiveSpeedBonusMax,
                _session.ActiveGracePeriodSeconds,
                _session.ActiveTimeLimitSeconds,
                effectiveElapsedMs / 1000.0,
                jokerActive);

            var seq = ++_session.CurrentQuestionSequenceCounter;
            var record = new TeamAnswerRecord
            {
                TeamId = teamId,
                QuestionId = question.Id,
                SubmissionId = sanitizedSubmissionId,
                AnswerText = sanitizedAnswerText,
                OrderedItems = sanitizedOrderedItems,
                ReceivedAtUtc = now,
                AnswerSequence = seq,
                EffectiveElapsedMs = effectiveElapsedMs,
                EstimatedLatencyMs = latencyCompMs,
                JokerUsed = jokerActive,
                AutoEvaluation = eval.Evaluation,
                FinalEvaluation = eval.Evaluation,
                IsOverriddenByHost = false,
                MatchedDistance = eval.MatchedDistance,
                BasePointsAwarded = breakdown.BasePoints,
                SpeedBonusAwarded = breakdown.SpeedBonus,
                JokerDelta = breakdown.JokerDelta,
                TotalPointsAwarded = breakdown.TotalPoints,
                PointsApplied = false
            };

            questionAnswers[teamId] = record;
            team.LastSeenUtc = now;

            var connectedTeamIds = _session.Teams.Values.Where(t => t.IsConnected).Select(t => t.Id).ToList();
            if (connectedTeamIds.Count > 0 && connectedTeamIds.All(id => questionAnswers.ContainsKey(id)))
            {
                LockCurrentQuestionUnlocked();
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new SubmitAnswerResult(true, null, seq, effectiveElapsedMs / 1000.0, false);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> LockQuestionAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State is not (GameState.QuestionActive or GameState.QuestionReady))
                return new OperationResult(false, "Otázka není aktivní.");

            LockCurrentQuestionUnlocked();
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> OverrideAnswerEvaluationAsync(OverrideEvaluationRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            var round = GetCurrentRoundUnlocked();
            var question = GetCurrentQuestionUnlocked();
            if (round is null || question is null)
                return new OperationResult(false, "Není aktivní žádná otázka.");

            if (_session.State is not (GameState.QuestionLocked or GameState.QuestionReveal))
                return new OperationResult(false, "Vyhodnocení lze upravovat po uzavření otázky.");

            if (!_session.Teams.TryGetValue(req.TeamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            if (!_session.AnswersByQuestion.TryGetValue(question.Id, out var questionAnswers))
            {
                questionAnswers = new Dictionary<string, TeamAnswerRecord>();
                _session.AnswersByQuestion[question.Id] = questionAnswers;
            }

            if (!questionAnswers.TryGetValue(req.TeamId, out var record))
            {
                record = new TeamAnswerRecord
                {
                    TeamId = req.TeamId,
                    QuestionId = question.Id,
                    SubmissionId = "host-manual",
                    AnswerText = "",
                    ReceivedAtUtc = DateTimeOffset.UtcNow,
                    AnswerSequence = ++_session.CurrentQuestionSequenceCounter,
                    EffectiveElapsedMs = (int)(_session.ActiveTimeLimitSeconds * 1000),
                    JokerUsed = round.IsFinal && _loadedQuiz?.Settings.JokerMode == JokerMode.PreSelect && team.PreSelectedJokerQuestionIds.Contains(question.Id),
                    AutoEvaluation = AnswerEvaluation.Wrong,
                    FinalEvaluation = AnswerEvaluation.Wrong,
                    PointsApplied = false
                };
                questionAnswers[req.TeamId] = record;
            }

            var oldTotal = record.TotalPointsAwarded;
            var oldEval = record.FinalEvaluation;

            var breakdown = AnswerEvaluator.CalculateScore(
                req.Evaluation,
                _session.ActiveBasePoints,
                _session.ActiveSpeedBonusMax,
                _session.ActiveGracePeriodSeconds,
                _session.ActiveTimeLimitSeconds,
                record.EffectiveElapsedMs / 1000.0,
                record.JokerUsed);

            record.FinalEvaluation = req.Evaluation;
            record.IsOverriddenByHost = true;
            record.BasePointsAwarded = breakdown.BasePoints;
            record.SpeedBonusAwarded = breakdown.SpeedBonus;
            record.JokerDelta = breakdown.JokerDelta;
            record.TotalPointsAwarded = breakdown.TotalPoints;

            if (record.PointsApplied)
            {
                var diff = record.TotalPointsAwarded - oldTotal;
                team.Score += diff;
                team.PointsByRound[round.RoundNumber] = team.PointsByRound.GetValueOrDefault(round.RoundNumber) + diff;
                UpdateEvalCounters(team, oldEval, -1);
                UpdateEvalCounters(team, record.FinalEvaluation, +1);
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> AdjustTeamScoreAsync(ManualScoreAdjustmentRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(req.TeamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var clampedDelta = Math.Clamp(req.Delta, -1_000_000, 1_000_000);
            team.Score += clampedDelta;
            team.ManualAdjustments.Add(new ManualScoreAdjustment
            {
                Delta = clampedDelta,
                Reason = string.IsNullOrWhiteSpace(req.Reason) ? "Ruční korekce moderátora" : SanitizeLength(req.Reason, MaxReasonLength),
                CreatedAtUtc = DateTimeOffset.UtcNow
            });

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> RevealAnswerAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var round = GetCurrentRoundUnlocked();
            var question = GetCurrentQuestionUnlocked();
            if (round is null || question is null || _loadedQuiz is null)
                return new OperationResult(false, "Není vybrána žádná otázka.");

            if (_session.State is GameState.QuestionActive or GameState.QuestionReady)
                LockCurrentQuestionUnlocked();

            if (_session.State != GameState.QuestionLocked)
                return new OperationResult(false, "Odpověď lze odhalit po uzavření hlasování.");

            _previousRanks = ComputeRanksUnlocked();

            if (!_session.AnswersByQuestion.TryGetValue(question.Id, out var questionAnswers))
            {
                questionAnswers = new Dictionary<string, TeamAnswerRecord>();
                _session.AnswersByQuestion[question.Id] = questionAnswers;
            }

            if (round.IsFinal && _loadedQuiz.Settings.JokerMode == JokerMode.PreSelect)
            {
                foreach (var team in _session.Teams.Values)
                {
                    if (team.PreSelectedJokerQuestionIds.Contains(question.Id) && !questionAnswers.ContainsKey(team.Id))
                    {
                        var penalty = AnswerEvaluator.CalculateScore(
                            AnswerEvaluation.Wrong,
                            _session.ActiveBasePoints,
                            _session.ActiveSpeedBonusMax,
                            _session.ActiveGracePeriodSeconds,
                            _session.ActiveTimeLimitSeconds,
                            _session.ActiveTimeLimitSeconds,
                            jokerUsed: true);

                        questionAnswers[team.Id] = new TeamAnswerRecord
                        {
                            TeamId = team.Id,
                            QuestionId = question.Id,
                            SubmissionId = "missed-joker",
                            AnswerText = string.Empty,
                            ReceivedAtUtc = DateTimeOffset.UtcNow,
                            EffectiveElapsedMs = (int)(_session.ActiveTimeLimitSeconds * 1000),
                            JokerUsed = true,
                            AutoEvaluation = AnswerEvaluation.Wrong,
                            FinalEvaluation = AnswerEvaluation.Wrong,
                            BasePointsAwarded = penalty.BasePoints,
                            SpeedBonusAwarded = penalty.SpeedBonus,
                            JokerDelta = penalty.JokerDelta,
                            TotalPointsAwarded = penalty.TotalPoints,
                            PointsApplied = false
                        };
                    }
                }
            }

            foreach (var record in questionAnswers.Values)
            {
                if (record.PointsApplied) continue;
                if (!_session.Teams.TryGetValue(record.TeamId, out var team)) continue;

                team.Score += record.TotalPointsAwarded;
                team.PointsByRound[round.RoundNumber] = team.PointsByRound.GetValueOrDefault(round.RoundNumber) + record.TotalPointsAwarded;
                UpdateEvalCounters(team, record.FinalEvaluation, +1);

                if (record.SubmissionId != "missed-joker" && record.SubmissionId != "host-manual")
                {
                    team.TotalResponseTimeMs += record.EffectiveElapsedMs;
                    team.ResponseCount++;
                }

                if (record.JokerUsed)
                    team.JokersUsed++;

                record.PointsApplied = true;
            }

            _session.State = GameState.QuestionReveal;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ShowLobbyQrAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State == GameState.Lobby)
                return new OperationResult(true);

            CaptureReturnSnapshotIfEligibleUnlocked();
            CancelTimerUnlocked();
            _session.State = GameState.Lobby;
            _session.IsPaused = false;
            _session.QuestionEndsAtUtc = null;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ShowLeaderboardAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State == GameState.Leaderboard)
                return new OperationResult(true);

            CaptureReturnSnapshotIfEligibleUnlocked();
            CancelTimerUnlocked();
            _session.State = GameState.Leaderboard;
            _session.IsPaused = false;
            _session.QuestionEndsAtUtc = null;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ReturnToPreviousScreenAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (_session.State is not (GameState.Lobby or GameState.Leaderboard) || _session.ReturnScreen is null)
                return new OperationResult(false, "Není žádná předchozí obrazovka, na kterou by se dalo vrátit.");

            var snap = _session.ReturnScreen;
            _session.ReturnScreen = null;
            CancelTimerUnlocked();

            _session.CurrentRoundIndex = snap.CurrentRoundIndex;
            _session.CurrentQuestionIndex = snap.CurrentQuestionIndex;
            _session.State = snap.State;

            if (snap.State == GameState.QuestionActive)
            {
                // Always restore active question safely in Paused mode with exact remaining seconds intact
                _session.IsPaused = true;
                _session.PausedRemainingSeconds = Math.Max(1.0, snap.RemainingSeconds ?? _session.ActiveTimeLimitSeconds);
                _session.QuestionEndsAtUtc = null;
            }
            else if (snap.State == GameState.QuestionReady)
            {
                _session.IsPaused = false;
                _session.PausedRemainingSeconds = snap.RemainingSeconds ?? _session.ActiveTimeLimitSeconds;
                _session.QuestionEndsAtUtc = null;
            }
            else
            {
                _session.IsPaused = false;
                _session.PausedRemainingSeconds = null;
                _session.QuestionEndsAtUtc = null;
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    private void CaptureReturnSnapshotIfEligibleUnlocked()
    {
        // If we are already on a temporary screen (Lobby/Leaderboard) with an existing ReturnScreen,
        // keep the original gameplay screen so toggling between QR and Leaderboard never loses it!
        if (_session.State is GameState.Lobby or GameState.Leaderboard)
        {
            if (_session.ReturnScreen is not null)
                return;

            // Jumping from initial Lobby -> Leaderboard should still allow returning back to initial Lobby!
            if (_session.State == GameState.Lobby)
            {
                _session.ReturnScreen = new PreviousScreenSnapshot
                {
                    State = GameState.Lobby,
                    CurrentRoundIndex = _session.CurrentRoundIndex,
                    CurrentQuestionIndex = _session.CurrentQuestionIndex,
                    WasPaused = false,
                    RemainingSeconds = null
                };
            }
            return;
        }

        double? remaining = null;
        if (_session.State == GameState.QuestionActive)
        {
            remaining = _session.IsPaused
                ? _session.PausedRemainingSeconds ?? _session.ActiveTimeLimitSeconds
                : _session.QuestionEndsAtUtc.HasValue
                    ? Math.Max(1.0, (_session.QuestionEndsAtUtc.Value - DateTimeOffset.UtcNow).TotalSeconds)
                    : _session.ActiveTimeLimitSeconds;
        }
        else if (_session.State == GameState.QuestionReady)
        {
            remaining = _session.PausedRemainingSeconds ?? _session.ActiveTimeLimitSeconds;
        }

        _session.ReturnScreen = new PreviousScreenSnapshot
        {
            State = _session.State,
            CurrentRoundIndex = _session.CurrentRoundIndex,
            CurrentQuestionIndex = _session.CurrentQuestionIndex,
            WasPaused = _session.IsPaused,
            RemainingSeconds = remaining
        };
    }

    public async Task<OperationResult> FinishGameAsync()
    {
        await _lock.WaitAsync();
        try
        {
            CancelTimerUnlocked();
            _session.ReturnScreen = null;
            _session.State = GameState.Finished;
            _session.IsPaused = false;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> AdvanceNextAsync()
    {
        await _lock.WaitAsync();
        GameState currentState;
        GameState? returnState;
        int rIdx;
        int qIdx;
        int roundCount;
        int questionCountInCurrentRound;
        try
        {
            if (_loadedQuiz is null || _loadedQuiz.Rounds.Count == 0)
                return new OperationResult(false, "Nejprve načtěte kvíz.");

            currentState = _session.State;
            returnState = _session.ReturnScreen?.State;
            rIdx = _session.CurrentRoundIndex;
            qIdx = _session.CurrentQuestionIndex;
            roundCount = _loadedQuiz.Rounds.Count;
            questionCountInCurrentRound = rIdx >= 0 && rIdx < roundCount ? _loadedQuiz.Rounds[rIdx].Questions.Count : 0;
        }
        finally
        {
            _lock.Release();
        }

        // Unified forward progression for both temporary Lobby (QR) and Leaderboard overlays:
        // Primary Next always advances to the next logical game step (never duplicates ReturnToPreviousScreen).
        if (currentState is GameState.Lobby or GameState.Leaderboard && returnState.HasValue)
        {
            return returnState.Value switch
            {
                GameState.Lobby => await StartQuizIntroAsync(),
                GameState.QuizIntro => await StartRoundIntroAsync(0),
                GameState.RoundIntro => await StartQuestionAsync(Math.Max(0, rIdx), 0),
                GameState.QuestionReady => await RestoreAndContinueAsync(StartCountdownAsync),
                GameState.QuestionActive => await RestoreAndContinueAsync(LockQuestionAsync),
                GameState.QuestionLocked => await RestoreAndContinueAsync(RevealAnswerAsync),
                GameState.QuestionReveal =>
                    qIdx + 1 < questionCountInCurrentRound
                        ? await StartQuestionAsync(rIdx, qIdx + 1)
                        : currentState == GameState.Lobby
                            ? await ShowLeaderboardAsync()
                            : rIdx + 1 < roundCount
                                ? await StartRoundIntroAsync(rIdx + 1)
                                : await FinishGameAsync(),
                GameState.Finished => await FinishGameAsync(),
                _ => await StartQuizIntroAsync()
            };
        }

        return currentState switch
        {
            GameState.Lobby => await StartQuizIntroAsync(),
            GameState.QuizIntro => await StartRoundIntroAsync(0),
            GameState.RoundIntro => await StartQuestionAsync(Math.Max(0, rIdx), 0),
            GameState.QuestionReady => await StartCountdownAsync(),
            GameState.QuestionActive => await LockQuestionAsync(),
            GameState.QuestionLocked => await RevealAnswerAsync(),
            GameState.QuestionReveal =>
                qIdx + 1 < questionCountInCurrentRound
                    ? await StartQuestionAsync(rIdx, qIdx + 1)
                    : await ShowLeaderboardAsync(),
            GameState.Leaderboard =>
                rIdx >= 0 && qIdx >= 0 && qIdx + 1 < questionCountInCurrentRound
                    ? await StartQuestionAsync(rIdx, qIdx + 1)
                    : rIdx + 1 < roundCount
                        ? await StartRoundIntroAsync(rIdx + 1)
                        : await FinishGameAsync(),
            GameState.Finished => new OperationResult(true),
            _ => new OperationResult(false, "Neznámý stav hry.")
        };
    }

    private async Task<OperationResult> RestoreAndContinueAsync(Func<Task<OperationResult>> nextStep)
    {
        var restored = await ReturnToPreviousScreenAsync();
        if (!restored.Success) return restored;
        return await nextStep();
    }

    public async Task<OperationResult> SetScreenBannerAsync(SendScreenBannerRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            _session.ScreenBanner = string.IsNullOrWhiteSpace(req.Text)
                ? null
                : new ScreenBannerMessage
                {
                    Id = Guid.NewGuid().ToString("N")[..8],
                    Text = SanitizeLength(req.Text, MaxBannerLength),
                    Kind = req.Kind is "hint" or "warning" ? req.Kind : "info",
                    SentAtUtc = DateTimeOffset.UtcNow
                };

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ClearScreenBannerAsync()
    {
        await _lock.WaitAsync();
        try
        {
            _session.ScreenBanner = null;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> SendPlayerMessageAsync(SendPlayerMessageRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (string.IsNullOrWhiteSpace(req.Text))
                return new OperationResult(false, "Zpráva nemůže být prázdná.");

            var msg = new PlayerMessage
            {
                Id = Guid.NewGuid().ToString("N")[..8],
                TargetTeamId = string.IsNullOrWhiteSpace(req.TargetTeamId) ? null : SanitizeLength(req.TargetTeamId, 64),
                Text = SanitizeLength(req.Text, MaxPlayerMessageLength),
                SentAtUtc = DateTimeOffset.UtcNow
            };

            _session.RecentPlayerMessages.Add(msg);
            if (_session.RecentPlayerMessages.Count > 30)
                _session.RecentPlayerMessages.RemoveAt(0);

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> DismissPlayerMessageAsync(string teamId, string messageId)
    {
        var cleanId = SanitizeLength(messageId, 64);
        if (string.IsNullOrWhiteSpace(cleanId))
            return new OperationResult(false, "Neplatné ID zprávy.");

        GameStateBroadcastDto? updatedTeamDto = null;
        await _lock.WaitAsync();
        try
        {
            if (!_session.Teams.TryGetValue(teamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            if (!team.DismissedMessageIds.Contains(cleanId, StringComparer.Ordinal))
            {
                team.DismissedMessageIds.Add(cleanId);
                if (team.DismissedMessageIds.Count > 50)
                    team.DismissedMessageIds.RemoveAt(0);

                team.LastSeenUtc = DateTimeOffset.UtcNow;
                _persistence.SaveSessionAtomic(_session);
            }

            updatedTeamDto = BuildSnapshotUnlocked(QuizRoles.Player, teamId);
        }
        finally
        {
            _lock.Release();
        }

        if (updatedTeamDto is not null)
        {
            try
            {
                await _hubContext.Clients.Group(QuizHub.TeamGroup(teamId))
                    .SendAsync("GameStateUpdated", updatedTeamDto);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to push dismissed-message snapshot to team {TeamId}.", teamId);
            }
        }

        return new OperationResult(true);
    }

    public async Task<OperationResult> ClaimBonusTaskAsync(string teamId, ClaimBonusTaskRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null)
                return new OperationResult(false, "Není načten žádný kvíz.");

            if (_session.State == GameState.Finished)
                return new OperationResult(false, "Kvíz už skončil, úkoly nelze dále hlásit.");

            if (!_session.Teams.TryGetValue(teamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var task = _loadedQuiz.BonusTasks.FirstOrDefault(
                t => string.Equals(t.Id, req.TaskId?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (task is null)
                return new OperationResult(false, "Tento bonusový úkol v aktuálním kvízu neexistuje.");

            var approvedCount = _session.BonusTaskClaims.Count(
                c => c.TeamId == teamId && c.TaskId == task.Id && c.Status == BonusTaskClaimStatus.Approved);
            if (approvedCount >= task.MaxCompletionsPerTeam)
                return new OperationResult(false, $"Tento úkol už váš tým splnil maximální početkrát ({task.MaxCompletionsPerTeam}×).");

            var pendingCount = _session.BonusTaskClaims.Count(
                c => c.TeamId == teamId && c.TaskId == task.Id && c.Status == BonusTaskClaimStatus.Pending);
            if (approvedCount + pendingCount >= task.MaxCompletionsPerTeam)
                return new OperationResult(false, "Hlášení tohoto úkolu už čeká na schválení moderátorem.");

            if (_session.BonusTaskClaims.Count >= 1000)
                return new OperationResult(false, "Byl dosažen maximální počet hlášení úkolů v jedné hře.");

            var cleanNote = SanitizeLength(req.Note, 200);
            _session.BonusTaskClaims.Add(new BonusTaskClaim
            {
                Id = Guid.NewGuid().ToString("N")[..8],
                TeamId = teamId,
                TaskId = task.Id,
                Note = string.IsNullOrWhiteSpace(cleanNote) ? null : cleanNote,
                Status = BonusTaskClaimStatus.Pending,
                PointsAwarded = task.Points,
                CreatedAtUtc = DateTimeOffset.UtcNow
            });

            team.LastSeenUtc = DateTimeOffset.UtcNow;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> ReviewBonusTaskClaimAsync(ReviewBonusTaskClaimRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            var claim = _session.BonusTaskClaims.FirstOrDefault(
                c => string.Equals(c.Id, req.ClaimId?.Trim(), StringComparison.Ordinal));
            if (claim is null)
                return new OperationResult(false, "Hlášení úkolu nebylo nalezeno.");

            if (claim.Status != BonusTaskClaimStatus.Pending)
                return new OperationResult(false, "Toto hlášení už bylo vyhodnoceno.");

            if (!_session.Teams.TryGetValue(claim.TeamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var task = _loadedQuiz?.BonusTasks.FirstOrDefault(
                t => string.Equals(t.Id, claim.TaskId, StringComparison.OrdinalIgnoreCase));

            var cleanComment = SanitizeLength(req.HostComment, 200);
            claim.HostComment = string.IsNullOrWhiteSpace(cleanComment) ? null : cleanComment;
            claim.ReviewedAtUtc = DateTimeOffset.UtcNow;

            if (req.Approve)
            {
                var maxAllowed = task?.MaxCompletionsPerTeam ?? 50;
                var approvedCount = _session.BonusTaskClaims.Count(
                    c => c.TeamId == claim.TeamId && c.TaskId == claim.TaskId && c.Status == BonusTaskClaimStatus.Approved);
                if (approvedCount >= maxAllowed)
                    return new OperationResult(false, $"Tým už tento úkol splnil maximální početkrát ({maxAllowed}×).");

                var points = Math.Clamp(task?.Points ?? claim.PointsAwarded, 0, 100_000);
                claim.Status = BonusTaskClaimStatus.Approved;
                claim.PointsAwarded = points;
                team.Score += points;
            }
            else
            {
                claim.Status = BonusTaskClaimStatus.Rejected;
                claim.PointsAwarded = 0;
            }

            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<OperationResult> AwardBonusTaskDirectlyAsync(AwardBonusTaskRequest req)
    {
        await _lock.WaitAsync();
        try
        {
            if (_loadedQuiz is null)
                return new OperationResult(false, "Není načten žádný kvíz.");

            if (!_session.Teams.TryGetValue(req.TeamId, out var team))
                return new OperationResult(false, "Tým nebyl nalezen.");

            var task = _loadedQuiz.BonusTasks.FirstOrDefault(
                t => string.Equals(t.Id, req.TaskId?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (task is null)
                return new OperationResult(false, "Bonusový úkol nebyl nalezen.");

            var approvedCount = _session.BonusTaskClaims.Count(
                c => c.TeamId == team.Id && c.TaskId == task.Id && c.Status == BonusTaskClaimStatus.Approved);
            if (approvedCount >= task.MaxCompletionsPerTeam)
                return new OperationResult(false, $"Tým '{team.Name}' už tento úkol splnil maximální početkrát ({task.MaxCompletionsPerTeam}×).");

            var cleanComment = SanitizeLength(req.HostComment, 200);
            var existingPending = _session.BonusTaskClaims.FirstOrDefault(
                c => c.TeamId == team.Id && c.TaskId == task.Id && c.Status == BonusTaskClaimStatus.Pending);

            if (existingPending is not null)
            {
                existingPending.Status = BonusTaskClaimStatus.Approved;
                existingPending.PointsAwarded = task.Points;
                existingPending.HostComment = string.IsNullOrWhiteSpace(cleanComment) ? existingPending.HostComment : cleanComment;
                existingPending.ReviewedAtUtc = DateTimeOffset.UtcNow;
            }
            else
            {
                var now = DateTimeOffset.UtcNow;
                _session.BonusTaskClaims.Add(new BonusTaskClaim
                {
                    Id = Guid.NewGuid().ToString("N")[..8],
                    TeamId = team.Id,
                    TaskId = task.Id,
                    Note = "Potvrzeno přímo moderátorem",
                    Status = BonusTaskClaimStatus.Approved,
                    PointsAwarded = task.Points,
                    HostComment = string.IsNullOrWhiteSpace(cleanComment) ? null : cleanComment,
                    CreatedAtUtc = now,
                    ReviewedAtUtc = now
                });
            }

            team.Score += task.Points;
            _persistence.SaveSessionAtomic(_session);
            await BroadcastStateUnlockedAsync();
            return new OperationResult(true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<GameStateBroadcastDto> BuildSnapshotAsync(string role, string? teamId = null)
    {
        await _lock.WaitAsync();
        try
        {
            return BuildSnapshotUnlocked(role, teamId);
        }
        finally
        {
            _lock.Release();
        }
    }

    // --- Internal unlocked helpers ---

    private void LockCurrentQuestionUnlocked()
    {
        CancelTimerUnlocked();
        _session.State = GameState.QuestionLocked;
        _session.IsPaused = false;
        _session.PausedRemainingSeconds = null;
        _session.QuestionEndsAtUtc = null;
    }

    private void RecomputeQuestionScoresUnlocked(QuizQuestion question)
    {
        if (_loadedQuiz is null || !_session.AnswersByQuestion.TryGetValue(question.Id, out var answers))
            return;

        _session.QuestionOverrides.TryGetValue(question.Id, out var overrides);
        foreach (var record in answers.Values)
        {
            if (record.PointsApplied) continue;

            if (!record.IsOverriddenByHost)
            {
                var eval = AnswerEvaluator.Evaluate(
                    question,
                    record.AnswerText,
                    record.OrderedItems,
                    overrides,
                    _loadedQuiz.Settings.TextMatchMaxDistance);
                record.AutoEvaluation = eval.Evaluation;
                record.FinalEvaluation = eval.Evaluation;
                record.MatchedDistance = eval.MatchedDistance;
            }

            var breakdown = AnswerEvaluator.CalculateScore(
                record.FinalEvaluation,
                _session.ActiveBasePoints,
                _session.ActiveSpeedBonusMax,
                _session.ActiveGracePeriodSeconds,
                _session.ActiveTimeLimitSeconds,
                record.EffectiveElapsedMs / 1000.0,
                record.JokerUsed);

            record.BasePointsAwarded = breakdown.BasePoints;
            record.SpeedBonusAwarded = breakdown.SpeedBonus;
            record.JokerDelta = breakdown.JokerDelta;
            record.TotalPointsAwarded = breakdown.TotalPoints;
        }
    }

    private void ScheduleAutoLockUnlocked(string questionId, TimeSpan delay)
    {
        CancelTimerUnlocked();
        var cts = new CancellationTokenSource();
        _questionTimerCts = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(delay, cts.Token);
                await _lock.WaitAsync(cts.Token);
                try
                {
                    var currentQ = GetCurrentQuestionUnlocked();
                    if (!cts.IsCancellationRequested &&
                        _session.State == GameState.QuestionActive &&
                        !_session.IsPaused &&
                        currentQ is not null &&
                        string.Equals(currentQ.Id, questionId, StringComparison.Ordinal))
                    {
                        LockCurrentQuestionUnlocked();
                        _persistence.SaveSessionAtomic(_session);
                        await BroadcastStateUnlockedAsync();
                    }
                }
                finally
                {
                    _lock.Release();
                }
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in auto-lock timer for question {QuestionId}", questionId);
            }
        });
    }

    private void CancelTimerUnlocked()
    {
        if (_questionTimerCts is not null)
        {
            try { _questionTimerCts.Cancel(); } catch { }
            _questionTimerCts.Dispose();
            _questionTimerCts = null;
        }
    }

    private async Task BroadcastStateUnlockedAsync()
    {
        var hostDto = BuildSnapshotUnlocked(QuizRoles.Host, null);
        var screenDto = BuildSnapshotUnlocked(QuizRoles.Screen, null);

        var tasks = new List<Task>
        {
            _hubContext.Clients.Group(QuizHub.HostsGroup).SendAsync("GameStateUpdated", hostDto),
            _hubContext.Clients.Group(QuizHub.ScreensGroup).SendAsync("GameStateUpdated", screenDto)
        };

        foreach (var team in _session.Teams.Values)
        {
            var playerDto = BuildSnapshotUnlocked(QuizRoles.Player, team.Id);
            tasks.Add(_hubContext.Clients.Group(QuizHub.TeamGroup(team.Id)).SendAsync("GameStateUpdated", playerDto));
        }

        try
        {
            await Task.WhenAll(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast game state to one or more clients.");
        }
    }

    private GameStateBroadcastDto BuildSnapshotUnlocked(string role, string? teamId)
    {
        var now = DateTimeOffset.UtcNow;
        var isHost = role == QuizRoles.Host;
        var isScreen = role == QuizRoles.Screen;
        var revealSecrets = isHost || _session.State == GameState.QuestionReveal;

        var round = GetCurrentRoundUnlocked();
        var question = GetCurrentQuestionUnlocked();
        var jokerCount = _loadedQuiz?.Settings.JokerCount ?? 2;
        var jokerMode = _loadedQuiz?.Settings.JokerMode ?? JokerMode.OnDemand;

        var currentAnswers = question is not null && _session.AnswersByQuestion.TryGetValue(question.Id, out var qMap)
            ? qMap
            : new Dictionary<string, TeamAnswerRecord>();

        var roundsOverview = _loadedQuiz?.Rounds.Select((r, idx) => new RoundOverviewDto(
            idx,
            r.RoundNumber,
            r.Title,
            r.Description,
            r.IsFinal,
            r.PointMultiplier,
            r.Questions.Count,
            r.Questions.Select(q => q.Id).ToList()
        )).ToList() ?? [];

        RoundOverviewDto? currentRoundDto = _session.CurrentRoundIndex >= 0 && _session.CurrentRoundIndex < roundsOverview.Count
            ? roundsOverview[_session.CurrentRoundIndex]
            : null;

        ActiveQuestionPublicDto? activeQuestionDto = null;
        if (round is not null && question is not null && _loadedQuiz is not null)
        {
            _session.QuestionOverrides.TryGetValue(question.Id, out var overrides);
            var text = overrides?.Text ?? question.Text;
            var hostNote = overrides?.HostNote ?? question.HostNote;
            var acceptedAnswers = overrides?.AcceptedAnswers ?? question.AcceptedAnswers;

            List<string>? options = question.Type switch
            {
                QuestionType.MultipleChoice => question.Options,
                QuestionType.Ordering => _session.ShuffledOrderingOptions ?? question.Options,
                _ => null
            };

            PublicMediaDto? mediaDto = null;
            if (question.Media is not null)
            {
                // During QuestionReady, show static images immediately; hold audio/video/youtube until QuestionActive!
                var showMedia = isHost
                    || _session.State == GameState.QuestionReveal
                    || (question.Media.PlaybackMode == "duringQuestion" &&
                        (_session.State != GameState.QuestionReady || string.Equals(question.Media.Type, "image", StringComparison.OrdinalIgnoreCase)));

                if (showMedia)
                {
                    static bool IsExternalUrl(string? src) =>
                        !string.IsNullOrWhiteSpace(src) &&
                        Uri.TryCreate(src.Trim(), UriKind.Absolute, out var uri) &&
                        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

                    var rawSrc = question.Media.Src.Trim();
                    if (QuizRepository.IsSafeMediaReference(rawSrc, question.Media.Type))
                    {
                        var mediaUrl = string.Equals(question.Media.Type, "youtube", StringComparison.OrdinalIgnoreCase) || IsExternalUrl(rawSrc)
                            ? rawSrc
                            : $"/api/quizzes/{Uri.EscapeDataString(_loadedQuiz.Id)}/media/{rawSrc.TrimStart('/')}";

                        string? captionsUrl = null;
                        if (!string.IsNullOrWhiteSpace(question.Media.CaptionsSrc) &&
                            QuizRepository.IsSafeMediaReference(question.Media.CaptionsSrc, "captions"))
                        {
                            var cap = question.Media.CaptionsSrc.Trim();
                            captionsUrl = IsExternalUrl(cap)
                                ? cap
                                : $"/api/quizzes/{Uri.EscapeDataString(_loadedQuiz.Id)}/media/{cap.TrimStart('/')}";
                        }

                        mediaDto = new PublicMediaDto(
                            question.Media.Type,
                            mediaUrl,
                            rawSrc,
                            question.Media.StartSeconds,
                            question.Media.EndSeconds,
                            question.Media.PlaybackMode,
                            question.Media.AltText,
                            question.Media.Transcript,
                            captionsUrl
                        );
                    }
                }
            }

            var correctOrder = question.Type == QuestionType.Ordering ? question.GetEffectiveCorrectOrder() : null;
            var effectiveCorrectAnswer = question.CorrectAnswer
                ?? (correctOrder is not null ? string.Join(" → ", correctOrder) : null);

            activeQuestionDto = new ActiveQuestionPublicDto(
                question.Id,
                _session.CurrentQuestionIndex + 1,
                round.Questions.Count,
                round.RoundNumber,
                round.Title,
                round.IsFinal,
                question.Type,
                text,
                options,
                _session.ActiveTimeLimitSeconds,
                _session.ActiveBasePoints,
                _session.ActiveSpeedBonusMax,
                _session.ActiveGracePeriodSeconds,
                _session.QuestionStartedAtUtc,
                _session.QuestionEndsAtUtc,
                _session.IsPaused,
                _session.PausedRemainingSeconds,
                mediaDto,
                revealSecrets ? effectiveCorrectAnswer : null,
                revealSecrets ? correctOrder : null,
                isHost ? acceptedAnswers : null,
                isHost ? hostNote : null
            );
        }

        var sortedTeams = _session.Teams.Values
            .OrderByDescending(t => t.Score)
            .ThenByDescending(t => t.CorrectCount)
            .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        var leaderboard = new List<LeaderboardEntryDto>(sortedTeams.Count);
        for (var i = 0; i < sortedTeams.Count; i++)
        {
            var t = sortedTeams[i];
            var rank = i + 1;
            var prevRank = _previousRanks.TryGetValue(t.Id, out var pr) ? pr : rank;
            var lastDelta = currentAnswers.TryGetValue(t.Id, out var rec) && rec.PointsApplied
                ? rec.TotalPointsAwarded
                : 0;
            leaderboard.Add(new LeaderboardEntryDto(
                t.Id,
                t.Name,
                t.AvatarId,
                t.AvatarColor,
                t.Score,
                prevRank,
                rank,
                lastDelta,
                t.IsConnected,
                Math.Max(0, jokerCount - t.JokersUsed),
                t.CorrectCount
            ));
        }

        var outcomes = sortedTeams.Select(t =>
        {
            var hasAns = currentAnswers.TryGetValue(t.Id, out var r) && r.SubmissionId != "missed-joker";
            currentAnswers.TryGetValue(t.Id, out var anyRec);
            return new TeamQuestionOutcomeDto(
                t.Id,
                t.Name,
                t.AvatarId,
                t.AvatarColor,
                hasAns,
                hasAns ? anyRec!.AnswerSequence : null,
                hasAns ? Math.Round(anyRec!.EffectiveElapsedMs / 1000.0, 2) : null,
                anyRec?.JokerUsed ?? false,
                revealSecrets ? anyRec?.FinalEvaluation : null,
                revealSecrets ? (anyRec?.TotalPointsAwarded ?? 0) : 0,
                revealSecrets && hasAns ? anyRec!.AnswerText : null,
                revealSecrets && hasAns ? anyRec!.OrderedItems : null
            );
        }).ToList();

        var bonusTasksDto = (_loadedQuiz?.BonusTasks ?? [])
            .Select(bt => new BonusTaskDto(bt.Id, bt.Title, bt.Description, bt.Points, bt.MaxCompletionsPerTeam))
            .ToList();
        var taskLookup = (_loadedQuiz?.BonusTasks ?? []).ToDictionary(bt => bt.Id, StringComparer.OrdinalIgnoreCase);

        List<HostAnswerDetailDto>? hostAnswers = null;
        List<HostTeamInfoDto>? hostTeams = null;
        List<HostBonusTaskClaimDto>? hostTaskClaims = null;
        if (isHost)
        {
            hostAnswers = _session.Teams.Values
                .Select(t =>
                {
                    currentAnswers.TryGetValue(t.Id, out var rec);
                    var hasAnswered = rec is not null && rec.SubmissionId != "missed-joker";
                    return new HostAnswerDetailDto(
                        t.Id,
                        t.Name,
                        t.AvatarId,
                        t.AvatarColor,
                        t.IsConnected,
                        hasAnswered,
                        hasAnswered ? rec!.AnswerSequence : null,
                        hasAnswered ? rec!.ReceivedAtUtc : null,
                        hasAnswered ? Math.Round(rec!.EffectiveElapsedMs / 1000.0, 2) : null,
                        hasAnswered ? rec!.EstimatedLatencyMs : t.LastLatencyMs,
                        hasAnswered ? rec!.AnswerText : null,
                        hasAnswered ? rec!.OrderedItems : null,
                        rec?.JokerUsed ?? false,
                        rec?.AutoEvaluation ?? AnswerEvaluation.Pending,
                        rec?.FinalEvaluation ?? AnswerEvaluation.Pending,
                        rec?.IsOverriddenByHost ?? false,
                        rec?.MatchedDistance,
                        rec?.BasePointsAwarded ?? 0,
                        rec?.SpeedBonusAwarded ?? 0,
                        rec?.JokerDelta ?? 0,
                        rec?.TotalPointsAwarded ?? 0
                    );
                })
                .OrderBy(a => a.HasAnswered ? 0 : 1)
                .ThenBy(a => a.AnswerSequence ?? int.MaxValue)
                .ThenBy(a => a.TeamName, StringComparer.CurrentCultureIgnoreCase)
                .ToList();

            hostTeams = sortedTeams.Select(t => new HostTeamInfoDto(
                t.Id,
                t.Name,
                t.AvatarId,
                t.AvatarColor,
                t.Score,
                t.IsConnected,
                t.RecoveryCode,
                $"{_cachedBaseUrl}/play?rejoin={Uri.EscapeDataString(t.RecoveryCode)}",
                t.PreSelectedJokerQuestionIds.Count
            )).ToList();

            var approvedCounts = _session.BonusTaskClaims
                .Where(c => c.Status == BonusTaskClaimStatus.Approved)
                .GroupBy(c => (c.TeamId, c.TaskId))
                .ToDictionary(g => g.Key, g => g.Count());

            var pendingClaims = _session.BonusTaskClaims
                .Where(c => c.Status == BonusTaskClaimStatus.Pending)
                .OrderBy(c => c.CreatedAtUtc);

            var reviewedClaims = _session.BonusTaskClaims
                .Where(c => c.Status != BonusTaskClaimStatus.Pending)
                .OrderByDescending(c => c.ReviewedAtUtc ?? c.CreatedAtUtc)
                .Take(40);

            hostTaskClaims = pendingClaims
                .Concat(reviewedClaims)
                .Select(c =>
                {
                    _session.Teams.TryGetValue(c.TeamId, out var claimTeam);
                    taskLookup.TryGetValue(c.TaskId, out var claimTask);
                    var teamApproved = approvedCounts.GetValueOrDefault((c.TeamId, c.TaskId), 0);
                    return new HostBonusTaskClaimDto(
                        c.Id,
                        c.TeamId,
                        claimTeam?.Name ?? "(odebraný tým)",
                        claimTeam?.AvatarId ?? "owl",
                        claimTeam?.AvatarColor ?? "#b45309",
                        c.TaskId,
                        claimTask?.Title ?? c.TaskId,
                        claimTask?.Points ?? c.PointsAwarded,
                        claimTask?.MaxCompletionsPerTeam ?? 1,
                        teamApproved,
                        c.Note,
                        c.Status,
                        c.PointsAwarded,
                        c.HostComment,
                        c.CreatedAtUtc,
                        c.ReviewedAtUtc
                    );
                })
                .ToList();
        }

        PlayerSelfDto? selfDto = null;
        if (role == QuizRoles.Player && !string.IsNullOrWhiteSpace(teamId) && _session.Teams.TryGetValue(teamId, out var selfTeam))
        {
            var myEntry = leaderboard.FirstOrDefault(l => l.TeamId == teamId);
            currentAnswers.TryGetValue(teamId, out var myRec);
            var hasSubmitted = myRec is not null && myRec.SubmissionId != "missed-joker";
            var preJoker = question is not null && round is { IsFinal: true } &&
                           jokerMode == JokerMode.PreSelect &&
                           selfTeam.PreSelectedJokerQuestionIds.Contains(question.Id);

            var selfClaims = _session.BonusTaskClaims
                .Where(c => c.TeamId == teamId)
                .OrderByDescending(c => c.ReviewedAtUtc ?? c.CreatedAtUtc)
                .Take(30)
                .Select(c => new PlayerBonusTaskClaimDto(
                    c.Id,
                    c.TaskId,
                    c.Note,
                    c.Status,
                    c.PointsAwarded,
                    c.HostComment,
                    c.CreatedAtUtc,
                    c.ReviewedAtUtc
                ))
                .ToList();

            selfDto = new PlayerSelfDto(
                selfTeam.Id,
                selfTeam.Name,
                selfTeam.AvatarId,
                selfTeam.AvatarColor,
                selfTeam.RecoveryCode,
                selfTeam.Score,
                myEntry?.Rank ?? 0,
                Math.Max(0, jokerCount - selfTeam.JokersUsed),
                selfTeam.PreSelectedJokerQuestionIds.ToList(),
                hasSubmitted,
                myRec?.JokerUsed ?? preJoker,
                hasSubmitted ? myRec!.AnswerText : null,
                hasSubmitted ? myRec!.OrderedItems : null,
                revealSecrets ? myRec?.FinalEvaluation : null,
                revealSecrets ? (myRec?.TotalPointsAwarded ?? 0) : 0,
                selfClaims
            );
        }

        HashSet<string>? dismissedForTeam = null;
        if (role == QuizRoles.Player && !string.IsNullOrWhiteSpace(teamId) &&
            _session.Teams.TryGetValue(teamId, out var msgTeam) &&
            msgTeam.DismissedMessageIds.Count > 0)
        {
            dismissedForTeam = msgTeam.DismissedMessageIds.ToHashSet(StringComparer.Ordinal);
        }

        var visibleMessages = isHost
            ? _session.RecentPlayerMessages.TakeLast(15).ToList()
            : role == QuizRoles.Player && !string.IsNullOrWhiteSpace(teamId)
                ? _session.RecentPlayerMessages
                    .Where(m => (m.TargetTeamId is null || m.TargetTeamId == teamId) &&
                                (dismissedForTeam is null || !dismissedForTeam.Contains(m.Id)))
                    .TakeLast(10)
                    .ToList()
                : [];

        var stats = _session.State == GameState.Finished || isHost
            ? ComputeStatisticsUnlocked()
            : null;

        var defaultRules = _loadedQuiz?.Rules is { Count: > 0 }
            ? _loadedQuiz.Rules
            : BuildDefaultRules(_loadedQuiz);

        var joinUrl = $"{_cachedBaseUrl}/play?join={Uri.EscapeDataString(_session.JoinCode)}";
        var screenUrl = isHost ? $"{_cachedBaseUrl}/screen?code={Uri.EscapeDataString(_session.ScreenCode)}" : null;
        var answeredCount = currentAnswers.Values.Count(a => a.SubmissionId != "missed-joker");

        var canReturn = _session.State is GameState.Lobby or GameState.Leaderboard && _session.ReturnScreen is not null;

        return new GameStateBroadcastDto(
            _session.SessionId,
            role,
            _session.State,
            now,
            _loadedQuiz?.Id,
            _loadedQuiz?.Title,
            _loadedQuiz?.Description,
            _session.QuizLanguage,
            _loadedQuiz?.AvailableLanguages ?? ["cs"],
            defaultRules,
            jokerMode,
            jokerCount,
            bonusTasksDto,
            _session.AutoStartTimer,
            canReturn,
            canReturn ? _session.ReturnScreen!.State : null,
            _session.JoinCode,
            joinUrl,
            isHost || isScreen ? _session.ScreenCode : null,
            screenUrl,
            _session.CurrentRoundIndex,
            _session.CurrentQuestionIndex,
            currentRoundDto,
            roundsOverview,
            activeQuestionDto,
            _session.Teams.Values.Count(t => t.IsConnected),
            _session.Teams.Count,
            answeredCount,
            leaderboard,
            outcomes,
            _session.ScreenBanner,
            visibleMessages,
            stats,
            hostAnswers,
            hostTeams,
            hostTaskClaims,
            selfDto
        );
    }

    private EveningStatisticsDto ComputeStatisticsUnlocked()
    {
        var fastest = _session.Teams.Values
            .Where(t => t.ResponseCount > 0)
            .OrderBy(t => (double)t.TotalResponseTimeMs / t.ResponseCount)
            .FirstOrDefault();

        int? bestRoundNum = null;
        string? bestRoundTitle = null;
        double? bestRoundAccuracy = null;

        if (_loadedQuiz is not null)
        {
            foreach (var round in _loadedQuiz.Rounds)
            {
                var total = 0;
                var correct = 0.0;
                foreach (var q in round.Questions)
                {
                    if (!_session.AnswersByQuestion.TryGetValue(q.Id, out var map))
                        continue;
                    foreach (var rec in map.Values)
                    {
                        if (!rec.PointsApplied) continue;
                        total++;
                        if (rec.FinalEvaluation == AnswerEvaluation.Correct) correct += 1.0;
                        else if (rec.FinalEvaluation == AnswerEvaluation.HalfPoint) correct += 0.5;
                    }
                }
                if (total > 0)
                {
                    var pct = Math.Round(correct / total * 100.0, 1);
                    if (bestRoundAccuracy is null || pct > bestRoundAccuracy)
                    {
                        bestRoundAccuracy = pct;
                        bestRoundNum = round.RoundNumber;
                        bestRoundTitle = round.Title;
                    }
                }
            }
        }

        var playedQuestions = _session.AnswersByQuestion.Values.Count(m => m.Values.Any(a => a.PointsApplied));
        var totalAnswers = _session.AnswersByQuestion.Values.Sum(m => m.Values.Count(a => a.SubmissionId != "missed-joker"));

        return new EveningStatisticsDto(
            fastest?.Name,
            fastest is not null ? Math.Round((double)fastest.TotalResponseTimeMs / fastest.ResponseCount / 1000.0, 2) : null,
            bestRoundNum,
            bestRoundTitle,
            bestRoundAccuracy,
            playedQuestions,
            totalAnswers
        );
    }

    private Dictionary<string, int> ComputeRanksUnlocked()
    {
        var sorted = _session.Teams.Values
            .OrderByDescending(t => t.Score)
            .ThenByDescending(t => t.CorrectCount)
            .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        var ranks = new Dictionary<string, int>(sorted.Count);
        for (var i = 0; i < sorted.Count; i++)
            ranks[sorted[i].Id] = i + 1;
        return ranks;
    }

    private QuizRound? GetCurrentRoundUnlocked()
    {
        if (_loadedQuiz is null || _session.CurrentRoundIndex < 0 || _session.CurrentRoundIndex >= _loadedQuiz.Rounds.Count)
            return null;
        return _loadedQuiz.Rounds[_session.CurrentRoundIndex];
    }

    private QuizQuestion? GetCurrentQuestionUnlocked()
    {
        var round = GetCurrentRoundUnlocked();
        if (round is null || _session.CurrentQuestionIndex < 0 || _session.CurrentQuestionIndex >= round.Questions.Count)
            return null;
        return round.Questions[_session.CurrentQuestionIndex];
    }

    private string GenerateUniqueRecoveryCodeUnlocked()
    {
        for (var i = 0; i < 32; i++)
        {
            var code = GenerateCode(6);
            if (!_session.Teams.Values.Any(t => string.Equals(t.RecoveryCode, code, StringComparison.OrdinalIgnoreCase)))
                return code;
        }
        return GenerateCode(8);
    }

    private static List<string> BuildDefaultRules(QuizPackage? quiz)
    {
        var basePts = quiz?.Settings.BasePoints ?? 1000;
        var speed = quiz?.Settings.SpeedBonusMax ?? 200;
        var grace = quiz?.Settings.GracePeriodSeconds ?? 5;
        var jokers = quiz?.Settings.JokerCount ?? 2;
        var jokerDesc = quiz?.Settings.JokerMode == JokerMode.PreSelect
            ? $"Ve finále si předem vyberete {jokers} otázky pro Žolíka (2× body za správnou, -50 % za špatnou)."
            : $"Ve finále máte {jokers} Žolíky – zapněte je před odesláním odpovědi (2× body za správnou, -50 % za špatnou).";

        return
        [
            $"Základní hodnota správné odpovědi je {basePts} bodů (ve finále dvojnásobek).",
            $"Rychlostní bonus až +{speed} bodů začíná klesat až po {grace} sekundách na přečtení otázky.",
            "U otevřených odpovědí tolerujeme drobné překlepy a diakritiku; moderátor může udělit i půl bodu.",
            jokerDesc,
            "Žádné googlení u stolu – hrajeme fér a pro zábavu!"
        ];
    }

    private static void UpdateEvalCounters(TeamState team, AnswerEvaluation eval, int delta)
    {
        switch (eval)
        {
            case AnswerEvaluation.Correct:
                team.CorrectCount = Math.Max(0, team.CorrectCount + delta);
                break;
            case AnswerEvaluation.HalfPoint:
                team.HalfPointCount = Math.Max(0, team.HalfPointCount + delta);
                break;
            case AnswerEvaluation.Wrong:
                team.WrongCount = Math.Max(0, team.WrongCount + delta);
                break;
        }
    }

    private static List<string> DeterministicShuffle(List<string> source, string seed)
    {
        if (source.Count <= 1) return [.. source];

        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(seed));
        var seedInt = BitConverter.ToInt32(hash, 0);
        var rng = new Random(seedInt);
        var list = source.ToList();

        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }

        if (list.SequenceEqual(source))
            (list[0], list[^1]) = (list[^1], list[0]);

        return list;
    }

    private static ActiveSessionData CreateFreshSession(string? joinCode = null, string? screenCode = null) => new()
    {
        SessionId = Guid.NewGuid().ToString("N")[..10],
        JoinCode = joinCode ?? GenerateCode(6),
        ScreenCode = screenCode ?? GenerateCode(6),
        State = GameState.Lobby,
        AutoStartTimer = false,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    private static string GenerateCode(int length)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        return new string(chars);
    }

    private static string SanitizeTeamName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return string.Empty;
        var filtered = new string(name.Trim().Where(c => !char.IsControl(c)).ToArray());
        return filtered.Length > 32 ? filtered[..32] : filtered;
    }

    private static string SanitizeLength(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;
        var trimmed = value.Trim();
        return trimmed.Length > maxLength ? trimmed[..maxLength] : trimmed;
    }

    private static string SanitizeAvatarId(string? avatarId)
    {
        const string fallback = "v2:owl:none:none:happy:solid";
        if (string.IsNullOrWhiteSpace(avatarId))
            return fallback;
        var trimmed = avatarId.Trim();
        if (trimmed.Length > 64)
            return fallback;
        foreach (var ch in trimmed)
        {
            if (!(char.IsAsciiLetterOrDigit(ch) || ch is ':' or '_' or '-'))
                return fallback;
        }
        return trimmed;
    }

    private static string SanitizeAvatarColor(string? avatarColor)
    {
        const string fallback = "#b45309";
        if (string.IsNullOrWhiteSpace(avatarColor))
            return fallback;
        var trimmed = avatarColor.Trim();
        if (trimmed.Length != 7 || trimmed[0] != '#')
            return fallback;
        for (var i = 1; i < 7; i++)
        {
            var c = trimmed[i];
            if (!Uri.IsHexDigit(c))
                return fallback;
        }
        return trimmed.ToLowerInvariant();
    }

    public void Dispose()
    {
        CancelTimerUnlocked();
        _lock.Dispose();
    }
}
