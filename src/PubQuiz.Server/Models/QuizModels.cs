using System.Text.Json.Serialization;

namespace PubQuiz.Server.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum QuestionType
{
    MultipleChoice,
    TextInput,
    Ordering
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum JokerMode
{
    OnDemand,
    PreSelect
}

public sealed class QuizPackage
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string DefaultLanguage { get; set; } = "cs";
    public List<string>? Rules { get; set; }
    public QuizSettings Settings { get; set; } = new();
    public List<BonusTaskDefinition> BonusTasks { get; set; } = [];
    public List<QuizRound> Rounds { get; set; } = [];

    [JsonIgnore]
    public List<string> AvailableLanguages { get; set; } = ["cs"];
}

public sealed class BonusTaskDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Points { get; set; } = 300;
    public int MaxCompletionsPerTeam { get; set; } = 1;
}

public sealed class QuizSettings
{
    public int DefaultTimeLimitSeconds { get; set; } = 30;
    public int GracePeriodSeconds { get; set; } = 5;
    public int BasePoints { get; set; } = 1000;
    public int SpeedBonusMax { get; set; } = 200;
    public JokerMode JokerMode { get; set; } = JokerMode.OnDemand;
    public int JokerCount { get; set; } = 2;
    public int? TextMatchMaxDistance { get; set; }
    /// <summary>
    /// When false (default), opening a question enters QuestionReady and waits for the host to start the countdown.
    /// </summary>
    public bool AutoStartTimer { get; set; } = false;
}

public sealed class QuizRound
{
    public int RoundNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsFinal { get; set; }
    public double PointMultiplier { get; set; } = 1.0;
    public List<QuizQuestion> Questions { get; set; } = [];
}

public sealed class QuizQuestion
{
    public string Id { get; set; } = string.Empty;
    public QuestionType Type { get; set; } = QuestionType.MultipleChoice;
    public string Text { get; set; } = string.Empty;
    public List<string>? Options { get; set; }
    public string? CorrectAnswer { get; set; }
    public List<string>? AcceptedAnswers { get; set; }
    public List<string>? CorrectOrder { get; set; }
    public string? HostNote { get; set; }
    public int? TimeLimitSeconds { get; set; }
    public int? BasePoints { get; set; }
    public int? SpeedBonusMax { get; set; }
    public int? GracePeriodSeconds { get; set; }
    public MediaAttachment? Media { get; set; }

    public List<string> GetEffectiveCorrectOrder() =>
        CorrectOrder is { Count: > 0 } ? CorrectOrder : Options ?? [];
}

public sealed class MediaAttachment
{
    public string Type { get; set; } = "image"; // audio | video | image | youtube
    public string Src { get; set; } = string.Empty;
    public double? StartSeconds { get; set; }
    public double? EndSeconds { get; set; }
    public string PlaybackMode { get; set; } = "duringQuestion"; // duringQuestion | onReveal
    public string? AltText { get; set; }
    public string? Transcript { get; set; }
    public string? CaptionsSrc { get; set; }
}

public sealed class QuizTranslation
{
    public string Language { get; set; } = "en";
    public string? Title { get; set; }
    public string? Description { get; set; }
    public List<string>? Rules { get; set; }
    public Dictionary<string, RoundTranslation>? Rounds { get; set; }
    public Dictionary<string, QuestionTranslation>? Questions { get; set; }
    public Dictionary<string, BonusTaskTranslation>? BonusTasks { get; set; }
}

public sealed class BonusTaskTranslation
{
    public string? Title { get; set; }
    public string? Description { get; set; }
}

public sealed class RoundTranslation
{
    public string? Title { get; set; }
    public string? Description { get; set; }
}

public sealed class QuestionTranslation
{
    public string? Text { get; set; }
    public List<string>? Options { get; set; }
    public string? CorrectAnswer { get; set; }
    public List<string>? AcceptedAnswers { get; set; }
    public List<string>? CorrectOrder { get; set; }
    public string? HostNote { get; set; }
    public string? MediaAltText { get; set; }
    public string? MediaTranscript { get; set; }
}

public sealed record QuizSummaryDto(
    string Id,
    string Title,
    string? Description,
    int RoundCount,
    int QuestionCount,
    string DefaultLanguage,
    List<string> AvailableLanguages,
    JokerMode JokerMode,
    int JokerCount,
    bool AutoStartTimer
);

public sealed record QuizDesignerDetailDto(
    QuizPackage Quiz,
    List<string> MediaFiles,
    Dictionary<string, QuizTranslation> Translations
);

public sealed record DuplicateQuizRequest(
    string NewId,
    string NewTitle
);
