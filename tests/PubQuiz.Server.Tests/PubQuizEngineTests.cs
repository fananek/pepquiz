using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PubQuiz.Server.Hubs;
using PubQuiz.Server.Models;
using PubQuiz.Server.Services;
using Xunit;

namespace PubQuiz.Server.Tests;

public sealed class AnswerEvaluatorTests
{
    [Fact]
    public void NormalizeText_StripsCzechDiacriticsAndNormalizesWhitespace()
    {
        var normalized = AnswerEvaluator.NormalizeText("  Příliš, žluťoučký – KŮŇ!  ");
        Assert.Equal("prilis zlutoucky kun", normalized);
    }

    [Fact]
    public void EvaluateTextInput_AcceptsMinorTyposAndRejectsWrongYears()
    {
        var songQ = new QuizQuestion
        {
            Id = "q-song",
            Type = QuestionType.TextInput,
            CorrectAnswer = "Queen – Bohemian Rhapsody",
            AcceptedAnswers = ["Bohemian Rhapsody", "Queen Bohemian Rhapsody"]
        };

        var typoResult = AnswerEvaluator.Evaluate(songQ, "Boheman Rapsody", null, null);
        Assert.Equal(AnswerEvaluation.Correct, typoResult.Evaluation);

        var yearQ = new QuizQuestion
        {
            Id = "q-year",
            Type = QuestionType.TextInput,
            CorrectAnswer = "1989"
        };

        var wrongYear = AnswerEvaluator.Evaluate(yearQ, "1988", null, null);
        Assert.Equal(AnswerEvaluation.Wrong, wrongYear.Evaluation);

        var rightYear = AnswerEvaluator.Evaluate(yearQ, "1989", null, null);
        Assert.Equal(AnswerEvaluation.Correct, rightYear.Evaluation);
    }

    [Fact]
    public void EvaluateOrdering_RequiresExactOrder()
    {
        var q = new QuizQuestion
        {
            Id = "q-ord",
            Type = QuestionType.Ordering,
            Options = ["První", "Druhý", "Třetí"]
        };

        Assert.Equal(AnswerEvaluation.Correct, AnswerEvaluator.Evaluate(q, null, ["První", "Druhý", "Třetí"], null).Evaluation);
        Assert.Equal(AnswerEvaluation.Wrong, AnswerEvaluator.Evaluate(q, null, ["Druhý", "První", "Třetí"], null).Evaluation);
    }

    [Fact]
    public void CalculateScore_AppliesGracePeriodLinearDecayAndJokerRules()
    {
        // Within grace period (5s): full speed bonus (200)
        var fast = AnswerEvaluator.CalculateScore(AnswerEvaluation.Correct, 1000, 200, 5, 30, 3.2, jokerUsed: false);
        Assert.Equal(1000, fast.BasePoints);
        Assert.Equal(200, fast.SpeedBonus);
        Assert.Equal(1200, fast.TotalPoints);

        // Midpoint of decay window (5s..30s -> 17.5s = 50% remaining -> 100 bonus)
        var mid = AnswerEvaluator.CalculateScore(AnswerEvaluation.Correct, 1000, 200, 5, 30, 17.5, jokerUsed: false);
        Assert.Equal(100, mid.SpeedBonus);
        Assert.Equal(1100, mid.TotalPoints);

        // Final Joker Correct -> 2x total gain
        var jokerWin = AnswerEvaluator.CalculateScore(AnswerEvaluation.Correct, 2000, 200, 5, 30, 4.0, jokerUsed: true);
        Assert.Equal(4400, jokerWin.TotalPoints);

        // Final Joker Wrong -> -50% basePoints (-1000)
        var jokerLoss = AnswerEvaluator.CalculateScore(AnswerEvaluation.Wrong, 2000, 200, 5, 30, 10.0, jokerUsed: true);
        Assert.Equal(-1000, jokerLoss.TotalPoints);

        // HalfPoint without Joker -> 500, no speed bonus
        var half = AnswerEvaluator.CalculateScore(AnswerEvaluation.HalfPoint, 1000, 200, 5, 30, 2.0, jokerUsed: false);
        Assert.Equal(500, half.TotalPoints);
        Assert.Equal(0, half.SpeedBonus);
    }
}

public sealed class GameEngineIntegrationTests : IDisposable
{
    private readonly string _tempRoot;

    public GameEngineIntegrationTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "pubquiz-test-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(Path.Combine(_tempRoot, "quizzes", "test-quiz"));
        Directory.CreateDirectory(Path.Combine(_tempRoot, "state"));

        var sampleQuiz = new QuizPackage
        {
            Id = "test-quiz",
            Title = "Testovací kvíz",
            Settings = new QuizSettings
            {
                DefaultTimeLimitSeconds = 30,
                GracePeriodSeconds = 5,
                BasePoints = 1000,
                SpeedBonusMax = 200,
                JokerMode = JokerMode.PreSelect,
                JokerCount = 2
            },
            BonusTasks =
            [
                new BonusTaskDefinition
                {
                    Id = "task-shots",
                    Title = "Panák pro celý tým",
                    Description = "Vedoucí objedná všem členům týmu panáka.",
                    Points = 300,
                    MaxCompletionsPerTeam = 2
                }
            ],
            Rounds =
            [
                new QuizRound
                {
                    RoundNumber = 1,
                    Title = "Kolo 1",
                    IsFinal = false,
                    PointMultiplier = 1.0,
                    Questions =
                    [
                        new QuizQuestion
                        {
                            Id = "r1-q1",
                            Type = QuestionType.MultipleChoice,
                            Text = "Hlavní město ČR?",
                            Options = ["Brno", "Praha", "Ostrava", "Plzeň"],
                            CorrectAnswer = "Praha",
                            HostNote = "Tajná poznámka moderátora",
                            TimeLimitSeconds = 30
                        },
                        new QuizQuestion
                        {
                            Id = "r1-q2",
                            Type = QuestionType.TextInput,
                            Text = "Autor Osudů dobrého vojáka Švejka?",
                            CorrectAnswer = "Jaroslav Hašek",
                            AcceptedAnswers = ["Hašek", "Jaroslav Hašek"],
                            TimeLimitSeconds = 30
                        }
                    ]
                },
                new QuizRound
                {
                    RoundNumber = 2,
                    Title = "Finále",
                    IsFinal = true,
                    PointMultiplier = 2.0,
                    Questions =
                    [
                        new QuizQuestion
                        {
                            Id = "f-q1",
                            Type = QuestionType.MultipleChoice,
                            Text = "Finálová 1",
                            Options = ["A", "B"],
                            CorrectAnswer = "A",
                            TimeLimitSeconds = 20
                        },
                        new QuizQuestion
                        {
                            Id = "f-q2",
                            Type = QuestionType.MultipleChoice,
                            Text = "Finálová 2",
                            Options = ["X", "Y"],
                            CorrectAnswer = "X",
                            TimeLimitSeconds = 20
                        }
                    ]
                }
            ]
        };

        File.WriteAllText(
            Path.Combine(_tempRoot, "quizzes", "test-quiz", "quiz.json"),
            JsonSerializer.Serialize(sampleQuiz, new JsonSerializerOptions { WriteIndented = true }));
    }

    private (GameEngineService Engine, JwtTokenService Tokens) CreateEngine()
    {
        var opts = Options.Create(new PubQuizOptions
        {
            QuizzesDirectory = Path.Combine(_tempRoot, "quizzes"),
            StateDirectory = Path.Combine(_tempRoot, "state"),
            HostPin = "123456",
            JwtSecret = "unit-test-super-secret-key-at-least-32-chars!"
        });
        var env = new FakeHostEnvironment(_tempRoot);
        var repo = new QuizRepository(opts, env, NullLogger<QuizRepository>.Instance);
        var persistence = new StatePersistenceService(opts, env, NullLogger<StatePersistenceService>.Instance);
        var net = new NetworkInfoService(opts);
        var tokens = new JwtTokenService(opts, env);
        var engine = new GameEngineService(repo, persistence, net, new NoopHubContext(), opts, NullLogger<GameEngineService>.Instance);
        return (engine, tokens);
    }

    [Fact]
    public async Task ConcurrentSubmissions_MaintainStrictMonotonicOrderingAndIdempotency()
    {
        var (engine, _) = CreateEngine();
        using var _d = engine;

        await engine.LoadQuizAsync("test-quiz");

        var teams = new List<TeamState>();
        for (var i = 0; i < 12; i++)
        {
            var (ok, team, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, $"Tým {i + 1}", "owl", "#d97706", null);
            Assert.True(ok);
            await engine.RegisterTeamConnectionAsync(team!.Id, $"conn-{i}");
            teams.Add(team);
        }

        // Default AutoStartTimer=false -> enters QuestionReady first, then host starts countdown
        await engine.StartQuestionAsync(0, 0);
        var readySnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.QuestionReady, readySnap.State);

        // Submissions rejected before countdown starts
        var earlySubmit = await engine.SubmitAnswerAsync(teams[0].Id, new SubmitAnswerRequest("r1-q1", "early", "Praha", null, false));
        Assert.False(earlySubmit.Success);

        await engine.StartCountdownAsync();

        // Role isolation: Player and Screen must NOT see CorrectAnswer or HostNote while QuestionActive
        var playerSnap = await engine.BuildSnapshotAsync(QuizRoles.Player, teams[0].Id);
        var screenSnap = await engine.BuildSnapshotAsync(QuizRoles.Screen);
        var hostSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);

        Assert.Null(playerSnap.CurrentQuestion!.CorrectAnswer);
        Assert.Null(playerSnap.CurrentQuestion.HostNote);
        Assert.Null(screenSnap.CurrentQuestion!.CorrectAnswer);
        Assert.Equal("Praha", hostSnap.CurrentQuestion!.CorrectAnswer);
        Assert.Equal("Tajná poznámka moderátora", hostSnap.CurrentQuestion.HostNote);

        // Fire all 12 submissions concurrently
        var tasks = teams.Select(t => engine.SubmitAnswerAsync(
            t.Id,
            new SubmitAnswerRequest("r1-q1", $"sub-{t.Id}", "Praha", null, false)));
        var results = await Task.WhenAll(tasks);

        Assert.All(results, r => Assert.True(r.Success));
        var sequences = results.Select(r => r.AnswerSequence!.Value).OrderBy(x => x).ToList();
        Assert.Equal(Enumerable.Range(1, 12).ToList(), sequences);

        // Auto-locked once all connected teams answered!
        var lockedSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.QuestionLocked, lockedSnap.State);
    }

    [Fact]
    public async Task PauseEditResumeAndHostOverrideAndPreSelectJoker_WorkEndToEnd()
    {
        var (engine, _) = CreateEngine();
        using var _d = engine;

        await engine.LoadQuizAsync("test-quiz");
        var (_, teamA, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, "Sovy", "owl", "#d97706", null);
        var (_, teamB, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, "Lišky", "fox", "#059669", null);
        await engine.RegisterTeamConnectionAsync(teamA!.Id, "conn-a");
        await engine.RegisterTeamConnectionAsync(teamB!.Id, "conn-b");

        // Question 2 (TextInput) -> Open -> Start Countdown -> Pause -> Edit BasePoints -> Resume
        await engine.StartQuestionAsync(0, 1);
        await engine.StartCountdownAsync();
        Assert.True((await engine.PauseQuestionAsync()).Success);
        Assert.True((await engine.UpdateQuestionParamsAsync(new UpdateQuestionParamsRequest(40, 25, 1500, 300, 5, null, null, null))).Success);
        Assert.True((await engine.ResumeQuestionAsync()).Success);

        // Team A submits partial answer, Team B submits typo-correct answer
        await engine.SubmitAnswerAsync(teamA!.Id, new SubmitAnswerRequest("r1-q2", "s1", "Jarda", null, false));
        await engine.SubmitAnswerAsync(teamB!.Id, new SubmitAnswerRequest("r1-q2", "s2", "Jaroslav Hasek", null, false));

        // Host overrides Team A to HalfPoint before reveal
        Assert.True((await engine.OverrideAnswerEvaluationAsync(new OverrideEvaluationRequest(teamA.Id, AnswerEvaluation.HalfPoint))).Success);
        Assert.True((await engine.RevealAnswerAsync()).Success);

        var revealed = await engine.BuildSnapshotAsync(QuizRoles.Screen);
        Assert.Equal("Jaroslav Hašek", revealed.CurrentQuestion!.CorrectAnswer);
        var scoreA = revealed.Leaderboard.First(x => x.TeamId == teamA.Id).Score;
        var scoreB = revealed.Leaderboard.First(x => x.TeamId == teamB.Id).Score;
        Assert.Equal(750, scoreA); // Half of overridden 1500
        // 40s limit, 25s remaining => 15s elapsed (5s grace, 35s decay window => 25/35 * 300 = 214 bonus)
        Assert.InRange(scoreB, 1710, 1718);

        // Final Round PreSelect Joker: Team A selects f-q1 and misses it -> -1000 penalty!
        await engine.StartRoundIntroAsync(1);
        Assert.True((await engine.PreSelectJokersAsync(teamA.Id, ["f-q1"])).Success);
        await engine.StartQuestionAsync(1, 0);
        await engine.StartCountdownAsync();
        await engine.LockQuestionAsync();
        await engine.RevealAnswerAsync();

        var afterFinalQ1 = await engine.BuildSnapshotAsync(QuizRoles.Host);
        var finalScoreA = afterFinalQ1.Leaderboard.First(x => x.TeamId == teamA.Id).Score;
        Assert.Equal(750 - 1000, finalScoreA); // Base 2000 * -0.5 = -1000 penalty for missed pre-selected Joker!
    }

    [Fact]
    public async Task CrashRecovery_RestoresActiveQuestionAsPausedWithScoresIntact()
    {
        string teamId;
        {
            var (engine1, _) = CreateEngine();
            using var _d1 = engine1;
            await engine1.LoadQuizAsync("test-quiz");
            var (_, team, _) = await engine1.JoinOrReconnectTeamAsync(engine1.JoinCode, "Vlci", "wolf", "#2563eb", null);
            teamId = team!.Id;
            await engine1.AdjustTeamScoreAsync(new ManualScoreAdjustmentRequest(teamId, 500, "Bonus"));
            await engine1.StartQuestionAsync(0, 0, autoStartOverride: true);
        }

        // Simulate restart -> new engine reads active-session.json
        var (engine2, tokens) = CreateEngine();
        using var _d2 = engine2;

        var snap = await engine2.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.QuestionActive, snap.State);
        Assert.True(snap.CurrentQuestion!.IsPaused);
        Assert.Single(snap.Leaderboard);
        Assert.Equal(500, snap.Leaderboard[0].Score);

        // Verify JWT issuance & validation
        Assert.True(tokens.VerifyHostPin("123456"));
        var (jwt, _) = tokens.IssueToken(QuizRoles.Player, teamId, "Vlci");
        var principal = tokens.ValidateToken(jwt);
        Assert.NotNull(principal);
        Assert.Equal(teamId, principal!.FindFirst("teamId")?.Value);
    }

    [Fact]
    public async Task ReloadRaceAndRecoveryCode_NeverDropsTeamOrLosesProgress()
    {
        var (engine, _) = CreateEngine();
        using var _d = engine;

        await engine.LoadQuizAsync("test-quiz");
        var (ok, team, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, "Nezničitelní", "v2:fox:crown:sunglasses:happy:rays", "#b45309", null);
        Assert.True(ok);
        await engine.AdjustTeamScoreAsync(new ManualScoreAdjustmentRequest(team!.Id, 1250, "Progress"));

        // Simulate page reload race: conn-2 opens BEFORE conn-1 finishes disconnecting
        await engine.RegisterTeamConnectionAsync(team.Id, "conn-1");
        await engine.RegisterTeamConnectionAsync(team.Id, "conn-2");
        await engine.UnregisterTeamConnectionAsync(team.Id, "conn-1");

        var afterReload = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.True(afterReload.Leaderboard.Single().IsConnected);

        // Simulate phone battery dying (all sockets drop), then teammate reclaims via same team name OR recovery code
        await engine.UnregisterTeamConnectionAsync(team.Id, "conn-2");
        var offlineSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.False(offlineSnap.Leaderboard.Single().IsConnected);

        var (rejoinOk, rejoined, err) = await engine.RejoinTeamAsync(new RejoinTeamRequest(null, team.RecoveryCode, null, null));
        Assert.True(rejoinOk, err);
        Assert.Equal(team.Id, rejoined!.Id);
        Assert.Equal(1250, rejoined.Score);

        // Also test seamless offline name reclaim
        var (nameReclaimOk, nameReclaimed, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, "Nezničitelní", null, null, null);
        Assert.True(nameReclaimOk);
        Assert.Equal(team.Id, nameReclaimed!.Id);
        Assert.Equal(1250, nameReclaimed.Score);
    }

    [Fact]
    public void QuizRepository_DesignerCrudSaveDuplicateAndDelete()
    {
        var opts = Options.Create(new PubQuizOptions { QuizzesDirectory = Path.Combine(_tempRoot, "quizzes"), StateDirectory = Path.Combine(_tempRoot, "state") });
        var repo = new QuizRepository(opts, new FakeHostEnvironment(_tempRoot), NullLogger<QuizRepository>.Instance);

        var newQuiz = new QuizPackage
        {
            Id = "Můj Nový Kvíz!",
            Title = "Můj Nový Kvíz",
            Settings = new QuizSettings { AutoStartTimer = false, BasePoints = 1000, SpeedBonusMax = 200, GracePeriodSeconds = 5 },
            Rounds =
            [
                new QuizRound
                {
                    RoundNumber = 1,
                    Title = "První kolo",
                    Questions =
                    [
                        new QuizQuestion { Id = "q1", Type = QuestionType.MultipleChoice, Text = "2+2?", Options = ["3", "4"], CorrectAnswer = "4" }
                    ]
                }
            ]
        };

        var (ok, err, saved) = repo.SaveQuiz(newQuiz);
        Assert.True(ok, err);
        Assert.Equal("muj-novy-kviz", saved!.Id);

        var detail = repo.LoadDesignerDetail("muj-novy-kviz");
        Assert.NotNull(detail);
        Assert.Equal("Můj Nový Kvíz", detail!.Quiz.Title);

        var (dupOk, dupErr, dup) = repo.DuplicateQuiz("muj-novy-kviz", "kopie-kvizu", "Kopie");
        Assert.True(dupOk, dupErr);
        Assert.Equal("kopie-kvizu", dup!.Id);

        var (delOk, _) = repo.DeleteQuiz("kopie-kvizu");
        Assert.True(delOk);
        Assert.Null(repo.LoadDesignerDetail("kopie-kvizu"));
    }

    [Fact]
    public async Task LobbyQrAndLeaderboard_ReturnToPreviousScreenAndPreserveTimer()
    {
        var (engine, _) = CreateEngine();
        using var _d = engine;

        await engine.LoadQuizAsync("test-quiz");

        // At quiz start on initial Lobby, returning to previous screen is NOT available
        var initialSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.Lobby, initialSnap.State);
        Assert.False(initialSnap.CanReturnToPreviousScreen);
        Assert.False((await engine.ReturnToPreviousScreenAsync()).Success);

        // Start Question 1 and run countdown -> jump to Lobby QR -> return safely paused with time preserved!
        await engine.StartQuestionAsync(0, 0, autoStartOverride: true);
        Assert.True((await engine.ShowLobbyQrAsync()).Success);
        var qrSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.Lobby, qrSnap.State);
        Assert.True(qrSnap.CanReturnToPreviousScreen);
        Assert.Equal(GameState.QuestionActive, qrSnap.ReturnScreenState);

        // Switch from Lobby QR -> Leaderboard -> original QuestionActive return target MUST be preserved!
        Assert.True((await engine.ShowLeaderboardAsync()).Success);
        var lbSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.Leaderboard, lbSnap.State);
        Assert.True(lbSnap.CanReturnToPreviousScreen);
        Assert.Equal(GameState.QuestionActive, lbSnap.ReturnScreenState);

        // Return to previous screen -> restores QuestionActive in Paused state with remaining seconds intact
        Assert.True((await engine.ReturnToPreviousScreenAsync()).Success);
        var restoredSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.QuestionActive, restoredSnap.State);
        Assert.True(restoredSnap.CurrentQuestion!.IsPaused);
        Assert.True((restoredSnap.CurrentQuestion.PausedRemainingSeconds ?? 0) > 20);
        Assert.False(restoredSnap.CanReturnToPreviousScreen);

        // Unified AdvanceNext from temporary QR (Lobby) advances forward (LockQuestion) just like Leaderboard!
        Assert.True((await engine.ShowLobbyQrAsync()).Success);
        Assert.True((await engine.AdvanceNextAsync()).Success);
        var advancedSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        Assert.Equal(GameState.QuestionLocked, advancedSnap.State);
    }

    [Fact]
    public void LocalTlsCertificateService_GeneratesAndReusesValidLocalLanCertificate()
    {
        var httpsOpts = new HttpsOptions { Enabled = true, Port = 5443 };
        var first = LocalTlsCertificateService.LoadOrCreateCertificate(httpsOpts, _tempRoot, "state");
        using var cert1 = first.Certificate;

        Assert.True(cert1.HasPrivateKey);
        Assert.NotNull(first.CaCertificatePemPath);
        Assert.True(File.Exists(first.CaCertificatePemPath));
        Assert.True(cert1.NotAfter.ToUniversalTime() > DateTime.UtcNow.AddDays(300));
        Assert.True(cert1.NotAfter.ToUniversalTime() <= DateTime.UtcNow.AddDays(398));

        var sanText = cert1.Extensions["2.5.29.17"]?.Format(false) ?? string.Empty;
        Assert.Contains("localhost", sanText, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("127.0.0.1", sanText, StringComparison.Ordinal);

        // Second invocation must reuse the persisted server cert with the same thumbprint
        var second = LocalTlsCertificateService.LoadOrCreateCertificate(httpsOpts, _tempRoot, "state");
        using var cert2 = second.Certificate;
        Assert.Equal(cert1.Thumbprint, cert2.Thumbprint);
    }

    [Fact]
    public async Task SecurityHardening_BlocksHostPoisoningUnsafeMediaSvgXssAndPathTraversal()
    {
        var opts = Options.Create(new PubQuizOptions
        {
            QuizzesDirectory = Path.Combine(_tempRoot, "quizzes"),
            StateDirectory = Path.Combine(_tempRoot, "state"),
            HostPin = "123456",
            JwtSecret = "unit-test-super-secret-key-at-least-32-chars!",
            Https = new HttpsOptions { Enabled = true, Port = 5443 }
        });
        var env = new FakeHostEnvironment(_tempRoot);
        var repo = new QuizRepository(opts, env, NullLogger<QuizRepository>.Instance);
        var net = new NetworkInfoService(opts);
        net.SetBoundEndpoint("https", 5443);

        // 1. Host header poisoning must be ignored in local mode (never advertise evil-phishing.com or downgrade to http)
        var baseUrl = net.GetPublicBaseUrl("http", "evil-phishing.com");
        Assert.StartsWith("https://", baseUrl, StringComparison.Ordinal);
        Assert.DoesNotContain("evil-phishing.com", baseUrl, StringComparison.OrdinalIgnoreCase);

        // 2. Unsafe media URLs blocked
        Assert.False(QuizRepository.IsSafeMediaReference("javascript:alert(1)", "image"));
        Assert.False(QuizRepository.IsSafeMediaReference("data:text/html,<script>alert(1)</script>", "image"));
        Assert.False(QuizRepository.IsSafeMediaReference("file:///etc/passwd", "image"));
        Assert.False(QuizRepository.IsSafeMediaReference("../../state/runtime-secrets.json", "image"));
        Assert.False(QuizRepository.IsSafeMediaReference("//evil.example/a.png", "image"));
        Assert.True(QuizRepository.IsSafeMediaReference("media/sample.png", "image"));
        Assert.True(QuizRepository.IsSafeMediaReference("https://cdn.example.com/photo.jpg", "image"));
        Assert.True(QuizRepository.IsSafeMediaReference("dQw4w9WgXcQ", "youtube"));

        // 3. Path traversal blocked on media lookup
        Assert.Null(repo.ResolveMediaFilePath("test-quiz", "../../state/runtime-secrets.json"));
        Assert.Null(repo.ResolveMediaFilePath("../state", "runtime-secrets.json"));

        // 4. SVG script injection & fake PNG magic-byte mismatch blocked on upload
        var maliciousSvg = CreateFormFile("xss.svg", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
        var (svgOk, _, svgErr) = await repo.SaveMediaFileAsync("test-quiz", maliciousSvg);
        Assert.False(svgOk);
        Assert.NotNull(svgErr);

        var fakePng = CreateFormFile("evil.png", "<html><script>alert(1)</script></html>");
        var (pngOk, _, pngErr) = await repo.SaveMediaFileAsync("test-quiz", fakePng);
        Assert.False(pngOk);
        Assert.NotNull(pngErr);

        // 5. Oversized answer & invalid avatar fields sanitized safely
        var (engine, _) = CreateEngine();
        using var _d = engine;
        await engine.LoadQuizAsync("test-quiz");
        var (joinOk, team, _) = await engine.JoinOrReconnectTeamAsync(
            engine.JoinCode, "Bezpečný Tým", "bad<script>", "red;background:url(evil)", null);
        Assert.True(joinOk);
        Assert.Equal("#b45309", team!.AvatarColor);
        Assert.Equal("v2:owl:none:none:happy:solid", team.AvatarId);
        Assert.Equal(6, engine.JoinCode.Length);
        Assert.Equal(6, engine.ScreenCode.Length);
        Assert.True(team.RecoveryCode.Length >= 6);

        await engine.StartQuestionAsync(0, 1, autoStartOverride: true);
        var hugeAnswer = new string('A', 20_000);
        var submitRes = await engine.SubmitAnswerAsync(team.Id, new SubmitAnswerRequest("r1-q2", "s-huge", hugeAnswer, null, false));
        Assert.True(submitRes.Success);
        var hostSnap = await engine.BuildSnapshotAsync(QuizRoles.Host);
        var savedAns = hostSnap.HostAnswers!.Single(a => a.TeamId == team.Id).AnswerText;
        Assert.True(savedAns!.Length <= 300);
    }

    [Fact]
    public async Task DismissPlayerMessage_PersistsAcrossReloadsAndOnlyHidesForThatTeam()
    {
        string teamAId;
        string teamBId;
        string msgId;

        {
            var (engine1, _) = CreateEngine();
            using var _d1 = engine1;
            await engine1.LoadQuizAsync("test-quiz");
            var (_, teamA, _) = await engine1.JoinOrReconnectTeamAsync(engine1.JoinCode, "Tým A", "owl", "#b45309", null);
            var (_, teamB, _) = await engine1.JoinOrReconnectTeamAsync(engine1.JoinCode, "Tým B", "fox", "#1d4ed8", null);
            teamAId = teamA!.Id;
            teamBId = teamB!.Id;

            Assert.True((await engine1.SendPlayerMessageAsync(new SendPlayerMessageRequest("Krátká zpráva pro všechny", null))).Success);
            var snapA = await engine1.BuildSnapshotAsync(QuizRoles.Player, teamAId);
            Assert.Single(snapA.Messages);
            msgId = snapA.Messages[0].Id;

            Assert.True((await engine1.DismissPlayerMessageAsync(teamAId, msgId)).Success);
            var afterDismissA = await engine1.BuildSnapshotAsync(QuizRoles.Player, teamAId);
            var afterDismissB = await engine1.BuildSnapshotAsync(QuizRoles.Player, teamBId);
            Assert.Empty(afterDismissA.Messages);
            Assert.Single(afterDismissB.Messages);
        }

        // Reload engine from persisted active-session.json -> Team A must STILL not see the dismissed message!
        var (engine2, _) = CreateEngine();
        using var _d2 = engine2;
        var reloadedA = await engine2.BuildSnapshotAsync(QuizRoles.Player, teamAId);
        var reloadedB = await engine2.BuildSnapshotAsync(QuizRoles.Player, teamBId);
        Assert.Empty(reloadedA.Messages);
        Assert.Single(reloadedB.Messages);
        Assert.Equal(msgId, reloadedB.Messages[0].Id);
    }

    [Fact]
    public async Task BonusTasks_ClaimReviewApproveRejectAndMaxLimitWorkEndToEnd()
    {
        string teamId;
        {
            var (engine, _) = CreateEngine();
            using var _d = engine;
            await engine.LoadQuizAsync("test-quiz");
            var (_, team, _) = await engine.JoinOrReconnectTeamAsync(engine.JoinCode, "Pivní borci", "beer", "#b45309", null);
            teamId = team!.Id;

            // 1. Team reports completion -> Pending in host queue, score still 0
            Assert.True((await engine.ClaimBonusTaskAsync(teamId, new ClaimBonusTaskRequest("task-shots", "Stůl 3 – 5× zelená"))).Success);
            var hostPending = await engine.BuildSnapshotAsync(QuizRoles.Host);
            Assert.Single(hostPending.BonusTasks);
            Assert.Single(hostPending.HostTaskClaims!);
            Assert.Equal(BonusTaskClaimStatus.Pending, hostPending.HostTaskClaims![0].Status);
            Assert.Equal(0, hostPending.Leaderboard.Single().Score);

            // 2. Host rejects -> slot is freed, score stays 0
            var firstClaimId = hostPending.HostTaskClaims[0].Id;
            Assert.True((await engine.ReviewBonusTaskClaimAsync(new ReviewBonusTaskClaimRequest(firstClaimId, Approve: false, "Jeden člen chyběl"))).Success);
            var afterReject = await engine.BuildSnapshotAsync(QuizRoles.Player, teamId);
            Assert.Equal(0, afterReject.Self!.Score);
            Assert.Equal(BonusTaskClaimStatus.Rejected, afterReject.Self.TaskClaims[0].Status);

            // 3. Team re-claims twice (maxCompletionsPerTeam = 2) and Host approves both -> +600 points
            Assert.True((await engine.ClaimBonusTaskAsync(teamId, new ClaimBonusTaskRequest("task-shots", "Teď už všichni!"))).Success);
            var c1 = (await engine.BuildSnapshotAsync(QuizRoles.Host)).HostTaskClaims!.First(c => c.Status == BonusTaskClaimStatus.Pending);
            Assert.True((await engine.ReviewBonusTaskClaimAsync(new ReviewBonusTaskClaimRequest(c1.Id, Approve: true, "Na zdraví!"))).Success);

            Assert.True((await engine.ClaimBonusTaskAsync(teamId, new ClaimBonusTaskRequest("task-shots", "Druhá runda"))).Success);
            var c2 = (await engine.BuildSnapshotAsync(QuizRoles.Host)).HostTaskClaims!.First(c => c.Status == BonusTaskClaimStatus.Pending);
            Assert.True((await engine.ReviewBonusTaskClaimAsync(new ReviewBonusTaskClaimRequest(c2.Id, Approve: true, null))).Success);

            var afterTwo = await engine.BuildSnapshotAsync(QuizRoles.Player, teamId);
            Assert.Equal(600, afterTwo.Self!.Score);

            // 4. Third claim MUST be blocked because maxCompletionsPerTeam = 2 is reached
            var third = await engine.ClaimBonusTaskAsync(teamId, new ClaimBonusTaskRequest("task-shots", "Třetí runda"));
            Assert.False(third.Success);
        }

        // 5. Persisted across server restart
        var (engine2, _) = CreateEngine();
        using var _d2 = engine2;
        var reloaded = await engine2.BuildSnapshotAsync(QuizRoles.Player, teamId);
        Assert.Equal(600, reloaded.Self!.Score);
        Assert.Equal(2, reloaded.Self.TaskClaims.Count(c => c.Status == BonusTaskClaimStatus.Approved));
    }

    [Fact]
    public void ScreenAuth_RequiresHostPinOrSingleUseLaunchToken()
    {
        var (_, tokens) = CreateEngine();

        // Host PIN authenticates screen; wrong PIN rejected
        Assert.True(tokens.VerifyHostPin("123456"));
        Assert.False(tokens.VerifyHostPin("000000"));

        // Single-use launch token minted by host works strictly once and cannot be replayed
        var (launchToken, expires) = tokens.CreateScreenLaunchToken(TimeSpan.FromMinutes(5));
        Assert.False(string.IsNullOrWhiteSpace(launchToken));
        Assert.True(expires > DateTimeOffset.UtcNow);
        Assert.True(tokens.ConsumeScreenLaunchToken(launchToken));
        Assert.False(tokens.ConsumeScreenLaunchToken(launchToken)); // replay blocked!

        // Expired launch token is rejected
        var (expiredToken, _) = tokens.CreateScreenLaunchToken(TimeSpan.FromMilliseconds(-1));
        Assert.False(tokens.ConsumeScreenLaunchToken(expiredToken));
    }

    [Fact]
    public async Task JoinCode_RotatesOnLoadQuizAndResetSession_AndPreservesOnLanguageSwitch()
    {
        string codeAfterReset;
        {
            var (engine, _) = CreateEngine();
            using var _d = engine;
            var initialCode = engine.JoinCode;
            Assert.Equal(6, initialCode.Length);

            // 1. Loading a quiz rotates JoinCode immediately and invalidates the old code
            Assert.True((await engine.LoadQuizAsync("test-quiz")).Success);
            var codeAfterLoad = engine.JoinCode;
            Assert.Equal(6, codeAfterLoad.Length);
            Assert.NotEqual(initialCode, codeAfterLoad);

            var (oldJoinOk, _, _) = await engine.JoinOrReconnectTeamAsync(initialCode, "Starý kód", "owl", "#b45309", null);
            Assert.False(oldJoinOk);

            var (newJoinOk, team, _) = await engine.JoinOrReconnectTeamAsync(codeAfterLoad, "Nový tým", "owl", "#b45309", null);
            Assert.True(newJoinOk);
            Assert.NotNull(team);

            var snapAfterLoad = await engine.BuildSnapshotAsync(QuizRoles.Screen);
            Assert.Equal(codeAfterLoad, snapAfterLoad.JoinCode);
            Assert.EndsWith($"/play?join={codeAfterLoad}", snapAfterLoad.JoinUrl);

            // 2. Switching language of the running quiz does NOT rotate JoinCode
            Assert.True((await engine.SetQuizLanguageAsync("cs")).Success);
            Assert.Equal(codeAfterLoad, engine.JoinCode);

            // 3. Resetting the session (default) rotates JoinCode again, clears teams, and invalidates previous code
            Assert.True((await engine.ResetSessionAsync()).Success);
            codeAfterReset = engine.JoinCode;
            Assert.Equal(6, codeAfterReset.Length);
            Assert.NotEqual(codeAfterLoad, codeAfterReset);

            var (staleJoinOk, _, _) = await engine.JoinOrReconnectTeamAsync(codeAfterLoad, "Po resetu starý", "fox", "#1d4ed8", null);
            Assert.False(staleJoinOk);

            var (freshJoinOk, _, _) = await engine.JoinOrReconnectTeamAsync(codeAfterReset, "Po resetu nový", "fox", "#1d4ed8", null);
            Assert.True(freshJoinOk);
            Assert.False(await engine.TeamExistsAsync(team!.Id));
        }

        // 4. New JoinCode persists across server restart
        var (engine2, _) = CreateEngine();
        using var _d2 = engine2;
        Assert.Equal(codeAfterReset, engine2.JoinCode);
    }

    private static Microsoft.AspNetCore.Http.IFormFile CreateFormFile(string fileName, string content)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(content);
        var stream = new MemoryStream(bytes);
        return new Microsoft.AspNetCore.Http.FormFile(stream, 0, bytes.Length, "file", fileName);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { }
    }

    private sealed class FakeHostEnvironment(string root) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "PubQuiz.Tests";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class NoopHubContext : IHubContext<QuizHub>
    {
        public IHubClients Clients { get; } = new NoopHubClients();
        public IGroupManager Groups => throw new NotImplementedException();

        private sealed class NoopHubClients : IHubClients
        {
            private static readonly IClientProxy Proxy = new NoopProxy();
            public IClientProxy All => Proxy;
            public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
            public IClientProxy Client(string connectionId) => Proxy;
            public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
            public IClientProxy Group(string groupName) => Proxy;
            public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
            public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
            public IClientProxy User(string userId) => Proxy;
            public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
        }

        private sealed class NoopProxy : IClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
        }
    }
}
