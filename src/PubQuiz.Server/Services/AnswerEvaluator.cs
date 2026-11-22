using System.Globalization;
using System.Text;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed record EvaluationOutcome(
    AnswerEvaluation Evaluation,
    int? MatchedDistance
);

public sealed record ScoreBreakdown(
    int BasePoints,
    int SpeedBonus,
    int JokerDelta,
    int TotalPoints
);

public static class AnswerEvaluator
{
    private const int MaxNormalizedLength = 512;

    /// <summary>
    /// Normalizes text for Czech & international quiz matching:
    /// NFD decomposition -> strip diacritics -> lowercase -> normalize punctuation & whitespace.
    /// </summary>
    public static string NormalizeText(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return string.Empty;

        var trimmed = input.Trim();
        if (trimmed.Length > MaxNormalizedLength)
            trimmed = trimmed[..MaxNormalizedLength];

        var normalized = trimmed.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        var lastWasSpace = false;

        foreach (var ch in normalized)
        {
            var cat = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (cat == UnicodeCategory.NonSpacingMark)
                continue;

            var lower = char.ToLowerInvariant(ch);
            if (char.IsLetterOrDigit(lower))
            {
                sb.Append(lower);
                lastWasSpace = false;
            }
            else if (char.IsWhiteSpace(lower) || lower is '-' or '–' or '—' or '/' or '_' or ':' or ',' or '.')
            {
                if (sb.Length > 0 && !lastWasSpace)
                {
                    sb.Append(' ');
                    lastWasSpace = true;
                }
            }
        }

        return sb.ToString().Trim();
    }

    /// <summary>
    /// Computes standard Levenshtein edit distance between two normalized strings.
    /// </summary>
    public static int LevenshteinDistance(ReadOnlySpan<char> a, ReadOnlySpan<char> b)
    {
        if (a.Length > MaxNormalizedLength) a = a[..MaxNormalizedLength];
        if (b.Length > MaxNormalizedLength) b = b[..MaxNormalizedLength];
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;

        var prev = new int[b.Length + 1];
        var curr = new int[b.Length + 1];

        for (var j = 0; j <= b.Length; j++)
            prev[j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            curr[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(
                    Math.Min(curr[j - 1] + 1, prev[j] + 1),
                    prev[j - 1] + cost
                );
            }
            (prev, curr) = (curr, prev);
        }

        return prev[b.Length];
    }

    public static EvaluationOutcome Evaluate(
        QuizQuestion question,
        string? answerText,
        List<string>? orderedItems,
        QuestionRuntimeOverrides? overrides,
        int? maxDistanceOverride = null)
    {
        return question.Type switch
        {
            QuestionType.MultipleChoice => EvaluateMultipleChoice(question, answerText),
            QuestionType.TextInput => EvaluateTextInput(question, answerText, overrides, maxDistanceOverride),
            QuestionType.Ordering => EvaluateOrdering(question, orderedItems),
            _ => new EvaluationOutcome(AnswerEvaluation.Wrong, null)
        };
    }

    private static EvaluationOutcome EvaluateMultipleChoice(QuizQuestion question, string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText) || string.IsNullOrWhiteSpace(question.CorrectAnswer))
            return new EvaluationOutcome(AnswerEvaluation.Wrong, null);

        var isMatch = string.Equals(
            NormalizeText(answerText),
            NormalizeText(question.CorrectAnswer),
            StringComparison.Ordinal);

        return new EvaluationOutcome(isMatch ? AnswerEvaluation.Correct : AnswerEvaluation.Wrong, isMatch ? 0 : null);
    }

    private static EvaluationOutcome EvaluateTextInput(
        QuizQuestion question,
        string? answerText,
        QuestionRuntimeOverrides? overrides,
        int? maxDistanceOverride)
    {
        var normalizedSubmission = NormalizeText(answerText);
        if (string.IsNullOrEmpty(normalizedSubmission))
            return new EvaluationOutcome(AnswerEvaluation.Wrong, null);

        var candidates = new List<string>();
        if (overrides?.AcceptedAnswers is { Count: > 0 })
            candidates.AddRange(overrides.AcceptedAnswers);
        else if (question.AcceptedAnswers is { Count: > 0 })
            candidates.AddRange(question.AcceptedAnswers);

        if (!string.IsNullOrWhiteSpace(question.CorrectAnswer))
            candidates.Add(question.CorrectAnswer);

        var bestDistance = int.MaxValue;
        var matched = false;

        foreach (var rawCandidate in candidates)
        {
            var normalizedCandidate = NormalizeText(rawCandidate);
            if (string.IsNullOrEmpty(normalizedCandidate))
                continue;

            var distance = LevenshteinDistance(normalizedSubmission, normalizedCandidate);
            if (distance < bestDistance)
                bestDistance = distance;

            var tolerance = maxDistanceOverride ?? GetAdaptiveTolerance(normalizedCandidate);
            if (distance <= tolerance)
            {
                matched = true;
                if (distance == 0)
                    break;
            }
        }

        return new EvaluationOutcome(
            matched ? AnswerEvaluation.Correct : AnswerEvaluation.Wrong,
            bestDistance == int.MaxValue ? null : bestDistance
        );
    }

    /// <summary>
    /// Adaptive typo tolerance: pure numeric answers require exact match (e.g., years "1989" vs "1988");
    /// short words (<=4) require exact match; 5-9 chars allow 1 typo; 10-16 chars allow 2; 17+ allow 3.
    /// </summary>
    private static int GetAdaptiveTolerance(string normalizedCandidate)
    {
        if (normalizedCandidate.All(c => char.IsDigit(c) || c == ' '))
            return 0;

        return normalizedCandidate.Length switch
        {
            <= 4 => 0,
            <= 9 => 1,
            <= 16 => 2,
            _ => 3
        };
    }

    private static EvaluationOutcome EvaluateOrdering(QuizQuestion question, List<string>? orderedItems)
    {
        var expected = question.GetEffectiveCorrectOrder();
        if (orderedItems is null || orderedItems.Count != expected.Count || expected.Count == 0)
            return new EvaluationOutcome(AnswerEvaluation.Wrong, null);

        var exactMatches = 0;
        for (var i = 0; i < expected.Count; i++)
        {
            if (string.Equals(NormalizeText(orderedItems[i]), NormalizeText(expected[i]), StringComparison.Ordinal))
                exactMatches++;
        }

        if (exactMatches == expected.Count)
            return new EvaluationOutcome(AnswerEvaluation.Correct, 0);

        return new EvaluationOutcome(AnswerEvaluation.Wrong, expected.Count - exactMatches);
    }

    /// <summary>
    /// Calculates points with grace period speed bonus and Final Round Joker rules:
    /// - Correct: basePoints + speedBonus (decays linearly from speedBonusMax after gracePeriodSeconds to 0 at timeLimitSeconds)
    /// - HalfPoint: basePoints / 2 (no speed bonus)
    /// - Wrong / Pending: 0
    /// - Joker (final round): multiplies positive gain by 2x; wrong/missed answer deducts basePoints / 2.
    /// </summary>
    public static ScoreBreakdown CalculateScore(
        AnswerEvaluation evaluation,
        int basePoints,
        int speedBonusMax,
        double gracePeriodSeconds,
        double timeLimitSeconds,
        double effectiveElapsedSeconds,
        bool jokerUsed)
    {
        var clampedElapsed = Math.Clamp(effectiveElapsedSeconds, 0, Math.Max(0.1, timeLimitSeconds));

        var earnedBase = 0;
        var speedBonus = 0;

        if (evaluation == AnswerEvaluation.Correct)
        {
            earnedBase = basePoints;
            if (speedBonusMax > 0)
            {
                if (clampedElapsed <= gracePeriodSeconds || timeLimitSeconds <= gracePeriodSeconds)
                {
                    speedBonus = speedBonusMax;
                }
                else
                {
                    var decayWindow = timeLimitSeconds - gracePeriodSeconds;
                    var remainingFraction = Math.Clamp((timeLimitSeconds - clampedElapsed) / decayWindow, 0.0, 1.0);
                    speedBonus = (int)Math.Round(speedBonusMax * remainingFraction, MidpointRounding.AwayFromZero);
                }
            }
        }
        else if (evaluation == AnswerEvaluation.HalfPoint)
        {
            earnedBase = (int)Math.Round(basePoints / 2.0, MidpointRounding.AwayFromZero);
        }

        var subtotal = earnedBase + speedBonus;
        var jokerDelta = 0;

        if (jokerUsed)
        {
            if (subtotal > 0)
            {
                jokerDelta = subtotal; // total becomes 2x
            }
            else
            {
                jokerDelta = -(int)Math.Round(basePoints / 2.0, MidpointRounding.AwayFromZero);
            }
        }

        return new ScoreBreakdown(earnedBase, speedBonus, jokerDelta, subtotal + jokerDelta);
    }
}
