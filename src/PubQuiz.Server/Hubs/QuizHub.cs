using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PubQuiz.Server.Models;
using PubQuiz.Server.Services;

namespace PubQuiz.Server.Hubs;

[Authorize]
public sealed class QuizHub : Hub
{
    public const string HostsGroup = "role:hosts";
    public const string ScreensGroup = "role:screens";
    public static string TeamGroup(string teamId) => $"team:{teamId}";

    private readonly GameEngineService _engine;

    public QuizHub(GameEngineService engine)
    {
        _engine = engine;
    }

    public override async Task OnConnectedAsync()
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var teamId = Context.User?.FindFirstValue("teamId");

        if (role == QuizRoles.Host)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, HostsGroup);
        }
        else if (role == QuizRoles.Screen)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, ScreensGroup);
        }
        else if (role == QuizRoles.Player && !string.IsNullOrWhiteSpace(teamId))
        {
            var exists = await _engine.RegisterTeamConnectionAsync(teamId, Context.ConnectionId);
            if (!exists)
            {
                await Clients.Caller.SendAsync("SessionTeamMissing");
                await base.OnConnectedAsync();
                return;
            }
            await Groups.AddToGroupAsync(Context.ConnectionId, TeamGroup(teamId));
        }

        var snapshot = await _engine.BuildSnapshotAsync(role, teamId);
        await Clients.Caller.SendAsync("GameStateUpdated", snapshot);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        var teamId = Context.User?.FindFirstValue("teamId");

        if (role == QuizRoles.Player && !string.IsNullOrWhiteSpace(teamId))
        {
            await _engine.UnregisterTeamConnectionAsync(teamId, Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<long> SyncClock(long clientSentMs, int? reportedOneWayLatencyMs = null)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (!string.IsNullOrWhiteSpace(teamId) && reportedOneWayLatencyMs.HasValue)
        {
            await _engine.UpdateTeamLatencyAsync(teamId, reportedOneWayLatencyMs.Value);
        }

        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public async Task<GameStateBroadcastDto> RequestStateSnapshot()
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var teamId = Context.User?.FindFirstValue("teamId");
        return await _engine.BuildSnapshotAsync(role, teamId);
    }

    [Authorize(Roles = QuizRoles.Player)]
    public async Task<SubmitAnswerResult> SubmitAnswer(SubmitAnswerRequest request)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (string.IsNullOrWhiteSpace(teamId))
            return new SubmitAnswerResult(false, "Neplatný token týmu.", null, null, false);

        return await _engine.SubmitAnswerAsync(teamId, request);
    }

    [Authorize(Roles = QuizRoles.Player)]
    public async Task<OperationResult> PreSelectJokers(PreSelectJokersRequest request)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (string.IsNullOrWhiteSpace(teamId))
            return new OperationResult(false, "Neplatný token týmu.");

        return await _engine.PreSelectJokersAsync(teamId, request.QuestionIds);
    }

    [Authorize(Roles = QuizRoles.Player)]
    public async Task<OperationResult> UpdateProfile(UpdateProfileRequest request)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (string.IsNullOrWhiteSpace(teamId))
            return new OperationResult(false, "Neplatný token týmu.");

        return await _engine.UpdateTeamProfileAsync(teamId, request);
    }

    [Authorize(Roles = QuizRoles.Player)]
    public async Task<OperationResult> DismissPlayerMessage(string messageId)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (string.IsNullOrWhiteSpace(teamId))
            return new OperationResult(false, "Neplatný token týmu.");

        return await _engine.DismissPlayerMessageAsync(teamId, messageId);
    }

    [Authorize(Roles = QuizRoles.Player)]
    public async Task<OperationResult> ClaimBonusTask(ClaimBonusTaskRequest request)
    {
        var teamId = Context.User?.FindFirstValue("teamId");
        if (string.IsNullOrWhiteSpace(teamId))
            return new OperationResult(false, "Neplatný token týmu.");

        return await _engine.ClaimBonusTaskAsync(teamId, request);
    }
}
