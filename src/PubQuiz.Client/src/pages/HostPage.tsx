import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FolderOpen,
  Gift,
  HelpCircle,
  KeyRound,
  Keyboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Pause,
  PencilRuler,
  Play,
  PlusCircle,
  QrCode,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  Wifi,
  WifiOff,
  X,
  XCircle
} from 'lucide-react';
import { api } from '../services/api';
import { createQuizSignalRClient, type ConnectionStatus } from '../services/signalr';
import type { AnswerEvaluation, GameStateBroadcast, HostTeamInfo, QuizSummary } from '../types/quiz';
import { useI18n, formatTemplate } from '../i18n/I18nContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ModalDialog } from '../components/ModalDialog';
import { CountdownBar } from '../components/CountdownBar';
import { MediaPlayer } from '../components/MediaPlayer';
import { LeaderboardView } from '../components/LeaderboardView';
import { TeamAvatar } from '../components/TeamAvatar';
import { QrCodeDisplay } from '../components/QrCodeDisplay';

const HOST_TOKEN_KEY = 'pubquiz-host-token';

export function HostPage() {
  const { t, lang } = useI18n();
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HOST_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [gameState, setGameState] = useState<GameStateBroadcast | null>(null);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedQuizLang, setSelectedQuizLang] = useState('cs');
  const [confirmLoadOverwrite, setConfirmLoadOverwrite] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals
  const [loadQuizOpen, setLoadQuizOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [screenMsgOpen, setScreenMsgOpen] = useState(false);
  const [playerMsgOpen, setPlayerMsgOpen] = useState(false);
  const [scoreModalTeam, setScoreModalTeam] = useState<{ id: string; name: string } | null>(null);
  const [reconnectTeam, setReconnectTeam] = useState<HostTeamInfo | null>(null);
  const [directAwardOpen, setDirectAwardOpen] = useState(false);
  const [directAwardTeamId, setDirectAwardTeamId] = useState('');
  const [directAwardTaskId, setDirectAwardTaskId] = useState('');
  const [directAwardComment, setDirectAwardComment] = useState('');
  const [taskComments, setTaskComments] = useState<Record<string, string>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [removeTeamTarget, setRemoveTeamTarget] = useState<{
    teamId: string;
    name: string;
    avatarId: string;
    avatarColor: string;
    score: number;
  } | null>(null);
  const [removingTeam, setRemovingTeam] = useState(false);

  // Modal form states
  const [editTimeLimit, setEditTimeLimit] = useState(30);
  const [editRemaining, setEditRemaining] = useState(20);
  const [editBasePoints, setEditBasePoints] = useState(1000);
  const [editSpeedBonus, setEditSpeedBonus] = useState(200);
  const [editGrace, setEditGrace] = useState(5);
  const [editText, setEditText] = useState('');
  const [editAccepted, setEditAccepted] = useState('');
  const [editHostNote, setEditHostNote] = useState('');

  const [bannerText, setBannerText] = useState('');
  const [bannerKind, setBannerKind] = useState<'info' | 'hint' | 'warning'>('info');

  const [playerMsgText, setPlayerMsgText] = useState('');
  const [playerMsgTarget, setPlayerMsgTarget] = useState<string>('');

  const [scoreDelta, setScoreDelta] = useState<number>(250);
  const [scoreReason, setScoreReason] = useState('');
  const [scoreDeltaError, setScoreDeltaError] = useState<string | null>(null);
  const [scoreReasonError, setScoreReasonError] = useState<string | null>(null);
  const [scoreSubmitError, setScoreSubmitError] = useState<string | null>(null);
  const [submittingScore, setSubmittingScore] = useState(false);
  const scoreDeltaInputRef = useRef<HTMLInputElement>(null);
  const scoreReasonInputRef = useRef<HTMLInputElement>(null);
  const roundsNavContainerRef = useRef<HTMLDivElement>(null);
  const roundsNavDidInitRef = useRef(false);

  const activeQuizId = gameState?.quizId ?? null;
  const activeRoundIdx = gameState?.currentRoundIndex ?? -1;
  const activeQuestionIdx = gameState?.currentQuestionIndex ?? -1;
  const isAtQuizStart = gameState?.state === 'Lobby' || gameState?.state === 'QuizIntro';

  useEffect(() => {
    document.title = `${t.host.title} | PepQuiz Engine`;
  }, [t]);

  // Auto-scroll ONLY the Rounds Navigator scroll container (never the outer page)
  // when the active round/question changes or when returning to Lobby/Intro.
  useEffect(() => {
    const container = roundsNavContainerRef.current;
    if (!container || !activeQuizId) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const isInitial = !roundsNavDidInitRef.current;
    roundsNavDidInitRef.current = true;
    const behavior: ScrollBehavior = isInitial || prefersReducedMotion ? 'instant' : 'smooth';

    if (activeRoundIdx < 0 || isAtQuizStart) {
      if (container.scrollTop > 0) {
        container.scrollTo({ top: 0, behavior });
      }
      return;
    }

    const activeRoundEl = container.querySelector<HTMLElement>(
      `[data-round-index="${activeRoundIdx}"]`
    );
    if (!activeRoundEl) return;

    const activeQuestionEl =
      activeQuestionIdx >= 0
        ? activeRoundEl.querySelector<HTMLElement>(`[data-question-index="${activeQuestionIdx}"]`)
        : null;

    const containerRect = container.getBoundingClientRect();
    const roundRect = activeRoundEl.getBoundingClientRect();
    const pad = 12;

    // Keep the entire active round card in view; if a single round is taller than the scrollport,
    // target the active question button instead so it never scrolls out of sight.
    const focusEl =
      activeQuestionEl && roundRect.height > container.clientHeight - pad * 2
        ? activeQuestionEl
        : activeRoundEl;
    const focusRect = focusEl.getBoundingClientRect();

    const focusTop = focusRect.top - containerRect.top + container.scrollTop;
    const focusBottom = focusTop + focusRect.height;
    const visibleTop = container.scrollTop + pad;
    const visibleBottom = container.scrollTop + container.clientHeight - pad;

    if (focusTop >= visibleTop && focusBottom <= visibleBottom) {
      return;
    }

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const desiredTop =
      focusRect.height >= container.clientHeight - pad * 2
        ? Math.min(maxScroll, Math.max(0, focusTop - pad))
        : Math.min(maxScroll, Math.max(0, focusTop - (container.clientHeight - focusRect.height) / 2));

    container.scrollTo({ top: desiredTop, behavior });
  }, [activeQuizId, activeRoundIdx, activeQuestionIdx, isAtQuizStart]);

  // Connect SignalR & load quizzes list once authenticated
  useEffect(() => {
    if (!token) return;
    let active = true;

    api
      .listQuizzes(token)
      .then((list) => {
        if (!active) return;
        setQuizzes(list);
        if (list.length > 0) setSelectedQuizId((prev) => prev || list[0].id);
      })
      .catch(() => {});

    const client = createQuizSignalRClient(token, {
      onState: (snap) => {
        if (!active) return;
        setGameState(snap);
      },
      onStatus: (st) => {
        if (active) setConnStatus(st);
      },
      onClockSync: (offset) => {
        if (active) setClockOffsetMs(offset);
      },
      onAuthError: () => {
        if (active) {
          setToken(null);
          try {
            localStorage.removeItem(HOST_TOKEN_KEY);
          } catch {}
        }
      }
    });

    client.start().catch(() => {
      api.verifyToken(token).catch(() => {
        if (active) {
          setToken(null);
          try {
            localStorage.removeItem(HOST_TOKEN_KEY);
          } catch {}
        }
      });
    });

    return () => {
      active = false;
      client.stop();
    };
  }, [token]);

  const runAction = useCallback(async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Akce se nezdařila.');
    }
  }, []);

  const openEditQuestionModal = useCallback(async () => {
    if (!token || !gameState?.currentQuestion) return;
    const q = gameState.currentQuestion;
    // Automatically pause if currently active and running
    if (gameState.state === 'QuestionActive' && !q.isPaused) {
      await runAction(() => api.pauseQuestion(token));
    }
    setEditTimeLimit(Math.round(q.timeLimitSeconds));
    const rem = q.pausedRemainingSeconds
      ? Math.ceil(q.pausedRemainingSeconds)
      : q.endsAtUtc
        ? Math.max(1, Math.ceil((Date.parse(q.endsAtUtc) - (Date.now() + clockOffsetMs)) / 1000))
        : Math.round(q.timeLimitSeconds);
    setEditRemaining(rem);
    setEditBasePoints(q.basePoints);
    setEditSpeedBonus(q.speedBonusMax);
    setEditGrace(q.gracePeriodSeconds);
    setEditText(q.text);
    setEditAccepted((q.acceptedAnswers ?? []).join('\n'));
    setEditHostNote(q.hostNote ?? '');
    setEditOpen(true);
  }, [token, gameState, clockOffsetMs, runAction]);

  // WCAG Keyboard shortcuts for fast live hosting
  useEffect(() => {
    if (!token || !gameState) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (loadQuizOpen || editOpen || screenMsgOpen || playerMsgOpen || scoreModalTeam || reconnectTeam || directAwardOpen || resetOpen || removeTeamTarget || shortcutsOpen) {
        return;
      }

      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        runAction(() => api.advanceNext(token));
      } else if (e.key.toLowerCase() === 'p' && gameState.state === 'QuestionActive') {
        e.preventDefault();
        if (gameState.currentQuestion?.isPaused) {
          runAction(() => api.resumeQuestion(token));
        } else {
          runAction(() => api.pauseQuestion(token));
        }
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (gameState.state === 'Leaderboard' && gameState.canReturnToPreviousScreen) {
          runAction(() => api.returnToPreviousScreen(token));
        } else {
          runAction(() => api.showLeaderboard(token));
        }
      } else if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        if (gameState.state === 'Lobby' && gameState.canReturnToPreviousScreen) {
          runAction(() => api.returnToPreviousScreen(token));
        } else {
          runAction(() => api.showLobbyQr(token));
        }
      } else if ((e.key.toLowerCase() === 'b' || e.key === 'Backspace') && gameState.canReturnToPreviousScreen) {
        e.preventDefault();
        runAction(() => api.returnToPreviousScreen(token));
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setScreenMsgOpen(true);
      } else if (e.key.toLowerCase() === 'e' && gameState.currentQuestion) {
        e.preventDefault();
        openEditQuestionModal();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    token,
    gameState,
    loadQuizOpen,
    editOpen,
    screenMsgOpen,
    playerMsgOpen,
    scoreModalTeam,
    reconnectTeam,
    directAwardOpen,
    resetOpen,
    removeTeamTarget,
    shortcutsOpen,
    runAction,
    openEditQuestionModal
  ]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await api.loginHost(pin.trim());
      setToken(res.token);
      try {
        localStorage.setItem(HOST_TOKEN_KEY, res.token);
      } catch {}
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Nesprávný PIN.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    void api.logout().catch(() => {});
    setToken(null);
    setGameState(null);
    try {
      localStorage.removeItem(HOST_TOKEN_KEY);
    } catch {}
  };

  const openLoadQuizModal = useCallback(() => {
    if (!token) return;
    setConfirmLoadOverwrite(false);
    const currentId = gameState?.quizId ?? quizzes[0]?.id ?? '';
    const currentMeta = quizzes.find((qz) => qz.id === currentId);
    setSelectedQuizId(currentId);
    setSelectedQuizLang(gameState?.quizLanguage ?? currentMeta?.defaultLanguage ?? 'cs');
    api
      .listQuizzes(token)
      .then((list) => {
        setQuizzes(list);
        if (!currentId && list.length > 0) {
          setSelectedQuizId(list[0].id);
          setSelectedQuizLang(list[0].defaultLanguage);
        }
      })
      .catch(() => {});
    setLoadQuizOpen(true);
  }, [token, gameState?.quizId, gameState?.quizLanguage, quizzes]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    });
  };

  const getPrimaryNextLabel = (gs: GameStateBroadcast): string => {
    const effectiveState =
      (gs.state === 'Lobby' || gs.state === 'Leaderboard') &&
      gs.canReturnToPreviousScreen &&
      gs.returnScreenState
        ? gs.returnScreenState
        : gs.state;

    switch (effectiveState) {
      case 'Lobby':
        return t.host.startIntro;
      case 'QuizIntro':
        return t.host.startFirstRound;
      case 'RoundIntro':
        return t.host.startQuestion;
      case 'QuestionReady':
        return t.host.startCountdown;
      case 'QuestionActive':
        return t.host.lockQuestion;
      case 'QuestionLocked':
        return t.host.revealAnswer;
      case 'QuestionReveal': {
        const curRound = gs.currentRound;
        if (curRound && gs.currentQuestionIndex + 1 < curRound.questionCount) {
          return t.host.nextQuestion;
        }
        if (gs.state === 'Leaderboard') {
          return gs.currentRoundIndex + 1 < gs.rounds.length ? t.host.nextRound : t.host.finishQuiz;
        }
        return t.host.showLeaderboard;
      }
      case 'Leaderboard': {
        const curRound = gs.currentRound;
        if (curRound && gs.currentQuestionIndex >= 0 && gs.currentQuestionIndex + 1 < curRound.questionCount) {
          return t.host.nextQuestion;
        }
        return gs.currentRoundIndex + 1 < gs.rounds.length ? t.host.nextRound : t.host.finishQuiz;
      }
      case 'Finished':
        return t.states.Finished;
    }
  };

  // --- HOST PIN LOGIN ---
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="surface-card p-8 max-w-md w-full space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black m-0">{t.auth.hostTitle}</h1>
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)] m-0">{t.auth.hostHint}</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="host-pin" className="font-bold text-sm">
                {t.auth.hostPinLabel}
              </label>
              <input
                id="host-pin"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                className="text-center font-mono text-2xl tracking-widest"
              />
            </div>
            {loginError && (
              <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-bold flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{loginError}</span>
              </div>
            )}
            <button type="submit" disabled={loggingIn} className="btn-primary w-full text-lg">
              {t.auth.hostSubmit}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-xl font-bold">{t.app.connecting}</div>
      </main>
    );
  }

  const q = gameState.currentQuestion;
  const isQuizRunning =
    Boolean(gameState.quizId) &&
    (gameState.state !== 'Lobby' ||
      gameState.currentRoundIndex >= 0 ||
      gameState.canReturnToPreviousScreen ||
      gameState.leaderboard.some((team) => team.score !== 0));
  const chosenQuizMeta = quizzes.find((qz) => qz.id === selectedQuizId) ?? null;
  const chosenQuizLangs = chosenQuizMeta?.availableLanguages?.length
    ? chosenQuizMeta.availableLanguages
    : [chosenQuizMeta?.defaultLanguage ?? 'cs'];

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#host-main" className="skip-link visually-hidden">
        {t.app.skipToContent}
      </a>

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2">
        <div className="host-topbar max-w-[1440px] mx-auto">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black m-0 truncate min-w-0">
              {t.host.title}
            </h1>
            <span className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-extrabold bg-[var(--accent-soft)] text-[var(--accent)]">
              {t.states[gameState.state]}
            </span>
            {gameState.quizTitle && (
              <span
                title={`${gameState.quizTitle} (${gameState.quizLanguage.toUpperCase()})`}
                className="hidden 2xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--bg-elevated)] text-[var(--text-secondary)] min-w-0 max-w-[210px] shrink"
              >
                <span className="truncate">{gameState.quizTitle}</span>
                <span className="shrink-0 uppercase text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] font-black">
                  {gameState.quizLanguage}
                </span>
              </span>
            )}
            <span
              title={connStatus === 'connected' ? t.app.connected : t.app.reconnecting}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                connStatus === 'connected'
                  ? 'bg-[var(--success-soft)] text-[var(--success)]'
                  : 'bg-[var(--warning-soft)] text-[var(--warning)]'
              }`}
            >
              {connStatus === 'connected' ? (
                <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className={connStatus === 'connected' ? 'hidden xl:inline' : ''}>
                {connStatus === 'connected' ? t.app.connected : t.app.reconnecting}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap lg:flex-nowrap">
            <button
              type="button"
              onClick={openLoadQuizModal}
              className="btn-secondary !py-1.5 !px-2.5 !min-h-[40px] text-xs sm:text-sm whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <span>{t.host.loadQuiz}</span>
            </button>
            <Link
              to="/host/designer"
              className="btn-primary !py-1.5 !px-2.5 !min-h-[40px] text-xs sm:text-sm whitespace-nowrap shrink-0 no-underline"
            >
              <PencilRuler className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.host.designerBtn}</span>
            </Link>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label={t.host.shortcutsBtn}
              title={t.host.shortcutsBtn}
              className="btn-secondary !py-1.5 !px-2.5 !min-h-[40px] text-xs sm:text-sm whitespace-nowrap shrink-0"
            >
              <Keyboard className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">{t.host.shortcutsBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              aria-label={t.host.resetBtn}
              title={t.host.resetBtn}
              className="btn-secondary !py-1.5 !px-2.5 !min-h-[40px] text-xs sm:text-sm text-[var(--danger)] whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">{t.host.resetBtn}</span>
            </button>
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t.auth.logout}
              title={t.auth.logout}
              className="btn-secondary !p-2 !min-h-[40px] !min-w-[40px] shrink-0"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Control Bar */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5">
        <div className="host-controlbar-shell max-w-[1440px] mx-auto">
          <div className="host-controlbar">
            <div role="group" aria-label={t.host.nextAction} className="host-controlbar-group">
            <button
              type="button"
              disabled={gameState.state === 'Finished' || !gameState.quizId}
              onClick={() => runAction(() => api.advanceNext(token))}
              className="btn-primary text-sm sm:text-base !px-4 !py-2 !min-h-[42px] sm:min-w-[195px] whitespace-nowrap shrink-0"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" aria-hidden="true" />
              <span>{getPrimaryNextLabel(gameState)}</span>
              <kbd className="hidden sm:inline-block text-xs px-1.5 py-0.5 rounded bg-black/20 font-mono">
                Space
              </kbd>
            </button>

            {gameState.canReturnToPreviousScreen && (
              <button
                type="button"
                onClick={() => runAction(() => api.returnToPreviousScreen(token))}
                title={`${t.host.returnPrevious}${gameState.returnScreenState ? `: ${t.states[gameState.returnScreenState]}` : ''}`}
                aria-label={`${t.host.returnPrevious}${gameState.returnScreenState ? `: ${t.states[gameState.returnScreenState]}` : ''}`}
                className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm !border-[var(--info)] !bg-[var(--info-soft)] text-[var(--info)] font-extrabold whitespace-nowrap shrink-0"
              >
                <Undo2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t.host.returnPreviousShort}</span>
                <kbd className="hidden sm:inline-block text-xs px-1.5 py-0.5 rounded bg-black/15 font-mono">
                  B
                </kbd>
              </button>
            )}

            {gameState.state === 'QuestionActive' && q && (
              <button
                type="button"
                onClick={() =>
                  runAction(() => (q.isPaused ? api.resumeQuestion(token) : api.pauseQuestion(token)))
                }
                className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
              >
                {q.isPaused ? (
                  <>
                    <Play className="w-4 h-4 text-[var(--success)] shrink-0" aria-hidden="true" />
                    <span>{t.host.resume}</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 text-[var(--warning)] shrink-0" aria-hidden="true" />
                    <span>{t.host.pause}</span>
                  </>
                )}
                <kbd className="hidden xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-black/10 font-mono">
                  P
                </kbd>
              </button>
            )}

            {q && (
              <button
                type="button"
                onClick={openEditQuestionModal}
                title={t.host.editQuestion}
                aria-label={t.host.editQuestion}
                className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
              >
                <Edit3 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t.host.editQuestionShort}</span>
                <kbd className="hidden xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-black/10 font-mono">
                  E
                </kbd>
              </button>
            )}

            <span role="separator" aria-orientation="vertical" className="host-controlbar-sep hidden sm:block" />

            <button
              type="button"
              onClick={() =>
                runAction(() =>
                  gameState.state === 'Lobby' && gameState.canReturnToPreviousScreen
                    ? api.returnToPreviousScreen(token)
                    : api.showLobbyQr(token)
                )
              }
              aria-pressed={gameState.state === 'Lobby'}
              title={t.host.showLobbyQr}
              className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <span>{t.host.showLobbyQrShort}</span>
              <kbd className="hidden xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-black/10 font-mono">
                Q
              </kbd>
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(() =>
                  gameState.state === 'Leaderboard' && gameState.canReturnToPreviousScreen
                    ? api.returnToPreviousScreen(token)
                    : api.showLeaderboard(token)
                )
              }
              aria-pressed={gameState.state === 'Leaderboard'}
              title={t.host.showLeaderboard}
              className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
            >
              <Trophy className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <span>{t.host.showLeaderboard}</span>
              <kbd className="hidden xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-black/10 font-mono">
                L
              </kbd>
            </button>
          </div>

          <div role="group" aria-label={t.host.screenMessageBtn} className="host-controlbar-group">
            <label
              title={t.host.autoStartLabel}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer select-none whitespace-nowrap shrink-0"
            >
              <input
                type="checkbox"
                checked={gameState.autoStartTimer}
                onChange={(e) => runAction(() => api.updateSessionSettings(token, e.target.checked))}
                className="w-4 h-4 shrink-0"
              />
              <span>{t.host.autoStartShort}</span>
            </label>
            <button
              type="button"
              onClick={() => setScreenMsgOpen(true)}
              title={t.host.screenMessageBtn}
              aria-label={t.host.screenMessageBtn}
              className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
            >
              <Megaphone className="w-4 h-4 text-[var(--info)] shrink-0" aria-hidden="true" />
              <span>{t.host.screenMessageShort}</span>
              <kbd className="hidden 2xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-black/10 font-mono">
                M
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setPlayerMsgOpen(true)}
              title={t.host.playerMessageBtn}
              aria-label={t.host.playerMessageBtn}
              className="btn-secondary !py-2 !px-3 !min-h-[42px] text-sm whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-4 h-4 text-[var(--success)] shrink-0" aria-hidden="true" />
              <span>{t.host.playerMessageShort}</span>
            </button>
          </div>
          </div>
        </div>

        {/* Active Screen Banner preview with 1-click dismiss */}
        {gameState.screenBanner && (
          <div className="max-w-[1440px] mx-auto mt-2.5 p-2.5 px-4 rounded-xl bg-[var(--info-soft)] border border-[var(--info)] flex items-center justify-between gap-3 text-sm font-bold">
            <span>
              📺 Na projektoru: „{gameState.screenBanner.text}“
            </span>
            <button
              type="button"
              onClick={() => runAction(() => api.clearScreenBanner(token))}
              className="btn-secondary !py-1 !px-2.5 !min-h-[32px] text-xs"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              {t.host.screenMsgClear}
            </button>
          </div>
        )}

        {actionError && (
          <div role="alert" className="max-w-[1440px] mx-auto mt-2.5 p-2.5 px-4 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-bold flex items-center justify-between">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} aria-label={t.app.close} className="cursor-pointer bg-transparent border-0 text-inherit font-bold">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Workspace */}
      <main id="host-main" tabIndex={-1} className="flex-1 max-w-[1440px] w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT / MAIN PANEL */}
        <div className="lg:col-span-8 space-y-5">
          {/* Lobby / Pairing Panel (clean read-only active quiz header; loading/switching moved safely to top modal) */}
          {gameState.state === 'Lobby' && (
            <section className="surface-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                    Aktuálně načtený kvíz
                  </div>
                  <div className="text-lg sm:text-xl font-black flex items-center gap-2 flex-wrap">
                    <span>{gameState.quizTitle ?? 'Není načten žádný kvíz'}</span>
                    {gameState.quizId && (
                      <span className="text-xs font-black uppercase px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                        {gameState.quizLanguage}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openLoadQuizModal}
                  className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-xs"
                >
                  <FolderOpen className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                  <span>Změnit balíček / jazyk</span>
                </button>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                {gameState.canReturnToPreviousScreen && (
                  <div className="p-3 rounded-xl bg-[var(--info-soft)] border border-[var(--info)] flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[var(--info)]">
                    <span>📺 Na projektoru je dočasně zobrazena úvodní obrazovka s QR kódem.</span>
                    <button
                      type="button"
                      onClick={() => runAction(() => api.returnToPreviousScreen(token))}
                      className="btn-primary !py-1.5 !px-3 !min-h-[36px] text-xs"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {t.host.returnPrevious}
                        {gameState.returnScreenState ? `: ${t.states[gameState.returnScreenState]}` : ''}
                      </span>
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="elevated-card p-4 space-y-2.5">
                    <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                      Projektor (/screen)
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] m-0 leading-snug">
                      Chráněno stejným PINem jako moderátor. Odtud projektor otevřete bez zadávání PINu (nebo zkopírujte jednorázový 5min odkaz pro jiný počítač/TV).
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href="/screen"
                        target="_blank"
                        rel="noopener"
                        className="btn-primary !py-2 !px-3 !min-h-[40px] text-sm no-underline"
                      >
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                        {t.host.openScreenLink}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            const res = await api.createScreenLaunchLink(token);
                            copyToClipboard(res.launchUrl, 'screen');
                          })
                        }
                        className="btn-secondary !py-2 !px-3 !min-h-[40px] text-sm"
                      >
                        <Copy className="w-4 h-4" aria-hidden="true" />
                        {copiedKey === 'screen' ? 'Jednorázový odkaz zkopírován!' : 'Jednorázový odkaz (5 min)'}
                      </button>
                    </div>
                  </div>

                  <div className="elevated-card p-4 flex items-center justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                        Hráči (/play)
                      </div>
                      <div className="font-mono font-black text-xl tracking-widest">
                        {gameState.joinCode}
                      </div>
                      <div className="text-xs font-mono text-[var(--text-secondary)] break-all">
                        {gameState.joinUrl}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(gameState.joinUrl, 'play')}
                        className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        {copiedKey === 'play' ? t.host.copied : t.host.copyLink}
                      </button>
                    </div>
                    <div className="shrink-0 hidden sm:block">
                      <QrCodeDisplay value={gameState.joinUrl} size={96} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Quiz Intro (Rules) Preview for Host */}
          {gameState.state === 'QuizIntro' && (
            <section className="surface-card p-6 space-y-5 border-2 border-[var(--accent)]/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-xs uppercase tracking-wider">
                  📺 Právě na projektoru: {t.states.QuizIntro}
                </span>
                <button
                  type="button"
                  onClick={() => runAction(() => api.startRound(token, 0))}
                  className="btn-primary !py-2 !px-4 text-sm"
                >
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                  {t.host.startFirstRound}
                </button>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-black m-0">{gameState.quizTitle}</h2>
                {gameState.quizDescription && (
                  <p className="text-base text-[var(--text-secondary)] m-0">{gameState.quizDescription}</p>
                )}
              </div>

              <div className="elevated-card p-5 space-y-3">
                <h3 className="text-base font-extrabold text-[var(--accent)] m-0">
                  {t.screen.rulesHeading}
                </h3>
                <ol className="space-y-2.5 text-base font-medium pl-6 m-0">
                  {gameState.quizRules.map((rule, idx) => (
                    <li key={idx} className="leading-snug">
                      {rule}
                    </li>
                  ))}
                </ol>
              </div>

              {gameState.bonusTasks.length > 0 && (
                <div className="elevated-card p-5 space-y-3 border border-[var(--accent)]/50">
                  <h3 className="text-base font-extrabold text-[var(--accent)] m-0 flex items-center gap-2">
                    <Gift className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{t.screen.bonusTasksHeading} ({gameState.bonusTasks.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {gameState.bonusTasks.map((bt) => (
                      <div key={bt.id} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-start justify-between gap-2 text-sm">
                          <span className="font-extrabold">{bt.title}</span>
                          <span className="shrink-0 font-black text-[var(--accent)] tabular-nums">
                            +{bt.points} b. ({bt.maxCompletionsPerTeam}×)
                          </span>
                        </div>
                        {bt.description && (
                          <p className="text-xs text-[var(--text-secondary)] m-0">{bt.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gameState.rounds.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                    Přehled kol ({gameState.rounds.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {gameState.rounds.map((r) => (
                      <div
                        key={r.roundNumber}
                        className="elevated-card px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="font-bold truncate">
                          {r.isFinal ? '★ ' : `${r.roundNumber}. `}
                          {r.title}
                        </span>
                        <span className="text-xs font-bold text-[var(--text-secondary)] shrink-0">
                          {r.questionCount} ot. • {r.pointMultiplier}×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Round Intro Preview for Host */}
          {gameState.state === 'RoundIntro' && gameState.currentRound && (
            <section className="surface-card p-6 space-y-5 border-2 border-[var(--accent)]/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="px-3.5 py-1 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-xs uppercase tracking-wider">
                  📺 Právě na projektoru:{' '}
                  {gameState.currentRound.isFinal
                    ? t.screen.finalRoundBadge
                    : `${t.screen.roundPrefix} ${gameState.currentRound.roundNumber}`}
                </span>
                <button
                  type="button"
                  onClick={() => runAction(() => api.startQuestion(token, gameState.currentRound!.roundIndex, 0))}
                  className="btn-primary !py-2 !px-4 text-sm"
                >
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                  {t.host.startQuestion} 1
                </button>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-black m-0">
                  {gameState.currentRound.title}
                </h2>
                {gameState.currentRound.description && (
                  <p className="text-base sm:text-lg text-[var(--text-secondary)] m-0">
                    {gameState.currentRound.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="elevated-card px-4 py-2.5 font-extrabold text-sm">
                  {gameState.currentRound.questionCount} {t.screen.questionsCount}
                </div>
                <div className="elevated-card px-4 py-2.5 font-extrabold text-sm text-[var(--accent)]">
                  {t.screen.pointsMultiplier}: {gameState.currentRound.pointMultiplier}×
                </div>
              </div>

              {gameState.currentRound.isFinal && (
                <div className="p-4 rounded-xl bg-[var(--accent-soft)] border-2 border-[var(--accent)] space-y-3">
                  <div className="font-extrabold text-sm flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                    <span>
                      {formatTemplate(
                        gameState.jokerMode === 'PreSelect'
                          ? t.screen.jokerPreSelectBanner
                          : t.screen.jokerOnDemandBanner,
                        { count: gameState.jokerCount }
                      )}
                    </span>
                  </div>

                  {gameState.jokerMode === 'PreSelect' && (gameState.hostTeams?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-extrabold uppercase text-[var(--text-secondary)]">
                        Stav výběru žolíků u týmů:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {gameState.hostTeams!.map((ht) => {
                          const done = ht.preSelectedJokersCount >= gameState.jokerCount;
                          return (
                            <span
                              key={ht.teamId}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                                done
                                  ? 'bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)]'
                                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <TeamAvatar avatarId={ht.avatarId} avatarColor={ht.avatarColor} size="sm" />
                              <span>{ht.name}</span>
                              <span className="tabular-nums">
                                ({ht.preSelectedJokersCount}/{gameState.jokerCount})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Active / Ready Question Console */}
          {q && (gameState.state === 'QuestionReady' || gameState.state === 'QuestionActive' || gameState.state === 'QuestionLocked' || gameState.state === 'QuestionReveal') && (
            <section className="surface-card p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-black text-sm">
                    Kolo {q.roundNumber} • Otázka {q.questionNumberInRound}/{q.totalQuestionsInRound}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] font-bold text-xs">
                    {t.questionTypes[q.type]}
                  </span>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">
                    {q.basePoints} b. (+{q.speedBonusMax})
                  </span>
                </div>
                <span className="text-sm font-extrabold">
                  {gameState.state === 'QuestionReady'
                    ? `${t.host.manualStartBadge} (${Math.round(q.timeLimitSeconds)} s)`
                    : `Odpovědělo: ${gameState.answeredTeamsCount}/${gameState.totalTeamsCount}`}
                </span>
              </div>

              {gameState.state === 'QuestionReady' && (
                <div className="p-4 rounded-xl bg-[var(--info-soft)] border-2 border-[var(--info)] flex flex-wrap items-center justify-between gap-3">
                  <span className="font-extrabold text-sm text-[var(--info)]">
                    Otázka je zobrazena na projektoru. Až ji přečtete, spusťte odpočet!
                  </span>
                  <button
                    type="button"
                    onClick={() => runAction(() => api.startCountdown(token))}
                    className="btn-primary !py-2 !px-4"
                  >
                    <Play className="w-4 h-4" aria-hidden="true" />
                    {t.host.startCountdown}
                  </button>
                </div>
              )}

              {gameState.state === 'QuestionActive' && (
                <CountdownBar
                  endsAtUtc={q.endsAtUtc}
                  timeLimitSeconds={q.timeLimitSeconds}
                  gracePeriodSeconds={q.gracePeriodSeconds}
                  isPaused={q.isPaused}
                  pausedRemainingSeconds={q.pausedRemainingSeconds}
                  clockOffsetMs={clockOffsetMs}
                />
              )}

              <h2 className="text-xl sm:text-2xl font-black m-0 pt-2 pb-4 leading-snug">
                {q.text}
              </h2>

              {/* Secret Host Answer + Note Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)]/70">
                <div className="p-4 rounded-xl bg-[var(--success-soft)] border border-[var(--success)] space-y-1">
                  <div className="text-xs font-extrabold uppercase text-[var(--success)]">
                    {t.host.correctAnswerTitle}
                  </div>
                  <div className="font-black text-lg">{q.correctAnswer}</div>
                  {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                    <div className="text-xs text-[var(--text-secondary)] pt-1">
                      <strong>{t.host.acceptedAnswersTitle}:</strong> {q.acceptedAnswers.join(', ')}
                    </div>
                  )}
                </div>

                {q.hostNote && (
                  <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] space-y-1">
                    <div className="text-xs font-extrabold uppercase text-[var(--accent)]">
                      {t.host.hostNoteTitle}
                    </div>
                    <p className="m-0 text-sm font-medium">{q.hostNote}</p>
                  </div>
                )}
              </div>

              {q.media && (
                <div>
                  <div className="text-xs font-bold text-[var(--text-muted)] mb-2">
                    Náhled média ({q.media.playbackMode === 'onReveal' ? 'přehraje se při odhalení' : 'běží během otázky'})
                  </div>
                  <MediaPlayer media={q.media} token={token} autoPlay={false} isPaused={false} showControls />
                </div>
              )}

              {/* Live Answers Table with 1-Click Overrides */}
              <div className="space-y-2">
                <h3 className="text-base font-extrabold m-0">{t.host.answersTableTitle}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-[var(--border-subtle)] text-left text-xs uppercase text-[var(--text-muted)]">
                        <th scope="col" className="py-2 pr-2">{t.host.colOrder}</th>
                        <th scope="col" className="py-2 pr-3">{t.host.colTeam}</th>
                        <th scope="col" className="py-2 pr-3">{t.host.colAnswer}</th>
                        <th scope="col" className="py-2 pr-3">{t.host.colTime}</th>
                        <th scope="col" className="py-2 pr-3">{t.host.colEval}</th>
                        <th scope="col" className="py-2 text-right">{t.host.colPoints}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gameState.hostAnswers ?? []).map((ans) => {
                        const canOverride =
                          gameState.state === 'QuestionLocked' || gameState.state === 'QuestionReveal';
                        const setEval = (ev: AnswerEvaluation) =>
                          runAction(() => api.overrideEvaluation(token, ans.teamId, ev));

                        return (
                          <tr key={ans.teamId} className="border-b border-[var(--border-subtle)]/60">
                            <td className="py-2.5 pr-2 font-mono font-bold text-[var(--text-muted)]">
                              {ans.answerSequence ? `#${ans.answerSequence}` : '—'}
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2 font-bold">
                                <TeamAvatar avatarId={ans.avatarId} avatarColor={ans.avatarColor} size="sm" />
                                <span>{ans.teamName}</span>
                                {ans.jokerUsed && (
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-text)] text-[10px] font-black">
                                    2×
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 max-w-[260px]">
                              {ans.hasAnswered ? (
                                <div>
                                  <div className="font-semibold break-words">
                                    {ans.orderedItems ? ans.orderedItems.join(' → ') : ans.answerText}
                                  </div>
                                  {ans.matchedDistance !== null && ans.matchedDistance !== undefined && ans.matchedDistance > 0 && (
                                    <span className="text-[11px] text-[var(--text-muted)]">
                                      Levenshtein: {ans.matchedDistance}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[var(--text-muted)] italic">{t.host.notAnswered}</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums text-xs text-[var(--text-secondary)]">
                              {ans.effectiveElapsedSeconds != null ? `${ans.effectiveElapsedSeconds.toFixed(2)}s` : '—'}
                              {ans.estimatedLatencyMs != null && ans.estimatedLatencyMs > 0 && (
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  ~{ans.estimatedLatencyMs}ms
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!canOverride}
                                  onClick={() => setEval('Correct')}
                                  aria-pressed={ans.finalEvaluation === 'Correct'}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-45 ${
                                    ans.finalEvaluation === 'Correct'
                                      ? 'bg-[var(--success)] text-white border-[var(--success)]'
                                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5 inline mr-0.5" aria-hidden="true" />
                                  {t.host.evalCorrect}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canOverride}
                                  onClick={() => setEval('HalfPoint')}
                                  aria-pressed={ans.finalEvaluation === 'HalfPoint'}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-45 ${
                                    ans.finalEvaluation === 'HalfPoint'
                                      ? 'bg-[var(--warning)] text-[#14100a] border-[var(--warning)]'
                                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                                  }`}
                                >
                                  {t.host.evalHalf}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canOverride}
                                  onClick={() => setEval('Wrong')}
                                  aria-pressed={ans.finalEvaluation === 'Wrong'}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-45 ${
                                    ans.finalEvaluation === 'Wrong'
                                      ? 'bg-[var(--danger)] text-white border-[var(--danger)]'
                                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                                  }`}
                                >
                                  {t.host.evalWrong}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-black tabular-nums">
                              <span
                                className={
                                  ans.totalPointsAwarded > 0
                                    ? 'text-[var(--success)]'
                                    : ans.totalPointsAwarded < 0
                                      ? 'text-[var(--danger)]'
                                      : 'text-[var(--text-muted)]'
                                }
                              >
                                {ans.totalPointsAwarded > 0 ? `+${ans.totalPointsAwarded}` : ans.totalPointsAwarded}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Leaderboard / Finished Preview */}
          {(gameState.state === 'Leaderboard' || gameState.state === 'Finished') && (
            <section className="surface-card p-5 space-y-4">
              {gameState.state === 'Leaderboard' && (
                <div className="p-3 rounded-xl bg-[var(--info-soft)] border border-[var(--info)] flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[var(--info)]">
                  <span>
                    {gameState.canReturnToPreviousScreen
                      ? '📺 Na projektoru je dočasně zobrazen průběžný žebříček.'
                      : '📺 Na projektoru je zobrazen průběžný žebříček.'}
                  </span>
                  {gameState.canReturnToPreviousScreen && (
                    <button
                      type="button"
                      onClick={() => runAction(() => api.returnToPreviousScreen(token))}
                      className="btn-primary !py-1.5 !px-3 !min-h-[36px] text-xs"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {t.host.returnPrevious}
                        {gameState.returnScreenState ? `: ${t.states[gameState.returnScreenState]}` : ''}
                      </span>
                    </button>
                  )}
                </div>
              )}
              <h2 className="text-xl font-black m-0">
                {gameState.state === 'Finished' ? t.screen.finalPodiumTitle : t.screen.leaderboardTitle}
              </h2>
              <LeaderboardView entries={gameState.leaderboard} showPodium={gameState.state === 'Finished'} />
            </section>
          )}
        </div>

        {/* RIGHT SIDEBAR: Bonus Task Approvals + Teams + Rounds Navigator */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Bonus Tasks & Pending Team Claims */}
          {(gameState.bonusTasks.length > 0 || (gameState.hostTaskClaims?.length ?? 0) > 0) && (() => {
            const allClaims = gameState.hostTaskClaims ?? [];
            const pendingClaims = allClaims.filter((c) => c.status === 'Pending');
            const reviewedClaims = allClaims.filter((c) => c.status !== 'Pending');
            return (
              <section
                className={`surface-card p-4 space-y-3 ${
                  pendingClaims.length > 0 ? 'border-2 border-[var(--warning)] bg-[var(--warning-soft)]/20' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold m-0 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                    <span>{t.host.bonusTasksPanelTitle}</span>
                    {pendingClaims.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-[var(--warning)] text-[#14100a] tabular-nums">
                        {pendingClaims.length} {t.host.bonusTaskPendingBadge}
                      </span>
                    )}
                  </h2>
                  {gameState.bonusTasks.length > 0 && gameState.leaderboard.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDirectAwardTeamId(gameState.leaderboard[0]?.teamId ?? '');
                        setDirectAwardTaskId(gameState.bonusTasks[0]?.id ?? '');
                        setDirectAwardComment('');
                        setDirectAwardOpen(true);
                      }}
                      className="btn-secondary !py-1 !px-2.5 !min-h-[34px] text-xs whitespace-nowrap"
                    >
                      <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Připsat</span>
                    </button>
                  )}
                </div>

                {pendingClaims.length > 0 ? (
                  <ul className="list-none p-0 m-0 space-y-2.5">
                    {pendingClaims.map((claim) => (
                      <li
                        key={claim.id}
                        className="p-3 rounded-xl bg-[var(--bg-surface)] border-2 border-[var(--warning)] space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamAvatar avatarId={claim.avatarId} avatarColor={claim.avatarColor} size="sm" />
                            <div className="min-w-0">
                              <div className="font-black text-sm truncate">{claim.teamName}</div>
                              <div className="text-xs font-bold text-[var(--accent)] truncate">
                                {claim.taskTitle}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-[var(--success)] tabular-nums">
                              +{claim.taskPoints} b.
                            </div>
                            <div className="text-[11px] font-bold text-[var(--text-muted)] tabular-nums">
                              {claim.teamApprovedCount}/{claim.maxCompletionsPerTeam}×
                            </div>
                          </div>
                        </div>

                        {claim.note && (
                          <div className="text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] font-medium">
                            Poznámka týmu: „{claim.note}“
                          </div>
                        )}

                        <input
                          type="text"
                          maxLength={200}
                          aria-label={`Volitelný komentář k úkolu pro ${claim.teamName}`}
                          value={taskComments[claim.id] ?? ''}
                          onChange={(e) =>
                            setTaskComments((prev) => ({ ...prev, [claim.id]: e.target.value }))
                          }
                          placeholder="Volitelný komentář pro tým…"
                          className="w-full text-xs !min-h-[36px] !py-1.5 !px-2.5"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await runAction(() =>
                                api.reviewBonusTaskClaim(token, claim.id, true, taskComments[claim.id] ?? null)
                              );
                              setTaskComments((prev) => {
                                const copy = { ...prev };
                                delete copy[claim.id];
                                return copy;
                              });
                            }}
                            className="btn-primary !py-1.5 !px-2.5 !min-h-[38px] text-xs !bg-[var(--success)] !text-white"
                          >
                            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{t.host.bonusTaskApprove} (+{claim.taskPoints})</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await runAction(() =>
                                api.reviewBonusTaskClaim(token, claim.id, false, taskComments[claim.id] ?? null)
                              );
                              setTaskComments((prev) => {
                                const copy = { ...prev };
                                delete copy[claim.id];
                                return copy;
                              });
                            }}
                            className="btn-secondary !py-1.5 !px-2.5 !min-h-[38px] text-xs text-[var(--danger)] border-[var(--danger)]"
                          >
                            <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{t.host.bonusTaskReject}</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] m-0 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Žádná nevyřízená hlášení. Aktivních úkolů v kvízu: {gameState.bonusTasks.length}.
                    </span>
                  </p>
                )}

                {reviewedClaims.length > 0 && (
                  <details className="text-xs pt-1 border-t border-[var(--border-subtle)]">
                    <summary className="cursor-pointer font-bold text-[var(--text-secondary)]">
                      Vyřízené úkoly ({reviewedClaims.length})
                    </summary>
                    <ul className="list-none p-0 m-0 mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                      {reviewedClaims.slice(0, 12).map((c) => (
                        <li
                          key={c.id}
                          className="p-2 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-between gap-2"
                        >
                          <span className="truncate font-semibold">
                            <strong>{c.teamName}</strong> – {c.taskTitle}
                          </span>
                          <span
                            className={`shrink-0 font-black tabular-nums ${
                              c.status === 'Approved' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                            }`}
                          >
                            {c.status === 'Approved' ? `+${c.pointsAwarded} b.` : 'Zamítnuto'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })()}

          {/* Connected Teams & Manual Score Corrections */}
          <section className="surface-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold m-0">
                {t.host.teamsPanelTitle} ({gameState.connectedTeamsCount}/{gameState.totalTeamsCount})
              </h2>
            </div>

            {gameState.leaderboard.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] m-0">{t.screen.waitingForTeams}</p>
            ) : (
              <ul className="list-none p-0 m-0 space-y-2">
                {gameState.leaderboard.map((team) => (
                  <li
                    key={team.teamId}
                    className="elevated-card p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-black text-sm w-5 text-[var(--text-muted)]">
                        {team.rank}.
                      </span>
                      <TeamAvatar avatarId={team.avatarId} avatarColor={team.avatarColor} size="sm" />
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate flex items-center gap-1.5">
                          <span className="truncate">{team.name}</span>
                          {team.isConnected ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0" aria-label="Online" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-label="Offline" />
                          )}
                        </div>
                        <div className="text-xs font-extrabold text-[var(--accent)] tabular-nums flex items-center gap-2">
                          <span>{team.score.toLocaleString('cs-CZ')} b.</span>
                          <span className="text-[var(--text-muted)] font-semibold">
                            <Sparkles className="w-3 h-3 inline" aria-hidden="true" /> {team.jokersRemaining}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(() => {
                        const info = gameState.hostTeams?.find((ht) => ht.teamId === team.teamId);
                        const adjCount = info?.manualAdjustments?.length ?? 0;
                        return (
                          <>
                            {info && (
                              <button
                                type="button"
                                onClick={() => setReconnectTeam(info)}
                                aria-label={`${t.host.teamReconnectTitle}: ${team.name}`}
                                title={`${t.host.teamRecoveryCodeLabel}: ${info.recoveryCode}`}
                                className="btn-secondary !px-2 !py-1.5 !min-h-[36px] text-xs font-mono"
                              >
                                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{info.recoveryCode}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setScoreModalTeam({ id: team.teamId, name: team.name });
                                setScoreDelta(250);
                                setScoreReason('');
                                setScoreDeltaError(null);
                                setScoreReasonError(null);
                                setScoreSubmitError(null);
                              }}
                              aria-label={`${t.host.manualScoreTitle}: ${team.name}`}
                              className="btn-secondary !px-2.5 !py-1.5 !min-h-[36px] text-xs"
                            >
                              <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>± Body</span>
                              {adjCount > 0 && (
                                <span
                                  className="px-1.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-black leading-none tabular-nums"
                                  title={`${t.host.scoreHistoryTitle}: ${adjCount}`}
                                >
                                  {adjCount}
                                </span>
                              )}
                            </button>
                          </>
                        );
                      })()}
                      {gameState.state === 'Lobby' && (
                        <button
                          type="button"
                          onClick={() =>
                            setRemoveTeamTarget({
                              teamId: team.teamId,
                              name: team.name,
                              avatarId: team.avatarId,
                              avatarColor: team.avatarColor,
                              score: team.score
                            })
                          }
                          aria-label={`${t.host.kickTeam}: ${team.name}`}
                          className="btn-secondary !p-1.5 !min-h-[36px] text-[var(--danger)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Rounds & Questions Quick Jump Navigator */}
          <section className="surface-card p-4 space-y-3">
            <h2 className="text-base font-extrabold m-0">{t.host.roundsNavTitle}</h2>
            <button
              type="button"
              disabled={!gameState.quizId}
              onClick={() => runAction(() => api.startIntro(token))}
              aria-current={gameState.state === 'QuizIntro' ? 'step' : undefined}
              className={`w-full text-left px-3 py-2.5 rounded-xl border font-bold text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors disabled:opacity-50 ${
                gameState.state === 'QuizIntro'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40 text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span>{t.states.QuizIntro} (Intro)</span>
              </span>
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                {gameState.quizRules.length} pravidel
              </span>
            </button>
            <div ref={roundsNavContainerRef} className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {gameState.rounds.map((r) => {
                const isCurrentRound = r.roundIndex === gameState.currentRoundIndex;
                return (
                  <div
                    key={r.roundNumber}
                    data-round-index={r.roundIndex}
                    className={`p-3 rounded-xl border ${
                      isCurrentRound
                        ? 'rounds-nav-active-target border-[var(--accent)] bg-[var(--accent-soft)]/30'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.startRound(token, r.roundIndex))}
                        className="text-left font-bold text-sm bg-transparent border-0 p-0 text-inherit cursor-pointer hover:underline"
                      >
                        {r.isFinal ? '★ ' : `${r.roundNumber}. `}
                        {r.title}
                      </button>
                      <span className="text-xs font-bold text-[var(--text-muted)]">{r.pointMultiplier}×</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {r.questionIds.map((qId, qIdx) => {
                        const isActiveQ = isCurrentRound && qIdx === gameState.currentQuestionIndex;
                        return (
                          <button
                            key={qId}
                            type="button"
                            data-question-index={qIdx}
                            onClick={() => runAction(() => api.startQuestion(token, r.roundIndex, qIdx))}
                            aria-current={isActiveQ ? 'step' : undefined}
                            className={`w-8 h-8 rounded-lg text-xs font-black border cursor-pointer ${
                              isActiveQ
                                ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                            }`}
                          >
                            {qIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </main>

      {/* MODAL 1: Edit Question Parameters */}
      <ModalDialog open={editOpen} onClose={() => setEditOpen(false)} title={t.host.editModalTitle}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await runAction(() =>
              api.updateQuestionParams(token, {
                timeLimitSeconds: editTimeLimit,
                remainingSeconds: editRemaining,
                basePoints: editBasePoints,
                speedBonusMax: editSpeedBonus,
                gracePeriodSeconds: editGrace,
                text: editText,
                acceptedAnswers: editAccepted
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
                hostNote: editHostNote
              })
            );
            setEditOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-timelimit" className="text-xs font-bold">{t.host.editTimeLimit}</label>
              <input id="edit-timelimit" type="number" min={5} max={300} value={editTimeLimit} onChange={(e) => setEditTimeLimit(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-grace" className="text-xs font-bold">{t.host.editGrace}</label>
              <input id="edit-grace" type="number" min={0} max={60} value={editGrace} onChange={(e) => setEditGrace(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="edit-remaining" className="text-xs font-bold">{t.host.editRemaining}</label>
              <input id="edit-remaining" type="number" min={1} max={300} value={editRemaining} onChange={(e) => setEditRemaining(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-basepts" className="text-xs font-bold">{t.host.editBasePoints}</label>
              <input id="edit-basepts" type="number" min={0} step={50} value={editBasePoints} onChange={(e) => setEditBasePoints(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-speed" className="text-xs font-bold">{t.host.editSpeedBonus}</label>
              <input id="edit-speed" type="number" min={0} step={25} value={editSpeedBonus} onChange={(e) => setEditSpeedBonus(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-qtext" className="text-xs font-bold">{t.host.editText}</label>
            <textarea id="edit-qtext" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
          </div>

          {q?.type === 'TextInput' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-accepted" className="text-xs font-bold">{t.host.editAccepted}</label>
              <textarea id="edit-accepted" rows={3} value={editAccepted} onChange={(e) => setEditAccepted(e.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-note" className="text-xs font-bold">{t.host.editHostNote}</label>
            <textarea id="edit-note" rows={2} value={editHostNote} onChange={(e) => setEditHostNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">
              {t.app.cancel}
            </button>
            <button type="submit" className="btn-primary">
              {t.app.save}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL 2: Quick Banner Message to /screen */}
      <ModalDialog open={screenMsgOpen} onClose={() => setScreenMsgOpen(false)} title={t.host.screenMsgTitle}>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              {t.host.quickPresets}
            </div>
            <div className="flex flex-wrap gap-2">
              {t.host.presets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={async () => {
                    await runAction(() => api.sendScreenBanner(token, preset.text, preset.kind));
                    setScreenMsgOpen(false);
                  }}
                  className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-xs"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await runAction(() => api.sendScreenBanner(token, bannerText, bannerKind));
              setBannerText('');
              setScreenMsgOpen(false);
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              {(['info', 'hint', 'warning'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={bannerKind === k}
                  onClick={() => setBannerKind(k)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer ${
                    bannerKind === k
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                  }`}
                >
                  {k === 'info'
                    ? t.host.screenMsgKindInfo
                    : k === 'hint'
                      ? t.host.screenMsgKindHint
                      : t.host.screenMsgKindWarning}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="banner-textarea" className="text-xs font-bold">Text zprávy</label>
              <textarea
                id="banner-textarea"
                rows={3}
                required
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (bannerText.trim()) {
                      runAction(() => api.sendScreenBanner(token, bannerText, bannerKind)).then(() => {
                        setBannerText('');
                        setScreenMsgOpen(false);
                      });
                    }
                  }
                }}
                placeholder={t.host.screenMsgPlaceholder}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {gameState.screenBanner ? (
                <button
                  type="button"
                  onClick={async () => {
                    await runAction(() => api.clearScreenBanner(token));
                    setScreenMsgOpen(false);
                  }}
                  className="btn-secondary text-[var(--danger)]"
                >
                  {t.host.screenMsgClear}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setScreenMsgOpen(false)} className="btn-secondary">
                  {t.app.cancel}
                </button>
                <button type="submit" className="btn-primary">
                  {t.host.screenMsgSend}
                </button>
              </div>
            </div>
          </form>
        </div>
      </ModalDialog>

      {/* MODAL 3: Message to Player Devices */}
      <ModalDialog open={playerMsgOpen} onClose={() => setPlayerMsgOpen(false)} title={t.host.playerMsgTitle}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!playerMsgText.trim()) return;
            await runAction(() => api.sendPlayerMessage(token, playerMsgText, playerMsgTarget || null));
            setPlayerMsgText('');
            setPlayerMsgOpen(false);
          }}
          className="space-y-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="msg-target" className="text-xs font-bold">{t.host.playerMsgTarget}</label>
            <select
              id="msg-target"
              value={playerMsgTarget}
              onChange={(e) => setPlayerMsgTarget(e.target.value)}
            >
              <option value="">{t.host.playerMsgAll}</option>
              {gameState.leaderboard.map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="player-msg-input" className="text-xs font-bold">Zpráva</label>
            <textarea
              id="player-msg-input"
              rows={3}
              required
              value={playerMsgText}
              onChange={(e) => setPlayerMsgText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (playerMsgText.trim()) {
                    runAction(() => api.sendPlayerMessage(token, playerMsgText, playerMsgTarget || null)).then(() => {
                      setPlayerMsgText('');
                      setPlayerMsgOpen(false);
                    });
                  }
                }
              }}
              placeholder={t.host.playerMsgPlaceholder}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPlayerMsgOpen(false)} className="btn-secondary">
              {t.app.cancel}
            </button>
            <button type="submit" className="btn-primary">
              {t.host.playerMsgSend}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL 4: Manual Score Adjustment + Full Adjustment History */}
      <ModalDialog
        open={scoreModalTeam !== null}
        onClose={() => {
          if (!submittingScore) setScoreModalTeam(null);
        }}
        title={`${t.host.manualScoreTitle}: ${scoreModalTeam?.name ?? ''}`}
      >
        {scoreModalTeam && (() => {
          const liveTeam = gameState.hostTeams?.find((ht) => ht.teamId === scoreModalTeam.id) ?? null;
          const adjustments = liveTeam?.manualAdjustments ?? [];
          const manualNetTotal = adjustments.reduce((sum, item) => sum + item.delta, 0);
          const locale = lang === 'en' ? 'en-GB' : 'cs-CZ';

          return (
            <div className="space-y-5">
              {liveTeam && (
                <div className="elevated-card p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamAvatar avatarId={liveTeam.avatarId} avatarColor={liveTeam.avatarColor} size="sm" />
                    <span className="font-extrabold text-sm truncate">{liveTeam.name}</span>
                  </div>
                  <span className="text-sm font-black text-[var(--accent)] tabular-nums shrink-0">
                    {liveTeam.score.toLocaleString(locale)} b.
                  </span>
                </div>
              )}

              <form
                key={scoreModalTeam.id}
                method="POST"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setScoreSubmitError(null);

                  const deltaInvalid = Number.isNaN(scoreDelta) || scoreDelta === 0;
                  const trimmedReason = scoreReason.trim();
                  const reasonInvalid = trimmedReason.length === 0;

                  setScoreDeltaError(deltaInvalid ? t.host.scoreDeltaZeroError : null);
                  setScoreReasonError(reasonInvalid ? t.host.scoreReasonRequiredError : null);

                  if (deltaInvalid) {
                    scoreDeltaInputRef.current?.setCustomValidity(t.host.scoreDeltaZeroError);
                    scoreDeltaInputRef.current?.focus();
                    return;
                  }
                  if (reasonInvalid) {
                    scoreReasonInputRef.current?.focus();
                    return;
                  }

                  setSubmittingScore(true);
                  try {
                    await api.adjustTeamScore(token, scoreModalTeam.id, scoreDelta, trimmedReason);
                    setScoreModalTeam(null);
                  } catch (err) {
                    setScoreSubmitError(err instanceof Error ? err.message : 'Akce se nezdařila.');
                  } finally {
                    setSubmittingScore(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="flex flex-wrap gap-2">
                  {[-500, -250, +250, +500, +1000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setScoreDelta(v);
                        setScoreDeltaError(null);
                        setScoreSubmitError(null);
                        scoreDeltaInputRef.current?.setCustomValidity('');
                      }}
                      className={`btn-secondary !py-1.5 !px-3 !min-h-[38px] text-sm font-black ${
                        scoreDelta === v ? '!border-[var(--accent)] !bg-[var(--accent-soft)]' : ''
                      }`}
                    >
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="score-delta" className="text-xs font-bold">
                    {t.host.scoreDeltaLabel} <span aria-hidden="true" className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    ref={scoreDeltaInputRef}
                    id="score-delta"
                    name="delta"
                    type="number"
                    required
                    value={scoreDelta}
                    aria-invalid={scoreDeltaError ? 'true' : 'false'}
                    aria-describedby={scoreDeltaError ? 'score-delta-error' : undefined}
                    onInvalid={(e) => {
                      e.preventDefault();
                      setScoreDeltaError(t.host.scoreDeltaZeroError);
                      scoreDeltaInputRef.current?.focus();
                    }}
                    onBlur={(e) => {
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.matches(':user-invalid') || Number.isNaN(val) || val === 0) {
                        e.currentTarget.setCustomValidity(t.host.scoreDeltaZeroError);
                        setScoreDeltaError(t.host.scoreDeltaZeroError);
                      }
                    }}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setScoreDelta(next);
                      e.currentTarget.setCustomValidity('');
                      if (scoreDeltaError && !Number.isNaN(next) && next !== 0) {
                        setScoreDeltaError(null);
                      }
                      if (scoreSubmitError) setScoreSubmitError(null);
                    }}
                  />
                  {scoreDeltaError && (
                    <div
                      id="score-delta-error"
                      className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5 mt-0.5"
                    >
                      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{scoreDeltaError}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="score-reason" className="text-xs font-bold">
                    {t.host.scoreReasonLabel} <span aria-hidden="true" className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    ref={scoreReasonInputRef}
                    id="score-reason"
                    name="reason"
                    type="text"
                    required
                    pattern=".*\S.*"
                    maxLength={200}
                    enterKeyHint="done"
                    value={scoreReason}
                    aria-invalid={scoreReasonError ? 'true' : 'false'}
                    aria-describedby={scoreReasonError ? 'score-reason-error' : undefined}
                    onInvalid={(e) => {
                      e.preventDefault();
                      setScoreReasonError(t.host.scoreReasonRequiredError);
                      scoreReasonInputRef.current?.focus();
                    }}
                    onBlur={(e) => {
                      if (
                        e.currentTarget.matches(':user-invalid') ||
                        (scoreReason.length > 0 && scoreReason.trim().length === 0)
                      ) {
                        setScoreReasonError(t.host.scoreReasonRequiredError);
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScoreReason(val);
                      e.currentTarget.setCustomValidity('');
                      if (scoreReasonError && val.trim().length > 0) {
                        setScoreReasonError(null);
                      }
                      if (scoreSubmitError) setScoreSubmitError(null);
                    }}
                    placeholder={t.host.scoreReasonPlaceholder}
                  />
                  {scoreReasonError && (
                    <div
                      id="score-reason-error"
                      className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5 mt-0.5"
                    >
                      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{scoreReasonError}</span>
                    </div>
                  )}
                </div>

                {scoreSubmitError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-xs font-semibold flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{scoreSubmitError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={submittingScore}
                    onClick={() => setScoreModalTeam(null)}
                    className="btn-secondary"
                  >
                    {t.app.cancel}
                  </button>
                  <button type="submit" disabled={submittingScore} className="btn-primary">
                    {t.host.applyScore}
                  </button>
                </div>
              </form>

              <section className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)] m-0 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {t.host.scoreHistoryTitle} ({adjustments.length})
                    </span>
                  </h3>
                  {adjustments.length > 0 && (
                    <span
                      className={`text-xs font-black tabular-nums px-2 py-0.5 rounded-full ${
                        manualNetTotal > 0
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : manualNetTotal < 0
                            ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {t.host.scoreHistoryTotal}: {manualNetTotal > 0 ? `+${manualNetTotal.toLocaleString(locale)}` : manualNetTotal.toLocaleString(locale)} b.
                    </span>
                  )}
                </div>

                {adjustments.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] m-0 italic">{t.host.scoreHistoryEmpty}</p>
                ) : (
                  <ul className="list-none p-0 m-0 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {adjustments.map((adj) => (
                      <li
                        key={adj.id}
                        className="elevated-card p-2.5 flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-[var(--text-primary)] break-words">
                            {adj.reason}
                          </div>
                          <time
                            dateTime={adj.createdAtUtc}
                            className="block text-[11px] font-medium text-[var(--text-muted)] tabular-nums"
                          >
                            {new Date(adj.createdAtUtc).toLocaleTimeString(locale, {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </time>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-black tabular-nums ${
                            adj.delta > 0
                              ? 'bg-[var(--success-soft)] text-[var(--success)]'
                              : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                          }`}
                        >
                          {adj.delta > 0 ? `+${adj.delta.toLocaleString(locale)}` : adj.delta.toLocaleString(locale)} b.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          );
        })()}
      </ModalDialog>

      {/* MODAL 5: Keyboard Shortcuts */}
      <ModalDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t.host.shortcutsTitle}>
        <ul className="list-none p-0 m-0 space-y-2.5 text-sm">
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Další krok (stavový automat)</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">Space / →</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Pozastavit / Pokračovat otázku</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">P</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Upravit parametry aktivní otázky</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">E</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Zobrazit úvodní stránku s QR kódem (přepínač)</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">Q</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Zobrazit průběžný žebříček (přepínač)</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">L</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Vrátit se zpět na předchozí obrazovku</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">B / Backspace</kbd>
          </li>
          <li className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
            <span>Odeslat zprávu na projektor</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">M</kbd>
          </li>
          <li className="flex justify-between py-1.5">
            <span>Zobrazit tuto nápovědu</span>
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] font-mono font-bold">?</kbd>
          </li>
        </ul>
      </ModalDialog>

      {/* MODAL 6: Destructive Reset Confirmation (autofocus on Cancel per dialog guidance!) */}
      <ModalDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t.host.resetConfirmTitle}
        lightDismiss={false}
      >
        <div className="space-y-4">
          <p className="m-0 text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
            <HelpCircle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t.host.resetConfirmBody}</span>
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              ref={(el) => {
                if (el) el.autofocus = true;
              }}
              autoFocus
              onClick={() => setResetOpen(false)}
              className="btn-secondary"
            >
              {t.app.cancel}
            </button>
            <button
              type="button"
              onClick={async () => {
                await runAction(() => api.resetSession(token, true));
                setResetOpen(false);
              }}
              className="btn-danger"
            >
              {t.host.resetBtn}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* MODAL 6b: Destructive Remove Team Confirmation (native <dialog>, autofocus on safe Cancel) */}
      <ModalDialog
        open={removeTeamTarget !== null}
        onClose={() => {
          if (!removingTeam) setRemoveTeamTarget(null);
        }}
        title={t.host.kickTeamConfirmTitle}
        lightDismiss={false}
      >
        {removeTeamTarget && (
          <div className="space-y-4">
            <div className="elevated-card p-3 flex items-center gap-3">
              <TeamAvatar
                avatarId={removeTeamTarget.avatarId}
                avatarColor={removeTeamTarget.avatarColor}
                size="sm"
              />
              <div className="min-w-0">
                <div className="font-extrabold text-sm truncate">{removeTeamTarget.name}</div>
                <div className="text-xs font-bold text-[var(--accent)] tabular-nums">
                  {removeTeamTarget.score.toLocaleString('cs-CZ')} b.
                </div>
              </div>
            </div>
            <p className="m-0 text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{formatTemplate(t.host.kickTeamConfirmBody, { name: removeTeamTarget.name })}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                ref={(el) => {
                  if (el) el.autofocus = true;
                }}
                autoFocus
                disabled={removingTeam}
                onClick={() => setRemoveTeamTarget(null)}
                className="btn-secondary"
              >
                {t.app.cancel}
              </button>
              <button
                type="button"
                disabled={removingTeam}
                onClick={async () => {
                  const targetId = removeTeamTarget.teamId;
                  setRemovingTeam(true);
                  try {
                    await runAction(() => api.removeTeam(token, targetId));
                    setRemoveTeamTarget(null);
                  } finally {
                    setRemovingTeam(false);
                  }
                }}
                className="btn-danger"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{t.host.kickTeam}</span>
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
      {/* MODAL 7: Team Reconnection QR & Recovery Code */}
      <ModalDialog
        open={reconnectTeam !== null}
        onClose={() => setReconnectTeam(null)}
        title={`${t.host.teamReconnectTitle}: ${reconnectTeam?.name ?? ''}`}
      >
        {reconnectTeam && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-[var(--text-secondary)] m-0">
              Naskenujte tento QR kód na libovolném telefonu nebo zadejte obnovovací kód v záložce <strong>„Vrátit se do rozehraného týmu“</strong>. Veškeré skóre a odpovědi zůstanou zachovány.
            </p>
            <div className="flex justify-center">
              <QrCodeDisplay value={reconnectTeam.reconnectUrl} size={200} />
            </div>
            <div className="elevated-card p-3 space-y-1">
              <div className="text-xs font-bold uppercase text-[var(--text-muted)]">
                {t.host.teamRecoveryCodeLabel}
              </div>
              <div className="font-mono text-3xl font-black tracking-widest text-[var(--accent)]">
                {reconnectTeam.recoveryCode}
              </div>
            </div>
            <div className="text-xs font-mono break-all text-[var(--text-secondary)]">
              {reconnectTeam.reconnectUrl}
            </div>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(reconnectTeam.reconnectUrl, 'rejoin')}
                className="btn-primary"
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
                {copiedKey === 'rejoin' ? t.host.copied : t.host.copyLink}
              </button>
              <button type="button" onClick={() => setReconnectTeam(null)} className="btn-secondary">
                {t.app.close}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
      {/* MODAL 8: Safe Load Quiz Package & Language Selector */}
      <ModalDialog
        open={loadQuizOpen}
        onClose={() => setLoadQuizOpen(false)}
        title={t.host.loadQuiz}
        lightDismiss={!isQuizRunning}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedQuizId) return;
            if (isQuizRunning && !confirmLoadOverwrite) return;
            await runAction(() => api.loadQuiz(token, selectedQuizId, selectedQuizLang));
            setLoadQuizOpen(false);
          }}
          className="space-y-4"
        >
          {isQuizRunning && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[var(--danger-soft)] border-2 border-[var(--danger)] text-[var(--danger)] space-y-2"
            >
              <div className="font-black text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>POZOR: Právě probíhá spuštěný kvíz!</span>
              </div>
              <p className="text-sm font-semibold m-0 leading-snug">
                Aktuálně běží <strong>„{gameState.quizTitle}“</strong> ({t.states[gameState.state]}).
                Načtením balíčku se <strong>nevratně vynulují veškeré body, odpovědi i průběh hry</strong>, vygeneruje se nový kód hry a hra se vrátí do Lobby (připojené týmy zůstanou zachovány).
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-quiz-select" className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              {t.host.quizPackage}
            </label>
            <select
              id="modal-quiz-select"
              value={selectedQuizId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedQuizId(nextId);
                const meta = quizzes.find((qz) => qz.id === nextId);
                if (meta && !meta.availableLanguages.includes(selectedQuizLang)) {
                  setSelectedQuizLang(meta.defaultLanguage);
                }
              }}
            >
              {quizzes.map((qz) => (
                <option key={qz.id} value={qz.id}>
                  {qz.title} ({qz.roundCount} kol, {qz.questionCount} otázek)
                </option>
              ))}
            </select>
            {chosenQuizMeta?.description && (
              <p className="text-xs text-[var(--text-secondary)] m-0">{chosenQuizMeta.description}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-quiz-lang" className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              {t.host.quizLanguage}
            </label>
            <select
              id="modal-quiz-lang"
              value={selectedQuizLang}
              onChange={(e) => setSelectedQuizLang(e.target.value)}
            >
              {chosenQuizLangs.map((l) => (
                <option key={l} value={l}>
                  {l === 'cs' ? 'Čeština (CS)' : l === 'en' ? 'English (EN)' : l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Safe non-destructive shortcut when host only wants to change language of the currently running quiz */}
          {isQuizRunning &&
            selectedQuizId === gameState.quizId &&
            selectedQuizLang !== gameState.quizLanguage && (
              <div className="p-3 rounded-xl bg-[var(--info-soft)] border border-[var(--info)] flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--info)]">
                  Chcete jen přepnout jazyk běžícího kvízu bez ztráty bodů?
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await runAction(() => api.setQuizLanguage(token, selectedQuizId, selectedQuizLang));
                    setLoadQuizOpen(false);
                  }}
                  className="btn-primary !py-1.5 !px-3 !min-h-[36px] text-xs"
                >
                  Přepnout jazyk (zachovat skóre)
                </button>
              </div>
            )}

          {isQuizRunning && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] cursor-pointer text-sm font-bold">
              <input
                type="checkbox"
                checked={confirmLoadOverwrite}
                onChange={(e) => setConfirmLoadOverwrite(e.target.checked)}
                className="w-5 h-5 mt-0.5 shrink-0"
              />
              <span>Rozumím, chci vynulovat dosavadní skóre a načíst vybraný kvíz od začátku.</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus={isQuizRunning}
              onClick={() => setLoadQuizOpen(false)}
              className="btn-secondary"
            >
              {t.app.cancel}
            </button>
            <button
              type="submit"
              disabled={!selectedQuizId || (isQuizRunning && !confirmLoadOverwrite)}
              className={isQuizRunning ? 'btn-danger' : 'btn-primary'}
            >
              <FolderOpen className="w-4 h-4" aria-hidden="true" />
              <span>{isQuizRunning ? 'Vynulovat a načíst kvíz' : t.host.loadQuiz}</span>
            </button>
          </div>
        </form>
      </ModalDialog>
      {/* MODAL 9: Direct Award Bonus Task (when reported verbally to host) */}
      <ModalDialog
        open={directAwardOpen}
        onClose={() => setDirectAwardOpen(false)}
        title={t.host.bonusTaskDirectAward}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!directAwardTeamId || !directAwardTaskId) return;
            await runAction(() =>
              api.awardBonusTaskDirectly(token, directAwardTeamId, directAwardTaskId, directAwardComment.trim() || null)
            );
            setDirectAwardOpen(false);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-[var(--text-secondary)] m-0">
            Pokud vedoucí týmu nahlásil splnění úkolu ústně přímo u pultu, můžete mu body potvrdit a připsat ihned odsud.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="award-team" className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              {t.host.colTeam}
            </label>
            <select
              id="award-team"
              value={directAwardTeamId}
              onChange={(e) => setDirectAwardTeamId(e.target.value)}
            >
              {gameState.leaderboard.map((tm) => (
                <option key={tm.teamId} value={tm.teamId}>
                  {tm.name} ({tm.score} b.)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="award-task" className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              {t.host.bonusTasksPanelTitle}
            </label>
            <select
              id="award-task"
              value={directAwardTaskId}
              onChange={(e) => setDirectAwardTaskId(e.target.value)}
            >
              {gameState.bonusTasks.map((bt) => (
                <option key={bt.id} value={bt.id}>
                  {bt.title} (+{bt.points} b., max {bt.maxCompletionsPerTeam}×)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="award-comment" className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
              Volitelný komentář
            </label>
            <input
              id="award-comment"
              type="text"
              maxLength={200}
              value={directAwardComment}
              onChange={(e) => setDirectAwardComment(e.target.value)}
              placeholder="Např. Na zdraví!"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDirectAwardOpen(false)} className="btn-secondary">
              {t.app.cancel}
            </button>
            <button type="submit" disabled={!directAwardTeamId || !directAwardTaskId} className="btn-primary">
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>Potvrdit a připsat body</span>
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
