using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed partial class QuizRepository
{
    private static readonly JsonSerializerOptions ReadJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static readonly JsonSerializerOptions WriteJsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    private static readonly HashSet<string> AllowedMediaExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif",
        ".mp3", ".wav", ".ogg", ".m4a",
        ".mp4", ".webm", ".vtt"
    };

    private readonly string _quizzesRoot;
    private readonly ILogger<QuizRepository> _logger;

    public QuizRepository(IOptions<PubQuizOptions> options, IHostEnvironment env, ILogger<QuizRepository> logger)
    {
        _logger = logger;
        var envDataDir = Environment.GetEnvironmentVariable("QUIZ_DATA_DIR");
        _quizzesRoot = !string.IsNullOrWhiteSpace(envDataDir)
            ? Path.GetFullPath(Path.Combine(envDataDir, "quizzes"))
            : JwtTokenService.ResolvePath(env.ContentRootPath, options.Value.QuizzesDirectory);

        Directory.CreateDirectory(_quizzesRoot);
    }

    public string QuizzesRoot => _quizzesRoot;

    public List<QuizSummaryDto> ListQuizzes()
    {
        var summaries = new List<QuizSummaryDto>();
        if (!Directory.Exists(_quizzesRoot))
            return summaries;

        foreach (var dir in Directory.GetDirectories(_quizzesRoot).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
        {
            var quizJsonPath = Path.Combine(dir, "quiz.json");
            if (!File.Exists(quizJsonPath))
                continue;

            try
            {
                var quiz = LoadRawQuiz(dir);
                if (quiz is null) continue;

                var languages = DiscoverLanguages(dir, quiz.DefaultLanguage);
                var questionCount = quiz.Rounds.Sum(r => r.Questions.Count);
                summaries.Add(new QuizSummaryDto(
                    quiz.Id,
                    quiz.Title,
                    quiz.Description,
                    quiz.Rounds.Count,
                    questionCount,
                    quiz.DefaultLanguage,
                    languages,
                    quiz.Settings.JokerMode,
                    quiz.Settings.JokerCount,
                    quiz.Settings.AutoStartTimer
                ));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read quiz package in {Directory}", dir);
            }
        }

        return summaries;
    }

    public QuizPackage? LoadQuiz(string quizId, string? language = null)
    {
        if (!IsSafeSegment(quizId))
            return null;

        var dir = Path.Combine(_quizzesRoot, quizId);
        if (!Directory.Exists(dir))
            return null;

        var quiz = LoadRawQuiz(dir);
        if (quiz is null)
            return null;

        quiz.AvailableLanguages = DiscoverLanguages(dir, quiz.DefaultLanguage);

        if (!string.IsNullOrWhiteSpace(language) &&
            !string.Equals(language, quiz.DefaultLanguage, StringComparison.OrdinalIgnoreCase) &&
            IsSafeSegment(language))
        {
            var translationPath = Path.Combine(dir, "translations", $"{language}.json");
            if (File.Exists(translationPath))
            {
                try
                {
                    var translation = JsonSerializer.Deserialize<QuizTranslation>(
                        File.ReadAllText(translationPath), ReadJsonOptions);
                    if (translation is not null)
                        ApplyTranslation(quiz, translation);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to apply translation {Lang} to quiz {QuizId}", language, quizId);
                }
            }
        }

        return quiz;
    }

    public QuizDesignerDetailDto? LoadDesignerDetail(string quizId)
    {
        if (!IsSafeSegment(quizId))
            return null;

        var dir = Path.Combine(_quizzesRoot, quizId);
        if (!Directory.Exists(dir))
            return null;

        var quiz = LoadRawQuiz(dir);
        if (quiz is null)
            return null;

        quiz.AvailableLanguages = DiscoverLanguages(dir, quiz.DefaultLanguage);
        var mediaFiles = ListMediaFiles(quizId);
        var translations = new Dictionary<string, QuizTranslation>(StringComparer.OrdinalIgnoreCase);

        var transDir = Path.Combine(dir, "translations");
        if (Directory.Exists(transDir))
        {
            foreach (var file in Directory.GetFiles(transDir, "*.json"))
            {
                var lang = Path.GetFileNameWithoutExtension(file);
                try
                {
                    var tr = JsonSerializer.Deserialize<QuizTranslation>(File.ReadAllText(file), ReadJsonOptions);
                    if (tr is not null)
                    {
                        tr.Language = lang;
                        translations[lang] = tr;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed reading translation {File}", file);
                }
            }
        }

        return new QuizDesignerDetailDto(quiz, mediaFiles, translations);
    }

    public (bool Success, string? Error, QuizPackage? Saved) SaveQuiz(QuizPackage quiz)
    {
        var slug = NormalizeSlug(quiz.Id);
        if (string.IsNullOrWhiteSpace(slug) || slug == "schema")
            return (false, "Neplatné ID kvízu. Použijte malá písmena, číslice a pomlčky (např. muj-kviz-01).", null);

        if (string.IsNullOrWhiteSpace(quiz.Title))
            return (false, "Název kvízu nemůže být prázdný.", null);

        if (quiz.Rounds is null || quiz.Rounds.Count == 0)
            return (false, "Kvíz musí obsahovat alespoň jedno kolo.", null);
        if (quiz.Rounds.Count > 50)
            return (false, "Kvíz může obsahovat maximálně 50 kol.", null);

        var seenQuestionIds = new HashSet<string>(StringComparer.Ordinal);
        for (var rIdx = 0; rIdx < quiz.Rounds.Count; rIdx++)
        {
            var round = quiz.Rounds[rIdx];
            round.RoundNumber = rIdx + 1;
            if (string.IsNullOrWhiteSpace(round.Title))
                return (false, $"Kolo {round.RoundNumber} nemá vyplněný název.", null);
            if (round.Questions is null || round.Questions.Count == 0)
                return (false, $"Kolo {round.RoundNumber} musí obsahovat alespoň jednu otázku.", null);
            if (round.Questions.Count > 200)
                return (false, $"Kolo {round.RoundNumber} může obsahovat maximálně 200 otázek.", null);

            for (var qIdx = 0; qIdx < round.Questions.Count; qIdx++)
            {
                var q = round.Questions[qIdx];
                if (string.IsNullOrWhiteSpace(q.Id))
                    q.Id = $"r{round.RoundNumber}-q{qIdx + 1}";
                if (!seenQuestionIds.Add(q.Id))
                    q.Id = $"r{round.RoundNumber}-q{qIdx + 1}-{Guid.NewGuid().ToString("N")[..4]}";
                if (string.IsNullOrWhiteSpace(q.Text))
                    return (false, $"Otázka {qIdx + 1} v kole {round.RoundNumber} nemá text.", null);

                if (q.Media is not null)
                {
                    if (!IsSafeMediaReference(q.Media.Src, q.Media.Type))
                        return (false, $"Otázka '{q.Text}' má nepovolenou URL nebo cestu k médiu (povoleny jsou relativní cesty, http/https a YouTube ID).", null);
                    if (!string.IsNullOrWhiteSpace(q.Media.CaptionsSrc) && !IsSafeMediaReference(q.Media.CaptionsSrc, "captions"))
                        return (false, $"Otázka '{q.Text}' má nepovolenou cestu k titulkům.", null);
                }

                if (q.Type == QuestionType.MultipleChoice)
                {
                    var cleanOpts = (q.Options ?? []).Where(o => !string.IsNullOrWhiteSpace(o)).Select(o => o.Trim()).ToList();
                    if (cleanOpts.Count < 2)
                        return (false, $"Otázka '{q.Text}' musí mít alespoň 2 možnosti.", null);
                    q.Options = cleanOpts;
                    if (string.IsNullOrWhiteSpace(q.CorrectAnswer) || !cleanOpts.Contains(q.CorrectAnswer))
                        q.CorrectAnswer = cleanOpts[0];
                }
                else if (q.Type == QuestionType.Ordering)
                {
                    var cleanOrder = q.GetEffectiveCorrectOrder().Where(o => !string.IsNullOrWhiteSpace(o)).Select(o => o.Trim()).ToList();
                    if (cleanOrder.Count < 2)
                        return (false, $"Řadicí otázka '{q.Text}' musí mít alespoň 2 položky.", null);
                    q.Options = cleanOrder;
                    q.CorrectOrder = cleanOrder;
                    if (string.IsNullOrWhiteSpace(q.CorrectAnswer))
                        q.CorrectAnswer = string.Join(" → ", cleanOrder);
                }
                else if (q.Type == QuestionType.TextInput)
                {
                    if (string.IsNullOrWhiteSpace(q.CorrectAnswer) && (q.AcceptedAnswers is null || q.AcceptedAnswers.Count == 0))
                        return (false, $"Otevřená otázka '{q.Text}' musí mít vyplněnou správnou odpověď.", null);
                }
            }
        }

        quiz.Id = slug;
        if (string.IsNullOrWhiteSpace(quiz.DefaultLanguage))
            quiz.DefaultLanguage = "cs";

        quiz.BonusTasks ??= [];
        if (quiz.BonusTasks.Count > 30)
            return (false, "Kvíz může obsahovat maximálně 30 bonusových úkolů.", null);

        var seenTaskIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var tIdx = 0; tIdx < quiz.BonusTasks.Count; tIdx++)
        {
            var task = quiz.BonusTasks[tIdx];
            if (string.IsNullOrWhiteSpace(task.Title))
                return (false, $"Bonusový úkol #{tIdx + 1} nemá vyplněný název.", null);

            task.Title = task.Title.Trim();
            task.Description = string.IsNullOrWhiteSpace(task.Description) ? null : task.Description.Trim();
            task.Points = Math.Clamp(task.Points, 0, 100_000);
            task.MaxCompletionsPerTeam = Math.Clamp(task.MaxCompletionsPerTeam, 1, 50);

            var cleanTaskId = NormalizeSlug(task.Id);
            if (string.IsNullOrWhiteSpace(cleanTaskId))
                cleanTaskId = $"task-{tIdx + 1}";
            if (!seenTaskIds.Add(cleanTaskId))
                cleanTaskId = $"{cleanTaskId}-{Guid.NewGuid().ToString("N")[..4]}";
            task.Id = cleanTaskId;
        }

        var dir = Path.Combine(_quizzesRoot, slug);
        Directory.CreateDirectory(dir);
        Directory.CreateDirectory(Path.Combine(dir, "media"));

        var targetPath = Path.Combine(dir, "quiz.json");
        var tempPath = targetPath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(quiz, WriteJsonOptions));
        File.Move(tempPath, targetPath, overwrite: true);

        quiz.AvailableLanguages = DiscoverLanguages(dir, quiz.DefaultLanguage);
        return (true, null, quiz);
    }

    public (bool Success, string? Error) DeleteQuiz(string quizId)
    {
        if (!IsSafeSegment(quizId) || quizId == "schema")
            return (false, "Neplatné ID kvízu.");

        var dir = Path.Combine(_quizzesRoot, quizId);
        if (!Directory.Exists(dir))
            return (false, "Kvíz nebyl nalezen.");

        Directory.Delete(dir, recursive: true);
        return (true, null);
    }

    public (bool Success, string? Error, QuizPackage? Copy) DuplicateQuiz(string sourceId, string newId, string newTitle)
    {
        if (!IsSafeSegment(sourceId))
            return (false, "Neplatné zdrojové ID.", null);

        var slug = NormalizeSlug(newId);
        if (string.IsNullOrWhiteSpace(slug) || slug == "schema")
            return (false, "Neplatné nové ID kvízu.", null);

        var sourceDir = Path.Combine(_quizzesRoot, sourceId);
        var targetDir = Path.Combine(_quizzesRoot, slug);
        if (!Directory.Exists(sourceDir))
            return (false, "Zdrojový kvíz nebyl nalezen.", null);
        if (Directory.Exists(targetDir))
            return (false, $"Kvíz s ID '{slug}' již existuje.", null);

        var sourceQuiz = LoadRawQuiz(sourceDir);
        if (sourceQuiz is null)
            return (false, "Nepodařilo se načíst zdrojový kvíz.", null);

        CopyDirectoryRecursive(sourceDir, targetDir);
        sourceQuiz.Id = slug;
        if (!string.IsNullOrWhiteSpace(newTitle))
            sourceQuiz.Title = newTitle.Trim();

        var saved = SaveQuiz(sourceQuiz);
        return saved;
    }

    public (bool Success, string? Error) SaveTranslation(string quizId, string lang, QuizTranslation translation)
    {
        if (!IsSafeSegment(quizId) || !IsSafeSegment(lang))
            return (false, "Neplatné ID kvízu nebo kód jazyka.");

        var dir = Path.Combine(_quizzesRoot, quizId);
        if (!Directory.Exists(dir))
            return (false, "Kvíz nebyl nalezen.");

        var transDir = Path.Combine(dir, "translations");
        Directory.CreateDirectory(transDir);

        translation.Language = lang.Trim().ToLowerInvariant();
        var targetPath = Path.Combine(transDir, $"{translation.Language}.json");
        var tempPath = targetPath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(translation, WriteJsonOptions));
        File.Move(tempPath, targetPath, overwrite: true);
        return (true, null);
    }

    public (bool Success, string? Error) DeleteTranslation(string quizId, string lang)
    {
        if (!IsSafeSegment(quizId) || !IsSafeSegment(lang))
            return (false, "Neplatné parametry.");

        var path = Path.Combine(_quizzesRoot, quizId, "translations", $"{lang}.json");
        if (File.Exists(path))
            File.Delete(path);
        return (true, null);
    }

    public List<string> ListMediaFiles(string quizId)
    {
        if (!IsSafeSegment(quizId)) return [];
        var mediaDir = Path.Combine(_quizzesRoot, quizId, "media");
        if (!Directory.Exists(mediaDir)) return [];

        return Directory.GetFiles(mediaDir)
            .Select(f => "media/" + Path.GetFileName(f))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<(bool Success, string? RelativePath, string? Error)> SaveMediaFileAsync(string quizId, IFormFile file)
    {
        if (!IsSafeSegment(quizId))
            return (false, null, "Neplatné ID kvízu.");

        var quizDir = Path.Combine(_quizzesRoot, quizId);
        if (!Directory.Exists(quizDir))
            Directory.CreateDirectory(quizDir);

        if (file.Length <= 0)
            return (false, null, "Nahraný soubor je prázdný.");
        if (file.Length > 50 * 1024 * 1024)
            return (false, null, "Maximální velikost jednoho mediálního souboru je 50 MB.");

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(ext) || !AllowedMediaExtensions.Contains(ext))
            return (false, null, $"Nepodporovaný formát souboru ({ext}). Povoleny jsou obrázky, audio (mp3/wav/ogg/m4a), video (mp4/webm) a titulky (.vtt).");

        // Validate uploaded file signature / SVG script safety before persisting to disk
        var contentCheckError = await ValidateUploadedMediaContentAsync(file, ext);
        if (contentCheckError is not null)
            return (false, null, contentCheckError);

        var rawBase = Path.GetFileNameWithoutExtension(file.FileName);
        var safeBase = NormalizeSlug(rawBase);
        if (string.IsNullOrWhiteSpace(safeBase))
            safeBase = "media-" + Guid.NewGuid().ToString("N")[..6];

        var mediaDir = Path.Combine(quizDir, "media");
        Directory.CreateDirectory(mediaDir);

        var fileName = safeBase + ext.ToLowerInvariant();
        var fullPath = Path.Combine(mediaDir, fileName);
        if (File.Exists(fullPath))
        {
            fileName = $"{safeBase}-{Guid.NewGuid().ToString("N")[..4]}{ext.ToLowerInvariant()}";
            fullPath = Path.Combine(mediaDir, fileName);
        }

        await using var stream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await file.CopyToAsync(stream);

        return (true, $"media/{fileName}", null);
    }

    public (bool Success, string? Error) DeleteMediaFile(string quizId, string fileName)
    {
        var fullPath = ResolveMediaFilePath(quizId, fileName);
        if (fullPath is null)
            return (false, "Soubor nebyl nalezen.");

        File.Delete(fullPath);
        return (true, null);
    }

    public string? ResolveMediaFilePath(string quizId, string relativeMediaPath)
    {
        if (!IsSafeSegment(quizId) || string.IsNullOrWhiteSpace(relativeMediaPath))
            return null;

        var quizDir = Path.GetFullPath(Path.Combine(_quizzesRoot, quizId));
        var mediaRoot = Path.GetFullPath(Path.Combine(quizDir, "media"));

        var cleaned = relativeMediaPath.Replace('\\', '/').TrimStart('/');
        if (cleaned.StartsWith("media/", StringComparison.OrdinalIgnoreCase))
            cleaned = cleaned["media/".Length..];

        var fullPath = Path.GetFullPath(Path.Combine(mediaRoot, cleaned));
        if (!fullPath.StartsWith(mediaRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(fullPath, mediaRoot, StringComparison.OrdinalIgnoreCase))
        {
            return null; // Block path traversal
        }

        return File.Exists(fullPath) ? fullPath : null;
    }

    private QuizPackage? LoadRawQuiz(string dir)
    {
        var quizJsonPath = Path.Combine(dir, "quiz.json");
        if (!File.Exists(quizJsonPath))
            return null;

        var quiz = JsonSerializer.Deserialize<QuizPackage>(File.ReadAllText(quizJsonPath), ReadJsonOptions);
        if (quiz is null)
            return null;

        if (string.IsNullOrWhiteSpace(quiz.Id))
            quiz.Id = Path.GetFileName(dir);
        if (string.IsNullOrWhiteSpace(quiz.DefaultLanguage))
            quiz.DefaultLanguage = "cs";

        return quiz;
    }

    private static List<string> DiscoverLanguages(string quizDir, string defaultLang)
    {
        var langs = new List<string> { defaultLang };
        var transDir = Path.Combine(quizDir, "translations");
        if (Directory.Exists(transDir))
        {
            foreach (var file in Directory.GetFiles(transDir, "*.json"))
            {
                var lang = Path.GetFileNameWithoutExtension(file);
                if (!string.IsNullOrWhiteSpace(lang) && !langs.Contains(lang, StringComparer.OrdinalIgnoreCase))
                    langs.Add(lang);
            }
        }
        return langs;
    }

    private static void ApplyTranslation(QuizPackage quiz, QuizTranslation translation)
    {
        if (!string.IsNullOrWhiteSpace(translation.Title))
            quiz.Title = translation.Title;
        if (!string.IsNullOrWhiteSpace(translation.Description))
            quiz.Description = translation.Description;
        if (translation.Rules is { Count: > 0 })
            quiz.Rules = translation.Rules;

        if (translation.Rounds is not null)
        {
            foreach (var round in quiz.Rounds)
            {
                if (translation.Rounds.TryGetValue(round.RoundNumber.ToString(), out var rt))
                {
                    if (!string.IsNullOrWhiteSpace(rt.Title)) round.Title = rt.Title;
                    if (!string.IsNullOrWhiteSpace(rt.Description)) round.Description = rt.Description;
                }
            }
        }

        if (translation.Questions is not null)
        {
            foreach (var round in quiz.Rounds)
            {
                foreach (var q in round.Questions)
                {
                    if (!translation.Questions.TryGetValue(q.Id, out var qt))
                        continue;

                    if (!string.IsNullOrWhiteSpace(qt.Text)) q.Text = qt.Text;
                    if (qt.Options is { Count: > 0 }) q.Options = qt.Options;
                    if (!string.IsNullOrWhiteSpace(qt.CorrectAnswer)) q.CorrectAnswer = qt.CorrectAnswer;
                    if (qt.AcceptedAnswers is { Count: > 0 }) q.AcceptedAnswers = qt.AcceptedAnswers;
                    if (qt.CorrectOrder is { Count: > 0 }) q.CorrectOrder = qt.CorrectOrder;
                    if (!string.IsNullOrWhiteSpace(qt.HostNote)) q.HostNote = qt.HostNote;
                    if (q.Media is not null)
                    {
                        if (!string.IsNullOrWhiteSpace(qt.MediaAltText)) q.Media.AltText = qt.MediaAltText;
                        if (!string.IsNullOrWhiteSpace(qt.MediaTranscript)) q.Media.Transcript = qt.MediaTranscript;
                    }
                }
            }
        }

        if (translation.BonusTasks is not null && quiz.BonusTasks is { Count: > 0 })
        {
            foreach (var task in quiz.BonusTasks)
            {
                if (translation.BonusTasks.TryGetValue(task.Id, out var tt))
                {
                    if (!string.IsNullOrWhiteSpace(tt.Title)) task.Title = tt.Title;
                    if (!string.IsNullOrWhiteSpace(tt.Description)) task.Description = tt.Description;
                }
            }
        }
    }

    private static void CopyDirectoryRecursive(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var file in Directory.GetFiles(sourceDir))
        {
            File.Copy(file, Path.Combine(destDir, Path.GetFileName(file)), overwrite: true);
        }
        foreach (var sub in Directory.GetDirectories(sourceDir))
        {
            CopyDirectoryRecursive(sub, Path.Combine(destDir, Path.GetFileName(sub)));
        }
    }

    public static string NormalizeSlug(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var ascii = AnswerEvaluator.NormalizeText(raw);
        var dashed = SlugInvalidRegex().Replace(ascii, "-").Trim('-');
        return dashed.Length > 48 ? dashed[..48].Trim('-') : dashed;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex SlugInvalidRegex();

    [GeneratedRegex(@"<\s*(script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript\s*:|vbscript\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex DangerousSvgContentRegex();

    private static async Task<string?> ValidateUploadedMediaContentAsync(IFormFile file, string ext)
    {
        var lowerExt = ext.ToLowerInvariant();
        if (lowerExt == ".svg")
        {
            if (file.Length > 2 * 1024 * 1024)
                return "SVG soubor může mít maximálně 2 MB.";

            using var reader = new StreamReader(file.OpenReadStream());
            var content = await reader.ReadToEndAsync();
            if (!content.Contains("<svg", StringComparison.OrdinalIgnoreCase))
                return "Nahraný soubor není platný SVG obrázek.";
            if (DangerousSvgContentRegex().IsMatch(content))
                return "SVG soubor obsahuje nepovolené skripty nebo aktivní prvky a byl z bezpečnostních důvodů odmítnut.";
            return null;
        }

        // Magic-byte signature check for raster images to block disguised HTML/scripts
        if (lowerExt is ".png" or ".jpg" or ".jpeg" or ".gif" or ".webp")
        {
            var header = new byte[12];
            await using var stream = file.OpenReadStream();
            var read = await stream.ReadAsync(header);
            var valid = lowerExt switch
            {
                ".png" => read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
                ".jpg" or ".jpeg" => read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
                ".gif" => read >= 4 && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x38,
                ".webp" => read >= 12 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46 &&
                           header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50,
                _ => true
            };
            if (!valid)
                return $"Obsah souboru neodpovídá deklarovanému formátu {lowerExt}.";
        }

        return null;
    }

    public static bool IsSafeMediaReference(string? rawSrc, string? mediaType)
    {
        if (string.IsNullOrWhiteSpace(rawSrc))
            return false;

        var trimmed = rawSrc.Trim();
        if (trimmed.Length > 1024 || trimmed.Any(char.IsControl))
            return false;

        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
            return uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp;

        // Block scheme-like strings (javascript:, data:, vbscript:, file:, etc.) and protocol-relative //evil
        if (trimmed.Contains(':') || trimmed.StartsWith("//", StringComparison.Ordinal))
            return false;

        if (string.Equals(mediaType, "youtube", StringComparison.OrdinalIgnoreCase))
            return trimmed.Length == 11 && trimmed.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

        return !trimmed.Contains("..", StringComparison.Ordinal) && !trimmed.Contains('\\');
    }

    private static bool IsSafeSegment(string value) =>
        !string.IsNullOrWhiteSpace(value) &&
        !value.Contains("..", StringComparison.Ordinal) &&
        !value.Contains('/') &&
        !value.Contains('\\') &&
        value.IndexOfAny(Path.GetInvalidFileNameChars()) < 0;
}
