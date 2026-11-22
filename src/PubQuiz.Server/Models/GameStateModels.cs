using System.Text.Json.Serialization;

namespace PubQuiz.Server.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum GameState
{
    Lobby,
    QuizIntro,
    RoundIntro,
    QuestionReady,
    QuestionActive,
    QuestionLocked,
    QuestionReveal,
    Leaderboard,
    Finished
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AnswerEvaluation
{
    Pending,
    Correct,
    HalfPoint,
    Wrong
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BonusTaskClaimStatus
{
    Pending,
    Approved,
    Rejected
}

public sealed class BonusTaskClaim
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string TeamId { get; set; } = string.Empty;
    public string TaskId { get; set; } = string.Empty;
    public string? Note { get; set; }
    public BonusTaskClaimStatus Status { get; set; } = BonusTaskClaimStatus.Pending;
    public int PointsAwarded { get; set; }
    public string? HostComment { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAtUtc { get; set; }
}

public sealed class TeamState
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string AvatarId { get; set; } = "owl";
    public string AvatarColor { get; set; } = "#d97706";
    public string RecoveryCode { get; set; } = string.Empty;
    public int Score { get; set; }
    public bool IsConnected { get; set; }
    public DateTimeOffset JoinedAtUtc { get; set; }
    public DateTimeOffset LastSeenUtc { get; set; }
    public int LastLatencyMs { get; set; }
    public int JokersUsed { get; set; }
    public List<string> PreSelectedJokerQuestionIds { get; set; } = [];
    public List<string> DismissedMessageIds { get; set; } = [];
    public List<ManualScoreAdjustment> ManualAdjustments { get; set; } = [];

    // Stats
    public int CorrectCount { get; set; }
    public int HalfPointCount { get; set; }
    public int WrongCount { get; set; }
    public long TotalResponseTimeMs { get; set; }
    public int ResponseCount { get; set; }
    public Dictionary<int, int> PointsByRound { get; set; } = new();
}

public sealed class ManualScoreAdjustment
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public int Delta { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; set; }
}

public sealed class QuestionRuntimeOverrides
{
    public int? TimeLimitSeconds { get; set; }
    public int? BasePoints { get; set; }
    public int? SpeedBonusMax { get; set; }
    public int? GracePeriodSeconds { get; set; }
    public string? Text { get; set; }
    public List<string>? AcceptedAnswers { get; set; }
    public string? HostNote { get; set; }
}

public sealed class TeamAnswerRecord
{
    public string TeamId { get; set; } = string.Empty;
    public string QuestionId { get; set; } = string.Empty;
    public string SubmissionId { get; set; } = string.Empty;
    public string AnswerText { get; set; } = string.Empty;
    public List<string>? OrderedItems { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
    public int AnswerSequence { get; set; }
    public int EffectiveElapsedMs { get; set; }
    public int EstimatedLatencyMs { get; set; }
    public bool JokerUsed { get; set; }
    public AnswerEvaluation AutoEvaluation { get; set; } = AnswerEvaluation.Pending;
    public AnswerEvaluation FinalEvaluation { get; set; } = AnswerEvaluation.Pending;
    public bool IsOverriddenByHost { get; set; }
    public int? MatchedDistance { get; set; }
    public int BasePointsAwarded { get; set; }
    public int SpeedBonusAwarded { get; set; }
    public int JokerDelta { get; set; }
    public int TotalPointsAwarded { get; set; }
    public bool PointsApplied { get; set; }
}

public sealed class ScreenBannerMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Text { get; set; } = string.Empty;
    public string Kind { get; set; } = "info"; // info | hint | warning
    public DateTimeOffset SentAtUtc { get; set; }
}

public sealed class PlayerMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string? TargetTeamId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTimeOffset SentAtUtc { get; set; }
}

public sealed class PreviousScreenSnapshot
{
    public GameState State { get; set; }
    public int CurrentRoundIndex { get; set; }
    public int CurrentQuestionIndex { get; set; }
    public bool WasPaused { get; set; }
    public double? RemainingSeconds { get; set; }
}

public sealed class ActiveSessionData
{
    public string SessionId { get; set; } = Guid.NewGuid().ToString("N")[..10];
    public string? QuizId { get; set; }
    public string QuizLanguage { get; set; } = "cs";
    public string JoinCode { get; set; } = string.Empty;
    public string ScreenCode { get; set; } = string.Empty;
    public GameState State { get; set; } = GameState.Lobby;
    public PreviousScreenSnapshot? ReturnScreen { get; set; }
    public bool AutoStartTimer { get; set; } = false;
    public int CurrentRoundIndex { get; set; } = -1;
    public int CurrentQuestionIndex { get; set; } = -1;
    public DateTimeOffset? QuestionStartedAtUtc { get; set; }
    public DateTimeOffset? QuestionEndsAtUtc { get; set; }
    public bool IsPaused { get; set; }
    public double? PausedRemainingSeconds { get; set; }
    public double ActiveTimeLimitSeconds { get; set; }
    public int ActiveBasePoints { get; set; }
    public int ActiveSpeedBonusMax { get; set; }
    public int ActiveGracePeriodSeconds { get; set; }
    public List<string>? ShuffledOrderingOptions { get; set; }
    public int CurrentQuestionSequenceCounter { get; set; }
    public Dictionary<string, QuestionRuntimeOverrides> QuestionOverrides { get; set; } = new();
    public Dictionary<string, TeamState> Teams { get; set; } = new();
    public Dictionary<string, Dictionary<string, TeamAnswerRecord>> AnswersByQuestion { get; set; } = new();
    public ScreenBannerMessage? ScreenBanner { get; set; }
    public List<PlayerMessage> RecentPlayerMessages { get; set; } = [];
    public List<BonusTaskClaim> BonusTaskClaims { get; set; } = [];
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

// --- Client-Facing DTOs (strictly role-scoped) ---

public sealed record LeaderboardEntryDto(
    string TeamId,
    string Name,
    string AvatarId,
    string AvatarColor,
    int Score,
    int PreviousRank,
    int Rank,
    int LastQuestionDelta,
    bool IsConnected,
    int JokersRemaining,
    int CorrectCount
);

public sealed record EveningStatisticsDto(
    string? FastestTeamName,
    double? FastestAvgResponseSeconds,
    int? BestRoundNumber,
    string? BestRoundTitle,
    double? BestRoundAccuracyPercent,
    int TotalQuestionsPlayed,
    int TotalAnswersSubmitted
);

public sealed record PublicMediaDto(
    string Type,
    string Url,
    string RawSrc,
    double? StartSeconds,
    double? EndSeconds,
    string PlaybackMode,
    string? AltText,
    string? Transcript,
    string? CaptionsUrl
);

public sealed record ActiveQuestionPublicDto(
    string Id,
    int QuestionNumberInRound,
    int TotalQuestionsInRound,
    int RoundNumber,
    string RoundTitle,
    bool IsFinalRound,
    QuestionType Type,
    string Text,
    List<string>? Options,
    double TimeLimitSeconds,
    int BasePoints,
    int SpeedBonusMax,
    int GracePeriodSeconds,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? EndsAtUtc,
    bool IsPaused,
    double? PausedRemainingSeconds,
    PublicMediaDto? Media,
    // Populated ONLY when State == QuestionReveal (or for Host always)
    string? CorrectAnswer,
    List<string>? CorrectOrder,
    List<string>? AcceptedAnswers,
    string? HostNote
);

public sealed record TeamQuestionOutcomeDto(
    string TeamId,
    string TeamName,
    string AvatarId,
    string AvatarColor,
    bool HasAnswered,
    int? AnswerSequence,
    double? ElapsedSeconds,
    bool JokerUsed,
    AnswerEvaluation? Evaluation,
    int PointsAwarded,
    string? AnswerText,
    List<string>? OrderedItems
);

public sealed record HostAnswerDetailDto(
    string TeamId,
    string TeamName,
    string AvatarId,
    string AvatarColor,
    bool IsConnected,
    bool HasAnswered,
    int? AnswerSequence,
    DateTimeOffset? ReceivedAtUtc,
    double? EffectiveElapsedSeconds,
    int? EstimatedLatencyMs,
    string? AnswerText,
    List<string>? OrderedItems,
    bool JokerUsed,
    AnswerEvaluation AutoEvaluation,
    AnswerEvaluation FinalEvaluation,
    bool IsOverriddenByHost,
    int? MatchedDistance,
    int BasePointsAwarded,
    int SpeedBonusAwarded,
    int JokerDelta,
    int TotalPointsAwarded
);

public sealed record RoundOverviewDto(
    int RoundIndex,
    int RoundNumber,
    string Title,
    string? Description,
    bool IsFinal,
    double PointMultiplier,
    int QuestionCount,
    List<string> QuestionIds
);

public sealed record ManualScoreAdjustmentDto(
    string Id,
    int Delta,
    string Reason,
    DateTimeOffset CreatedAtUtc
);

public sealed record HostTeamInfoDto(
    string TeamId,
    string Name,
    string AvatarId,
    string AvatarColor,
    int Score,
    bool IsConnected,
    string RecoveryCode,
    string ReconnectUrl,
    int PreSelectedJokersCount,
    List<ManualScoreAdjustmentDto> ManualAdjustments
);

public sealed record PublicTeamSummaryDto(
    string TeamId,
    string Name,
    string AvatarId,
    string AvatarColor,
    bool IsConnected,
    int Score
);

public sealed record BonusTaskDto(
    string Id,
    string Title,
    string? Description,
    int Points,
    int MaxCompletionsPerTeam
);

public sealed record HostBonusTaskClaimDto(
    string Id,
    string TeamId,
    string TeamName,
    string AvatarId,
    string AvatarColor,
    string TaskId,
    string TaskTitle,
    int TaskPoints,
    int MaxCompletionsPerTeam,
    int TeamApprovedCount,
    string? Note,
    BonusTaskClaimStatus Status,
    int PointsAwarded,
    string? HostComment,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReviewedAtUtc
);

public sealed record PlayerBonusTaskClaimDto(
    string Id,
    string TaskId,
    string? Note,
    BonusTaskClaimStatus Status,
    int PointsAwarded,
    string? HostComment,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReviewedAtUtc
);

public sealed record GameStateBroadcastDto(
    string SessionId,
    string Role,
    GameState State,
    DateTimeOffset ServerUtcNow,
    string? QuizId,
    string? QuizTitle,
    string? QuizDescription,
    string QuizLanguage,
    List<string> AvailableQuizLanguages,
    List<string> QuizRules,
    JokerMode JokerMode,
    int JokerCount,
    List<BonusTaskDto> BonusTasks,
    bool AutoStartTimer,
    bool CanReturnToPreviousScreen,
    GameState? ReturnScreenState,
    string JoinCode,
    string JoinUrl,
    string? ScreenCode,
    string? ScreenUrl,
    int CurrentRoundIndex,
    int CurrentQuestionIndex,
    RoundOverviewDto? CurrentRound,
    List<RoundOverviewDto> Rounds,
    ActiveQuestionPublicDto? CurrentQuestion,
    int ConnectedTeamsCount,
    int TotalTeamsCount,
    int AnsweredTeamsCount,
    List<LeaderboardEntryDto> Leaderboard,
    List<TeamQuestionOutcomeDto> QuestionOutcomes,
    ScreenBannerMessage? ScreenBanner,
    List<PlayerMessage> Messages,
    EveningStatisticsDto? Statistics,
    // Host-only fields (null for Screen & Player)
    List<HostAnswerDetailDto>? HostAnswers,
    List<HostTeamInfoDto>? HostTeams,
    List<HostBonusTaskClaimDto>? HostTaskClaims,
    // Player-only fields (null for Host & Screen)
    PlayerSelfDto? Self
);

public sealed record PlayerSelfDto(
    string TeamId,
    string TeamName,
    string AvatarId,
    string AvatarColor,
    string RecoveryCode,
    int Score,
    int Rank,
    int JokersRemaining,
    List<string> PreSelectedJokerQuestionIds,
    bool HasSubmittedCurrentQuestion,
    bool CurrentQuestionJokerActive,
    string? SubmittedAnswerText,
    List<string>? SubmittedOrderedItems,
    AnswerEvaluation? LastEvaluation,
    int LastPointsAwarded,
    List<PlayerBonusTaskClaimDto> TaskClaims
);

// --- Request DTOs ---

public sealed record SubmitAnswerRequest(
    string QuestionId,
    string SubmissionId,
    string? AnswerText,
    List<string>? OrderedItems,
    bool UseJoker
);

public sealed record OverrideEvaluationRequest(
    string TeamId,
    AnswerEvaluation Evaluation
);

public sealed record ManualScoreAdjustmentRequest(
    string TeamId,
    int Delta,
    string Reason
);

public sealed record UpdateQuestionParamsRequest(
    int? TimeLimitSeconds,
    double? RemainingSeconds,
    int? BasePoints,
    int? SpeedBonusMax,
    int? GracePeriodSeconds,
    string? Text,
    List<string>? AcceptedAnswers,
    string? HostNote
);

public sealed record SendScreenBannerRequest(
    string Text,
    string Kind = "info"
);

public sealed record SendPlayerMessageRequest(
    string Text,
    string? TargetTeamId = null
);

public sealed record PreSelectJokersRequest(
    List<string> QuestionIds
);

public sealed record LoadQuizRequest(
    string QuizId,
    string? Language = null
);

public sealed record UpdateProfileRequest(
    string TeamName,
    string AvatarId,
    string AvatarColor
);

public sealed record UpdateSessionSettingsRequest(
    bool AutoStartTimer
);

public sealed record RejoinTeamRequest(
    string? JoinCode,
    string? RecoveryCode,
    string? TeamId,
    string? TeamName
);

public sealed record ClaimBonusTaskRequest(
    string TaskId,
    string? Note = null
);

public sealed record ReviewBonusTaskClaimRequest(
    string ClaimId,
    bool Approve,
    string? HostComment = null
);

public sealed record AwardBonusTaskRequest(
    string TeamId,
    string TaskId,
    string? HostComment = null
);
