import type {
  AnswerEvaluation,
  AuthTokenResponse,
  DesignerQuizPackage,
  DesignerTranslation,
  GameStateBroadcast,
  PublicTeamSummary,
  QuizDesignerDetail,
  QuizSummary
} from '../types/quiz';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export const api = {
  // Auth
  loginHost(pin: string) {
    return requestJson<AuthTokenResponse>('/api/auth/host', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });
  },
  logout() {
    return requestJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  pairScreen(payload: { pin?: string; launchToken?: string }) {
    return requestJson<AuthTokenResponse>('/api/auth/screen', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  issueScreenTokenFromHost(hostToken: string) {
    return requestJson<AuthTokenResponse>('/api/host/screen/token', { method: 'POST' }, hostToken);
  },
  createScreenLaunchLink(hostToken: string) {
    return requestJson<{ launchToken: string; launchUrl: string; expiresAtUtc: string }>(
      '/api/host/screen/launch-link',
      { method: 'POST' },
      hostToken
    );
  },
  joinPlayer(payload: {
    joinCode: string;
    teamName: string;
    avatarId: string;
    avatarColor: string;
    existingTeamToken?: string | null;
  }) {
    return requestJson<AuthTokenResponse>('/api/auth/join', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  rejoinTeam(payload: {
    joinCode?: string | null;
    recoveryCode?: string | null;
    teamId?: string | null;
    teamName?: string | null;
  }) {
    return requestJson<AuthTokenResponse>('/api/auth/rejoin', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getTeamsForRejoin(joinCode: string) {
    return requestJson<PublicTeamSummary[]>(
      `/api/auth/teams-for-rejoin?joinCode=${encodeURIComponent(joinCode)}`,
      { method: 'GET' }
    );
  },
  verifyToken(token: string) {
    return requestJson<{
      role: string;
      teamId?: string;
      teamName?: string;
      isValid: boolean;
      teamExists?: boolean;
    }>('/api/auth/me', { method: 'GET' }, token);
  },
  getState(token: string) {
    return requestJson<GameStateBroadcast>('/api/state', { method: 'GET' }, token);
  },

  // Host actions
  listQuizzes(token: string) {
    return requestJson<QuizSummary[]>('/api/host/quizzes', { method: 'GET' }, token);
  },
  loadQuiz(token: string, quizId: string, language?: string) {
    return requestJson('/api/host/quiz/load', {
      method: 'POST',
      body: JSON.stringify({ quizId, language })
    }, token);
  },
  setQuizLanguage(token: string, quizId: string, language: string) {
    return requestJson('/api/host/quiz/language', {
      method: 'POST',
      body: JSON.stringify({ quizId, language })
    }, token);
  },
  startIntro(token: string) {
    return requestJson('/api/host/game/intro', { method: 'POST' }, token);
  },
  startRound(token: string, roundIndex: number) {
    return requestJson(`/api/host/game/round/${roundIndex}`, { method: 'POST' }, token);
  },
  startQuestion(token: string, roundIndex?: number, questionIndex?: number, autoStart?: boolean) {
    const params = new URLSearchParams();
    if (roundIndex !== undefined) params.set('roundIndex', String(roundIndex));
    if (questionIndex !== undefined) params.set('questionIndex', String(questionIndex));
    if (autoStart !== undefined) params.set('autoStart', String(autoStart));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return requestJson(`/api/host/game/question${qs}`, { method: 'POST' }, token);
  },
  startCountdown(token: string) {
    return requestJson('/api/host/game/start-countdown', { method: 'POST' }, token);
  },
  updateSessionSettings(token: string, autoStartTimer: boolean) {
    return requestJson(
      '/api/host/settings',
      {
        method: 'PATCH',
        body: JSON.stringify({ autoStartTimer })
      },
      token
    );
  },
  pauseQuestion(token: string) {
    return requestJson('/api/host/game/pause', { method: 'POST' }, token);
  },
  resumeQuestion(token: string) {
    return requestJson('/api/host/game/resume', { method: 'POST' }, token);
  },
  updateQuestionParams(
    token: string,
    params: {
      timeLimitSeconds?: number;
      remainingSeconds?: number;
      basePoints?: number;
      speedBonusMax?: number;
      gracePeriodSeconds?: number;
      text?: string;
      acceptedAnswers?: string[];
      hostNote?: string;
    }
  ) {
    return requestJson('/api/host/game/question-params', {
      method: 'PATCH',
      body: JSON.stringify(params)
    }, token);
  },
  lockQuestion(token: string) {
    return requestJson('/api/host/game/lock', { method: 'POST' }, token);
  },
  revealAnswer(token: string) {
    return requestJson('/api/host/game/reveal', { method: 'POST' }, token);
  },
  showLobbyQr(token: string) {
    return requestJson('/api/host/game/lobby', { method: 'POST' }, token);
  },
  showLeaderboard(token: string) {
    return requestJson('/api/host/game/leaderboard', { method: 'POST' }, token);
  },
  returnToPreviousScreen(token: string) {
    return requestJson('/api/host/game/return', { method: 'POST' }, token);
  },
  finishGame(token: string) {
    return requestJson('/api/host/game/finish', { method: 'POST' }, token);
  },
  advanceNext(token: string) {
    return requestJson('/api/host/game/next', { method: 'POST' }, token);
  },
  resetSession(token: string, resetCodes = true) {
    return requestJson(`/api/host/game/reset?resetCodes=${resetCodes}`, { method: 'POST' }, token);
  },
  overrideEvaluation(token: string, teamId: string, evaluation: AnswerEvaluation) {
    return requestJson('/api/host/answers/override', {
      method: 'POST',
      body: JSON.stringify({ teamId, evaluation })
    }, token);
  },
  adjustTeamScore(token: string, teamId: string, delta: number, reason: string) {
    return requestJson('/api/host/teams/adjust-score', {
      method: 'POST',
      body: JSON.stringify({ teamId, delta, reason })
    }, token);
  },
  removeTeam(token: string, teamId: string) {
    return requestJson(`/api/host/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' }, token);
  },
  sendScreenBanner(token: string, text: string, kind: 'info' | 'hint' | 'warning' = 'info') {
    return requestJson('/api/host/screen/banner', {
      method: 'POST',
      body: JSON.stringify({ text, kind })
    }, token);
  },
  clearScreenBanner(token: string) {
    return requestJson('/api/host/screen/banner', { method: 'DELETE' }, token);
  },
  sendPlayerMessage(token: string, text: string, targetTeamId?: string | null) {
    return requestJson('/api/host/players/message', {
      method: 'POST',
      body: JSON.stringify({ text, targetTeamId: targetTeamId || null })
    }, token);
  },
  reviewBonusTaskClaim(token: string, claimId: string, approve: boolean, hostComment?: string | null) {
    return requestJson('/api/host/tasks/review', {
      method: 'POST',
      body: JSON.stringify({ claimId, approve, hostComment: hostComment || null })
    }, token);
  },
  awardBonusTaskDirectly(token: string, teamId: string, taskId: string, hostComment?: string | null) {
    return requestJson('/api/host/tasks/award', {
      method: 'POST',
      body: JSON.stringify({ teamId, taskId, hostComment: hostComment || null })
    }, token);
  },

  // Quiz Designer CRUD & Media Upload
  designer: {
    listQuizzes(token: string) {
      return requestJson<QuizSummary[]>('/api/host/designer/quizzes', { method: 'GET' }, token);
    },
    getQuizDetail(token: string, quizId: string) {
      return requestJson<QuizDesignerDetail>(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}`,
        { method: 'GET' },
        token
      );
    },
    createQuiz(token: string, quiz: DesignerQuizPackage) {
      return requestJson<QuizDesignerDetail>(
        '/api/host/designer/quizzes',
        { method: 'POST', body: JSON.stringify(quiz) },
        token
      );
    },
    saveQuiz(token: string, quizId: string, quiz: DesignerQuizPackage) {
      return requestJson<QuizDesignerDetail>(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}`,
        { method: 'PUT', body: JSON.stringify(quiz) },
        token
      );
    },
    deleteQuiz(token: string, quizId: string) {
      return requestJson(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}`,
        { method: 'DELETE' },
        token
      );
    },
    duplicateQuiz(token: string, sourceId: string, newId: string, newTitle: string) {
      return requestJson<QuizDesignerDetail>(
        `/api/host/designer/quizzes/${encodeURIComponent(sourceId)}/duplicate`,
        { method: 'POST', body: JSON.stringify({ newId, newTitle }) },
        token
      );
    },
    async uploadMedia(token: string, quizId: string, file: File): Promise<{ src: string; mediaFiles: string[] }> {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/host/designer/quizzes/${encodeURIComponent(quizId)}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data?.error ?? `HTTP ${res.status}`, res.status);
      return data;
    },
    deleteMedia(token: string, quizId: string, fileName: string) {
      return requestJson<{ mediaFiles: string[] }>(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}/media/${encodeURIComponent(fileName)}`,
        { method: 'DELETE' },
        token
      );
    },
    saveTranslation(token: string, quizId: string, lang: string, translation: DesignerTranslation) {
      return requestJson(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}/translations/${encodeURIComponent(lang)}`,
        { method: 'PUT', body: JSON.stringify(translation) },
        token
      );
    },
    deleteTranslation(token: string, quizId: string, lang: string) {
      return requestJson(
        `/api/host/designer/quizzes/${encodeURIComponent(quizId)}/translations/${encodeURIComponent(lang)}`,
        { method: 'DELETE' },
        token
      );
    }
  }
};

export function withMediaToken(url: string, token: string): string {
  if (!url || !url.startsWith('/api/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
