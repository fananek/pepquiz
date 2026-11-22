import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Edit3,
  Gift,
  GripVertical,
  HelpCircle,
  KeyRound,
  LogOut,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  Send,
  Sparkles,
  Timer,
  Wifi,
  WifiOff,
  XCircle
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { createQuizSignalRClient, type ConnectionStatus, type QuizSignalRClient } from '../services/signalr';
import type { GameStateBroadcast, PublicTeamSummary } from '../types/quiz';
import { useI18n, formatTemplate } from '../i18n/I18nContext';
import { AVATAR_COLORS, randomAvatar, TeamAvatar } from '../components/TeamAvatar';
import { AvatarBuilder } from '../components/AvatarBuilder';
import { CountdownBar } from '../components/CountdownBar';
import { LeaderboardView } from '../components/LeaderboardView';
import { ModalDialog } from '../components/ModalDialog';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const TEAM_TOKEN_KEY = 'pubquiz-team-token';
const DISMISSED_MSGS_KEY_PREFIX = 'pubquiz-dismissed-msgs:';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function loadDismissedMessageIds(sessionId: string, teamId: string): string[] {
  try {
    const raw = localStorage.getItem(`${DISMISSED_MSGS_KEY_PREFIX}${sessionId}:${teamId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveDismissedMessageIds(sessionId: string, teamId: string, ids: string[]) {
  try {
    const trimmed = ids.slice(-50);
    localStorage.setItem(`${DISMISSED_MSGS_KEY_PREFIX}${sessionId}:${teamId}`, JSON.stringify(trimmed));
  } catch {
    // Ignore restricted storage
  }
}

function loadSavedToken(): string | null {
  try {
    return localStorage.getItem(TEAM_TOKEN_KEY) ?? sessionStorage.getItem(TEAM_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistToken(jwt: string | null) {
  try {
    if (jwt) {
      localStorage.setItem(TEAM_TOKEN_KEY, jwt);
      sessionStorage.setItem(TEAM_TOKEN_KEY, jwt);
    } else {
      localStorage.removeItem(TEAM_TOKEN_KEY);
      sessionStorage.removeItem(TEAM_TOKEN_KEY);
    }
  } catch {
    // Ignore restricted storage
  }
}

export function PlayPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const joinTabBaseId = useId();

  const [token, setToken] = useState<string | null>(loadSavedToken);
  const [joinTab, setJoinTab] = useState<'new' | 'rejoin'>(() =>
    searchParams.get('rejoin') ? 'rejoin' : 'new'
  );

  // Join / Avatar form state
  const [joinCode, setJoinCode] = useState(() => (searchParams.get('join') ?? '').toUpperCase());
  const [recoveryCodeInput, setRecoveryCodeInput] = useState(() =>
    (searchParams.get('rejoin') ?? '').toUpperCase()
  );
  const [teamName, setTeamName] = useState('');
  const initialAvatar = useMemo(() => randomAvatar(), []);
  const [avatarId, setAvatarId] = useState<string>(initialAvatar.avatarId);
  const [avatarColor, setAvatarColor] = useState<string>(initialAvatar.avatarColor || AVATAR_COLORS[0]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Rejoin team directory
  const [rejoinTeams, setRejoinTeams] = useState<PublicTeamSummary[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Live session state
  const [gameState, setGameState] = useState<GameStateBroadcast | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [sessionMissingNotice, setSessionMissingNotice] = useState<string | null>(null);
  const clientRef = useRef<QuizSignalRClient | null>(null);
  const autoRejoinAttempted = useRef(false);

  // Answer state per active question
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [textAnswer, setTextAnswer] = useState<string>('');
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [useJoker, setUseJoker] = useState<boolean>(false);
  const [submissionId, setSubmissionId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSeq, setSubmitSeq] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Pre-select jokers state
  const [preSelectedIds, setPreSelectedIds] = useState<string[]>([]);
  const [jokerSavedToast, setJokerSavedToast] = useState(false);

  // Edit profile modal, bonus tasks modal & dismissed host messages
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [dismissedMsgIds, setDismissedMsgIds] = useState<string[]>([]);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const currentQuestionId = gameState?.currentQuestion?.id ?? null;
  const activeSessionId = gameState?.sessionId ?? null;
  const activeTeamId = gameState?.self?.teamId ?? null;

  useEffect(() => {
    if (!activeSessionId || !activeTeamId) return;
    setDismissedMsgIds(loadDismissedMessageIds(activeSessionId, activeTeamId));
  }, [activeSessionId, activeTeamId]);

  const handleDismissMessage = (messageId: string) => {
    setDismissedMsgIds((prev) => {
      if (prev.includes(messageId)) return prev;
      const next = [...prev, messageId];
      if (activeSessionId && activeTeamId) {
        saveDismissedMessageIds(activeSessionId, activeTeamId, next);
      }
      return next;
    });
    void clientRef.current?.dismissMessage(messageId).catch(() => {});
  };

  const handleClaimBonusTask = async (taskId: string) => {
    if (!clientRef.current || claimingTaskId) return;
    setClaimingTaskId(taskId);
    setTaskFeedback(null);
    try {
      const note = (taskNotes[taskId] ?? '').trim();
      const res = await clientRef.current.claimBonusTask(taskId, note || null);
      if (res.success) {
        setTaskNotes((prev) => ({ ...prev, [taskId]: '' }));
        setTaskFeedback({
          kind: 'success',
          text: 'Splnění úkolu bylo nahlášeno moderátorovi ke schválení.'
        });
      } else {
        setTaskFeedback({
          kind: 'error',
          text: res.error ?? 'Nepodařilo se nahlásit splnění úkolu.'
        });
      }
    } catch (err) {
      setTaskFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Chyba spojení při hlášení úkolu.'
      });
    } finally {
      setClaimingTaskId(null);
    }
  };

  useEffect(() => {
    const teamLabel = gameState?.self?.teamName;
    document.title = teamLabel
      ? `${teamLabel} | PubQuiz Engine`
      : 'Připojit tým (/play) | PubQuiz Engine';
  }, [gameState?.self?.teamName]);

  // Automatic 1-click recovery when opened via host's /play?rejoin=CODE link or QR!
  useEffect(() => {
    const rejoinParam = searchParams.get('rejoin');
    if (!rejoinParam || autoRejoinAttempted.current) return;
    autoRejoinAttempted.current = true;
    setJoining(true);
    api
      .rejoinTeam({ recoveryCode: rejoinParam.trim().toUpperCase() })
      .then((res) => {
        setToken(res.token);
        persistToken(res.token);
        setSessionMissingNotice(null);
        setJoinError(null);
        setSearchParams({}, { replace: true });
      })
      .catch((err) => {
        setJoinTab('rejoin');
        setRecoveryCodeInput(rejoinParam.toUpperCase());
        setJoinError(err instanceof Error ? err.message : 'Obnovení týmu selhalo.');
      })
      .finally(() => setJoining(false));
  }, [searchParams, setSearchParams]);

  // Load offline/active teams when user switches to Rejoin tab and has a 6-char JoinCode
  useEffect(() => {
    if (token || joinTab !== 'rejoin' || joinCode.trim().length < 6) {
      return;
    }
    let active = true;
    setLoadingTeams(true);
    api
      .getTeamsForRejoin(joinCode.trim().toUpperCase())
      .then((list) => {
        if (active) setRejoinTeams(list);
      })
      .catch(() => {
        if (active) setRejoinTeams([]);
      })
      .finally(() => {
        if (active) setLoadingTeams(false);
      });
    return () => {
      active = false;
    };
  }, [token, joinTab, joinCode]);

  // Bulletproof SignalR connection + mobile wake-up recovery (NEVER wipes token on transient errors!)
  useEffect(() => {
    if (!token) return;
    let active = true;

    const handleConfirmedSessionInvalid = (reason?: string) => {
      if (!active) return;
      setToken(null);
      setGameState(null);
      persistToken(null);
      if (reason) setSessionMissingNotice(reason);
    };

    // Fast HTTP state bootstrap so UI renders instantaneously on reload while WebSocket handshakes
    api
      .verifyToken(token)
      .then((info) => {
        if (!active) return;
        if (info.teamExists === false) {
          handleConfirmedSessionInvalid(
            'Předchozí hra byla resetována moderátorem. Připojte se prosím znovu.'
          );
          return;
        }
        return api.getState(token).then((snap) => {
          if (active && snap.self) {
            setGameState(snap);
            setPreSelectedIds(snap.self.preSelectedJokerQuestionIds);
          }
        });
      })
      .catch((err) => {
        if (!active) return;
        // ONLY clear token if server explicitly rejected JWT with 401!
        if (err instanceof ApiError && err.status === 401) {
          handleConfirmedSessionInvalid('Platnost přihlášení vypršela. Připojte se zpět do svého týmu.');
        }
      });

    const client = createQuizSignalRClient(token, {
      onState: (snap) => {
        if (!active) return;
        setGameState(snap);
        if (snap.self) {
          setPreSelectedIds(snap.self.preSelectedJokerQuestionIds);
        }
      },
      onStatus: (st) => {
        if (active) setConnStatus(st);
      },
      onClockSync: (offset) => {
        if (active) setClockOffsetMs(offset);
      },
      onAuthError: () => {
        handleConfirmedSessionInvalid('Platnost tokenu vypršela. Použijte obnovení týmu.');
      },
      onTeamMissing: () => {
        handleConfirmedSessionInvalid(
          'Tým už v aktuální hře neexistuje (hra byla resetována). Připojte se znovu.'
        );
      }
    });

    clientRef.current = client;
    void client.start();

    // Immediately heal socket when a phone wakes up from sleep or regains Wi-Fi/LTE
    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        void client.ensureConnected();
      }
    };
    const handleOnline = () => {
      void client.ensureConnected();
    };

    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('online', handleOnline);
      clientRef.current = null;
      void client.stop();
    };
  }, [token]);

  // Reset answer inputs cleanly whenever a NEW question opens
  useEffect(() => {
    if (!currentQuestionId || !gameState?.currentQuestion) return;
    const q = gameState.currentQuestion;
    setSelectedOption('');
    setTextAnswer('');
    setOrderedItems(q.type === 'Ordering' && q.options ? [...q.options] : []);
    setUseJoker(false);
    setSubmitError(null);
    setSubmitSeq(null);
    setSubmissionId(`${currentQuestionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }, [currentQuestionId]);

  const openEditProfile = () => {
    if (gameState?.self) {
      setTeamName(gameState.self.teamName);
      setAvatarId(gameState.self.avatarId);
      setAvatarColor(gameState.self.avatarColor);
    }
    setProfileError(null);
    setEditProfileOpen(true);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setSessionMissingNotice(null);
    setJoining(true);
    try {
      const res = await api.joinPlayer({
        joinCode: joinCode.trim().toUpperCase(),
        teamName: teamName.trim(),
        avatarId,
        avatarColor,
        existingTeamToken: token
      });
      setToken(res.token);
      persistToken(res.token);
      setSearchParams({}, { replace: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Připojení se nezdařilo.');
    } finally {
      setJoining(false);
    }
  };

  const handleRejoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setSessionMissingNotice(null);
    setJoining(true);
    try {
      const res = await api.rejoinTeam({
        recoveryCode: recoveryCodeInput.trim().toUpperCase()
      });
      setToken(res.token);
      persistToken(res.token);
      setSearchParams({}, { replace: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Nepodařilo se obnovit tým.');
    } finally {
      setJoining(false);
    }
  };

  const handleRejoinOfflineTeam = async (team: PublicTeamSummary) => {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await api.rejoinTeam({
        joinCode: joinCode.trim().toUpperCase(),
        teamId: team.teamId
      });
      setToken(res.token);
      persistToken(res.token);
      setSearchParams({}, { replace: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Nepodařilo se připojit zpět.');
    } finally {
      setJoining(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientRef.current) return;
    setProfileError(null);
    try {
      const res = await clientRef.current.updateProfile({
        teamName: teamName.trim(),
        avatarId,
        avatarColor
      });
      if (res.success) {
        setEditProfileOpen(false);
      } else if (res.error) {
        setProfileError(res.error);
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Uložení se nezdařilo.');
    }
  };

  const handleLeave = () => {
    setToken(null);
    setGameState(null);
    persistToken(null);
  };

  const handleAnswerSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!clientRef.current || !gameState?.currentQuestion || submitting) return;

    const q = gameState.currentQuestion;
    let answerText: string | null = null;
    let items: string[] | null = null;

    if (q.type === 'MultipleChoice') {
      if (!selectedOption) {
        setSubmitError('Vyberte prosím jednu z možností.');
        return;
      }
      answerText = selectedOption;
    } else if (q.type === 'TextInput') {
      if (!textAnswer.trim()) {
        setSubmitError('Napište prosím svou odpověď.');
        return;
      }
      answerText = textAnswer.trim();
    } else if (q.type === 'Ordering') {
      items = orderedItems;
      answerText = orderedItems.join(' → ');
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await clientRef.current.submitAnswer({
        questionId: q.id,
        submissionId,
        answerText,
        orderedItems: items,
        useJoker
      });
      if (!res.success && !res.alreadySubmitted) {
        setSubmitError(res.error ?? 'Nepodařilo se odeslat odpověď.');
      } else if (res.answerSequence) {
        setSubmitSeq(res.answerSequence);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Chyba spojení při odesílání. Zkuste to hned znovu.');
    } finally {
      setSubmitting(false);
    }
  };

  const moveOrderItem = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= orderedItems.length) return;
    const copy = [...orderedItems];
    [copy[index], copy[nextIdx]] = [copy[nextIdx], copy[index]];
    setOrderedItems(copy);
  };

  const togglePreSelectJoker = (qId: string) => {
    const max = gameState?.jokerCount ?? 2;
    setJokerSavedToast(false);
    setPreSelectedIds((prev) => {
      if (prev.includes(qId)) return prev.filter((id) => id !== qId);
      if (prev.length >= max) return prev;
      return [...prev, qId];
    });
  };

  const savePreSelectJokers = async () => {
    if (!clientRef.current) return;
    const res = await clientRef.current.preSelectJokers(preSelectedIds);
    if (res.success) setJokerSavedToast(true);
  };

  const activeMessages = useMemo(() => {
    if (!gameState?.messages) return [];
    return gameState.messages.filter((m) => !dismissedMsgIds.includes(m.id));
  }, [gameState?.messages, dismissedMsgIds]);

  // --- JOIN / REJOIN VIEW ---
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
          <span className="font-black text-lg">{t.app.name}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="surface-card p-5 sm:p-7 max-w-lg w-full space-y-5">
            <div>
              <h1 className="text-2xl font-black m-0">{t.play.joinTitle}</h1>
              <p className="text-sm text-[var(--text-secondary)] m-0">{t.app.tagline}</p>
            </div>

            {sessionMissingNotice && (
              <div role="status" className="p-3 rounded-xl bg-[var(--warning-soft)] text-[var(--warning)] text-sm font-semibold">
                {sessionMissingNotice}
              </div>
            )}

            {/* Join vs Rejoin accessible tabs */}
            <div role="tablist" aria-label="Způsob připojení týmu" className="tablist-scroll">
              <button
                id={`${joinTabBaseId}-new`}
                type="button"
                role="tab"
                aria-selected={joinTab === 'new'}
                tabIndex={joinTab === 'new' ? 0 : -1}
                onClick={() => {
                  setJoinTab('new');
                  setJoinError(null);
                }}
              >
                Nový tým
              </button>
              <button
                id={`${joinTabBaseId}-rejoin`}
                type="button"
                role="tab"
                aria-selected={joinTab === 'rejoin'}
                tabIndex={joinTab === 'rejoin' ? 0 : -1}
                onClick={() => {
                  setJoinTab('rejoin');
                  setJoinError(null);
                }}
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                Vrátit se do rozehraného týmu
              </button>
            </div>

            {/* TAB 1: NEW TEAM + KAHOOT AVATAR BUILDER */}
            <div role="tabpanel" aria-labelledby={`${joinTabBaseId}-new`} hidden={joinTab !== 'new'}>
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4 flex flex-col gap-1">
                    <label htmlFor="join-code" className="font-bold text-sm">
                      {t.play.joinCodeLabel}
                    </label>
                    <input
                      id="join-code"
                      name="joinCode"
                      type="text"
                      required
                      minLength={6}
                      maxLength={8}
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="A7B9K2"
                      className="uppercase font-mono tracking-widest text-center font-bold text-xl"
                    />
                  </div>

                  <div className="sm:col-span-8 flex flex-col gap-1">
                    <label htmlFor="team-name" className="font-bold text-sm">
                      {t.play.teamNameLabel}
                    </label>
                    <input
                      id="team-name"
                      name="teamName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={32}
                      enterKeyHint="done"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder={t.play.teamNamePlaceholder}
                    />
                  </div>
                </div>

                {/* Kahoot-style Layered Avatar Creator */}
                <AvatarBuilder
                  avatarId={avatarId}
                  avatarColor={avatarColor}
                  onChange={(nextId, nextCol) => {
                    setAvatarId(nextId);
                    setAvatarColor(nextCol);
                  }}
                />

                {joinError && (
                  <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-semibold flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{joinError}</span>
                  </div>
                )}

                <button type="submit" disabled={joining} className="btn-primary w-full text-lg">
                  {t.play.joinButton}
                </button>
              </form>
            </div>

            {/* TAB 2: REJOIN EXISTING TEAM WITHOUT LOSING PROGRESS */}
            <div role="tabpanel" aria-labelledby={`${joinTabBaseId}-rejoin`} hidden={joinTab !== 'rejoin'}>
              <div className="space-y-5">
                <form onSubmit={handleRejoinByCode} className="elevated-card p-4 space-y-3">
                  <div className="font-extrabold text-sm">1. Pomocí obnovovacího kódu týmu</div>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Zadejte obnovovací kód vašeho týmu (získáte jej od moderátora – přenese tým i na jiný mobil bez ztráty bodů).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <label htmlFor="recovery-code" className="visually-hidden">
                      Obnovovací kód týmu
                    </label>
                    <input
                      id="recovery-code"
                      type="text"
                      required
                      minLength={4}
                      maxLength={8}
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="go"
                      value={recoveryCodeInput}
                      onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                      placeholder="K7P2M9"
                      className="w-full sm:flex-1 min-w-0 uppercase font-mono tracking-widest text-center font-bold text-lg"
                    />
                    <button type="submit" disabled={joining} className="btn-primary w-full sm:w-auto shrink-0">
                      Obnovit
                    </button>
                  </div>
                </form>

                <div className="elevated-card p-4 space-y-3">
                  <div className="font-extrabold text-sm">2. Výběrem odpojeného týmu z aktuální hry</div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rejoin-game-code" className="text-xs font-bold">
                      {t.play.joinCodeLabel}
                    </label>
                    <input
                      id="rejoin-game-code"
                      type="text"
                      maxLength={8}
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="A7B9K2"
                      className="uppercase font-mono tracking-widest text-center font-bold"
                    />
                  </div>

                  {loadingTeams && <p className="text-xs text-[var(--text-muted)] m-0">Načítám seznam týmů…</p>}

                  {!loadingTeams && joinCode.trim().length >= 6 && rejoinTeams.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] m-0">
                      Pro tento kód hry zatím nebyly nalezeny žádné týmy.
                    </p>
                  )}

                  {rejoinTeams.length > 0 && (
                    <ul className="list-none p-0 m-0 space-y-2">
                      {rejoinTeams.map((team) => (
                        <li
                          key={team.teamId}
                          className="surface-card p-3 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamAvatar avatarId={team.avatarId} avatarColor={team.avatarColor} size="sm" />
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{team.name}</div>
                              <div className="text-xs text-[var(--text-secondary)]">
                                {team.score.toLocaleString('cs-CZ')} b. •{' '}
                                {team.isConnected ? 'Online na jiném zařízení' : 'Offline – připraven k převzetí'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={joining || team.isConnected}
                            onClick={() => handleRejoinOfflineTeam(team)}
                            className="btn-primary !py-1.5 !px-3 !min-h-[38px] text-xs shrink-0"
                          >
                            {team.isConnected ? 'Vyžaduje kód' : 'Připojit zpět'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {joinError && (
                  <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-semibold flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{joinError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Reconnecting screen when token exists but state hasn't arrived yet (NEVER discards progress!)
  if (!gameState || !gameState.self) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
        <div className="surface-card p-6 max-w-sm w-full space-y-4">
          <div className="text-xl font-black">{t.app.reconnecting}</div>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Obnovujeme spojení s vaším týmem a skóre…
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void clientRef.current?.ensureConnected()}
              className="btn-primary w-full"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Zkusit znovu připojit
            </button>
            <button type="button" onClick={handleLeave} className="btn-secondary w-full text-sm">
              {t.play.leaveTeam}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const self = gameState.self;
  const q = gameState.currentQuestion;
  const isFinalRound = gameState.currentRound?.isFinal ?? false;

  return (
    <div className="min-h-screen flex flex-col pb-8">
      <a href="#play-main" className="skip-link visually-hidden">
        {t.app.skipToContent}
      </a>

      {/* Compact Mobile Top Header */}
      <header className="sticky top-0 z-30 px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openEditProfile}
            className="flex items-center gap-2.5 min-w-0 bg-transparent border-0 p-0 text-left text-inherit cursor-pointer"
            aria-label={`${t.play.editProfile}: ${self.teamName}`}
          >
            <TeamAvatar avatarId={self.avatarId} avatarColor={self.avatarColor} size="sm" />
            <div className="min-w-0">
              <div className="font-extrabold text-sm sm:text-base truncate leading-tight flex items-center gap-1">
                <span className="truncate">{self.teamName}</span>
                <Edit3 className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
              </div>
              <div className="text-xs font-bold text-[var(--accent)] tabular-nums">
                {self.score.toLocaleString('cs-CZ')} b. {self.rank > 0 ? `• #${self.rank}` : ''}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void clientRef.current?.ensureConnected()}
              className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full border-0 cursor-pointer ${
                connStatus === 'connected'
                  ? 'bg-[var(--success-soft)] text-[var(--success)]'
                  : 'bg-[var(--warning-soft)] text-[var(--warning)]'
              }`}
              aria-live="polite"
            >
              {connStatus === 'connected' ? (
                <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{connStatus === 'connected' ? t.app.connected : t.app.reconnecting}</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="play-main" tabIndex={-1} className="flex-1 max-w-lg w-full mx-auto px-4 pt-4 space-y-4">
        {/* Host Direct / Broadcast Messages */}
        {activeMessages.length > 0 && (
          <div role="status" aria-live="polite" className="space-y-2">
            {activeMessages.slice(-2).map((msg) => (
              <div
                key={msg.id}
                className="p-3.5 rounded-2xl bg-[var(--info-soft)] border-2 border-[var(--info)] flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <MessageSquare className="w-5 h-5 text-[var(--info)] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="text-xs font-extrabold uppercase text-[var(--info)]">
                      {t.play.hostMessageBadge}
                    </div>
                    <p className="m-0 text-sm font-semibold">{msg.text}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissMessage(msg.id)}
                  aria-label={t.app.close}
                  className="text-xs font-bold px-2 py-1 rounded bg-[var(--bg-surface)] cursor-pointer border border-[var(--border-subtle)]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bonus Tasks Bar (always accessible to team leader during the game) */}
        {gameState.bonusTasks.length > 0 && (() => {
          const pendingCount = self.taskClaims.filter((c) => c.status === 'Pending').length;
          const approvedCount = self.taskClaims.filter((c) => c.status === 'Approved').length;
          return (
            <button
              type="button"
              onClick={() => {
                setTaskFeedback(null);
                setTasksModalOpen(true);
              }}
              className="w-full surface-card p-3 px-4 flex items-center justify-between gap-2 text-left cursor-pointer border-2 border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Gift className="w-5 h-5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span className="font-extrabold text-sm truncate">
                  {t.play.bonusTasksTitle} ({gameState.bonusTasks.length})
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0 text-xs font-bold">
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
                    ⏳ {pendingCount}
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                    ✓ {approvedCount}
                  </span>
                )}
                <span className="text-[var(--accent)] font-extrabold">{t.play.bonusTasksBtn} →</span>
              </span>
            </button>
          );
        })()}

        {/* 1. LOBBY */}
        {gameState.state === 'Lobby' && (
          <section className="surface-card p-6 text-center space-y-5">
            <div className="flex justify-center">
              <TeamAvatar avatarId={self.avatarId} avatarColor={self.avatarColor} size="xl" />
            </div>
            <div>
              <h1 className="text-2xl font-black m-0">{t.play.inLobbyTitle}</h1>
              <p className="text-[var(--text-secondary)] mt-1 mb-0">{t.play.inLobbyDesc}</p>
            </div>
            <div className="elevated-card p-3.5 text-sm space-y-1">
              <div className="font-bold">
                {gameState.quizTitle} • {gameState.totalTeamsCount} týmů v lobby
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Kód pro obnovení týmu (při změně telefonu):{' '}
                <strong className="font-mono text-sm text-[var(--text-primary)]">{self.recoveryCode}</strong>
              </div>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <button type="button" onClick={openEditProfile} className="btn-primary">
                <Edit3 className="w-4 h-4" aria-hidden="true" />
                {t.play.editProfile} / Avatar
              </button>
              <button type="button" onClick={handleLeave} className="btn-secondary text-[var(--danger)]">
                <LogOut className="w-4 h-4" aria-hidden="true" />
                {t.play.leaveTeam}
              </button>
            </div>
          </section>
        )}

        {/* 2. QUIZ INTRO */}
        {gameState.state === 'QuizIntro' && (
          <section className="space-y-4">
            <div className="surface-card p-5 sm:p-6 space-y-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-black m-0">{gameState.quizTitle}</h1>
                {gameState.quizDescription && (
                  <p className="text-sm text-[var(--text-secondary)] m-0 leading-snug">
                    {gameState.quizDescription}
                  </p>
                )}
              </div>

              <div className="elevated-card p-4 space-y-2.5">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--accent)] m-0">
                  {t.screen.rulesHeading}
                </h2>
                <ol className="space-y-2 text-sm font-medium pl-5 m-0">
                  {gameState.quizRules.map((r, i) => (
                    <li key={i} className="leading-snug">
                      {r}
                    </li>
                  ))}
                </ol>
              </div>

              {gameState.bonusTasks.length > 0 && (
                <div className="elevated-card p-4 space-y-3 border border-[var(--accent)]/50">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--accent)] m-0 flex items-center gap-1.5">
                      <Gift className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{t.screen.bonusTasksHeading}</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskFeedback(null);
                        setTasksModalOpen(true);
                      }}
                      className="btn-secondary !py-1 !px-2.5 !min-h-[32px] text-xs"
                    >
                      {t.play.bonusTasksBtn} →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {gameState.bonusTasks.map((bt) => (
                      <div
                        key={bt.id}
                        className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2 text-sm">
                          <span className="font-extrabold leading-snug">{bt.title}</span>
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-black bg-[var(--accent)] text-[var(--accent-text)] tabular-nums">
                            +{bt.points} b.
                          </span>
                        </div>
                        {bt.description && (
                          <p className="text-xs text-[var(--text-secondary)] m-0 leading-snug">
                            {bt.description}
                          </p>
                        )}
                        <div className="text-[11px] font-bold text-[var(--text-muted)]">
                          Max. {bt.maxCompletionsPerTeam}× za hru na tým
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gameState.rounds.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-extrabold uppercase text-[var(--text-muted)]">
                    <span>{t.screen.roundsOverviewHeading}</span>
                    <span className="tabular-nums">
                      {gameState.rounds.length} kol •{' '}
                      {gameState.rounds.reduce((sum, r) => sum + r.questionCount, 0)} {t.screen.questionsCount}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {gameState.rounds.map((r) => (
                      <div
                        key={r.roundNumber}
                        className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-sm ${
                          r.isFinal
                            ? 'bg-[var(--accent-soft)]/50 border-[var(--accent)]'
                            : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <span className="font-bold truncate">
                          {r.isFinal ? '★ ' : `${r.roundNumber}. `}
                          {r.title}
                        </span>
                        <span className="text-xs font-extrabold text-[var(--text-secondary)] shrink-0 tabular-nums">
                          {r.questionCount} ot. • {r.pointMultiplier}×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-center text-[var(--text-muted)] m-0 pt-1">
                {t.play.waitingIntro}
              </p>
            </div>
          </section>
        )}

        {/* 3. ROUND INTRO (+ PreSelect Final Joker picker!) */}
        {gameState.state === 'RoundIntro' && gameState.currentRound && (
          <section className="surface-card p-6 space-y-5">
            <div className="text-center space-y-2">
              <span className="inline-block px-3.5 py-1 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-sm">
                {gameState.currentRound.isFinal
                  ? t.screen.finalRoundBadge
                  : `${t.screen.roundPrefix} ${gameState.currentRound.roundNumber}`}
              </span>
              <h1 className="text-2xl font-black m-0">{gameState.currentRound.title}</h1>
              {gameState.currentRound.description && (
                <p className="text-[var(--text-secondary)] m-0">{gameState.currentRound.description}</p>
              )}
            </div>

            {isFinalRound && gameState.jokerMode === 'PreSelect' && (
              <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border-2 border-[var(--accent)] space-y-4">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-6 h-6 text-[var(--accent)] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-extrabold m-0">
                      {formatTemplate(t.play.jokerPreSelectTitle, { count: gameState.jokerCount })}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-0">
                      {t.play.jokerPreSelectDesc}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {gameState.currentRound.questionIds.map((qId, idx) => {
                    const selected = preSelectedIds.includes(qId);
                    return (
                      <button
                        key={qId}
                        type="button"
                        onClick={() => togglePreSelectJoker(qId)}
                        aria-pressed={selected}
                        className={`min-h-[48px] rounded-xl font-black text-lg border-2 cursor-pointer transition-all ${
                          selected
                            ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)] scale-105'
                            : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)]'
                        }`}
                      >
                        #{idx + 1}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={savePreSelectJokers}
                  disabled={preSelectedIds.length === 0}
                  className="btn-primary w-full"
                >
                  {formatTemplate(t.play.jokerPreSelectSave, {
                    selected: preSelectedIds.length,
                    max: gameState.jokerCount
                  })}
                </button>
                {jokerSavedToast && (
                  <p role="status" className="text-center text-sm font-bold text-[var(--success)] m-0">
                    ✓ {t.play.jokerSaved}
                  </p>
                )}
              </div>
            )}

            {isFinalRound && gameState.jokerMode === 'OnDemand' && (
              <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border-2 border-[var(--accent)] text-sm font-semibold flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span>
                  {formatTemplate(t.screen.jokerOnDemandBanner, { count: self.jokersRemaining })}
                </span>
              </div>
            )}
          </section>
        )}

        {/* 4A. QUESTION READY (Waiting for host to start countdown!) */}
        {gameState.state === 'QuestionReady' && q && (
          <section className="surface-card p-6 text-center space-y-4 border-2 border-[var(--info)]">
            <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
              <span>
                {t.screen.questionLabel} {q.questionNumberInRound}/{q.totalQuestionsInRound}
              </span>
              <span className="text-[var(--accent)]">
                {q.basePoints} b. {q.speedBonusMax > 0 ? `+${q.speedBonusMax}` : ''}
              </span>
            </div>
            <Timer className="w-12 h-12 text-[var(--info)] mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-black m-0 leading-snug">{q.text}</h1>
            {q.isFinalRound && gameState.jokerMode === 'PreSelect' && self.currentQuestionJokerActive && (
              <div className="p-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] font-black text-sm inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {t.play.jokerActiveBadge}
              </div>
            )}
            <div className="p-3.5 rounded-xl bg-[var(--info-soft)] text-[var(--info)] font-bold text-sm">
              Moderátor čte otázku – připravte se, odpočet za chvíli začne!
            </div>
          </section>
        )}

        {/* 4B. QUESTION ACTIVE */}
        {gameState.state === 'QuestionActive' && q && (
          <section className="space-y-4">
            <div className="surface-card p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
                <span>
                  {t.screen.questionLabel} {q.questionNumberInRound}/{q.totalQuestionsInRound}
                </span>
                <span className="text-[var(--accent)]">
                  {q.basePoints} b. {q.speedBonusMax > 0 ? `+${q.speedBonusMax}` : ''}
                </span>
              </div>

              <CountdownBar
                endsAtUtc={q.endsAtUtc}
                timeLimitSeconds={q.timeLimitSeconds}
                gracePeriodSeconds={q.gracePeriodSeconds}
                isPaused={q.isPaused}
                pausedRemainingSeconds={q.pausedRemainingSeconds}
                clockOffsetMs={clockOffsetMs}
              />

              <h1 className="text-lg sm:text-xl font-black m-0 leading-snug">{q.text}</h1>
            </div>

            {q.isPaused && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-[var(--warning-soft)] border-2 border-[var(--warning)] text-[var(--warning)] font-bold flex items-center gap-3"
              >
                <PauseCircle className="w-6 h-6 shrink-0" aria-hidden="true" />
                <span>{t.play.pausedNotice}</span>
              </div>
            )}

            {self.hasSubmittedCurrentQuestion ? (
              <div className="surface-card p-6 text-center space-y-3 border-2 border-[var(--success)]">
                <CheckCircle2 className="w-14 h-14 text-[var(--success)] mx-auto" aria-hidden="true" />
                <h2 className="text-2xl font-black m-0">{t.play.submittedTitle}</h2>
                {submitSeq && (
                  <div className="inline-block px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold text-sm">
                    {t.play.submittedOrder}: #{submitSeq}
                  </div>
                )}
                {self.currentQuestionJokerActive && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-xs ml-2">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    {t.play.jokerActiveBadge}
                  </div>
                )}
                <div className="elevated-card p-3 font-bold text-base">
                  {self.submittedOrderedItems
                    ? self.submittedOrderedItems.join(' → ')
                    : self.submittedAnswerText}
                </div>
                <p className="text-sm text-[var(--text-secondary)] m-0">{t.play.submittedWaiting}</p>
              </div>
            ) : (
              <form onSubmit={handleAnswerSubmit} className="space-y-4">
                {q.isFinalRound && gameState.jokerMode === 'PreSelect' && self.currentQuestionJokerActive && (
                  <div className="p-3.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-text)] font-black text-center flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5" aria-hidden="true" />
                    <span>{t.play.jokerActiveBadge}</span>
                  </div>
                )}

                {q.isFinalRound && gameState.jokerMode === 'OnDemand' && (
                  <button
                    type="button"
                    disabled={self.jokersRemaining <= 0 || q.isPaused}
                    aria-pressed={useJoker}
                    onClick={() => setUseJoker((v) => !v)}
                    className={`w-full p-3.5 rounded-2xl border-2 font-extrabold flex items-center justify-between gap-2 cursor-pointer transition-all ${
                      useJoker
                        ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                        : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--accent)]'
                    } disabled:opacity-40`}
                  >
                    <span className="flex items-center gap-2 text-left text-sm">
                      <Sparkles className="w-5 h-5 shrink-0" aria-hidden="true" />
                      {useJoker ? t.play.jokerActiveBadge : t.play.jokerActivateToggle}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-black/15 shrink-0">
                      {t.play.jokersLeft}: {self.jokersRemaining}
                    </span>
                  </button>
                )}

                {q.type === 'MultipleChoice' && q.options && (
                  <fieldset className="border-0 p-0 m-0 space-y-2.5" disabled={q.isPaused}>
                    <legend className="visually-hidden">Vyberte správnou odpověď</legend>
                    {q.options.map((opt, idx) => {
                      const chosen = selectedOption === opt;
                      return (
                        <button
                          key={idx}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setSelectedOption(opt)}
                          className={`w-full text-left p-4 rounded-2xl border-2 font-bold text-base sm:text-lg flex items-center gap-3.5 cursor-pointer min-h-[60px] transition-all ${
                            chosen
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-default)]'
                          }`}
                        >
                          <span
                            className={`w-9 h-9 rounded-xl font-black flex items-center justify-center shrink-0 ${
                              chosen
                                ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                                : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                            }`}
                          >
                            {OPTION_LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </fieldset>
                )}

                {q.type === 'TextInput' && (
                  <div className="surface-card p-4 space-y-2">
                    <label htmlFor="player-text-answer" className="block font-bold text-sm">
                      {t.play.textAnswerLabel}
                    </label>
                    <input
                      id="player-text-answer"
                      name="answerText"
                      type="text"
                      required
                      disabled={q.isPaused}
                      autoComplete="off"
                      enterKeyHint="send"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                          void handleAnswerSubmit();
                        }
                      }}
                      placeholder={t.play.textAnswerPlaceholder}
                      className="w-full"
                    />
                  </div>
                )}

                {q.type === 'Ordering' && (
                  <div className="surface-card p-4 space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-secondary)] m-0">
                      {t.play.orderingInstructions}
                    </p>
                    <ol className="list-none p-0 m-0 space-y-2">
                      {orderedItems.map((item, idx) => (
                        <li
                          key={item}
                          draggable={!q.isPaused}
                          onDragStart={() => setDragIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragIndex === null || dragIndex === idx) return;
                            const next = [...orderedItems];
                            const [moved] = next.splice(dragIndex, 1);
                            next.splice(idx, 0, moved);
                            setOrderedItems(next);
                            setDragIndex(null);
                          }}
                          className="elevated-card p-3 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                            <span className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-sm flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-base leading-snug">{item}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0 || q.isPaused}
                              onClick={() => moveOrderItem(idx, -1)}
                              aria-label={`${t.play.moveUp}: ${item}`}
                              className="btn-secondary !p-2 !min-h-[40px] !min-w-[40px]"
                            >
                              <ArrowUp className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === orderedItems.length - 1 || q.isPaused}
                              onClick={() => moveOrderItem(idx, 1)}
                              aria-label={`${t.play.moveDown}: ${item}`}
                              className="btn-secondary !p-2 !min-h-[40px] !min-w-[40px]"
                            >
                              <ArrowDown className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {submitError && (
                  <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-bold flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={q.isPaused || submitting}
                  className="btn-primary w-full text-lg !py-3.5"
                >
                  <Send className="w-5 h-5" aria-hidden="true" />
                  {submitting ? t.play.submitting : t.play.submitAnswer}
                </button>
              </form>
            )}
          </section>
        )}

        {/* 5. QUESTION LOCKED */}
        {gameState.state === 'QuestionLocked' && (
          <section className="surface-card p-6 text-center space-y-4">
            <h1 className="text-2xl font-black m-0">{t.states.QuestionLocked}</h1>
            <p className="text-[var(--text-secondary)] m-0">{t.play.lockedNotice}</p>
            {self.hasSubmittedCurrentQuestion && (
              <div className="elevated-card p-4 font-bold">
                {self.submittedOrderedItems
                  ? self.submittedOrderedItems.join(' → ')
                  : self.submittedAnswerText}
              </div>
            )}
          </section>
        )}

        {/* 6. QUESTION REVEAL */}
        {gameState.state === 'QuestionReveal' && q && (
          <section className="space-y-4">
            <div
              className={`surface-card p-6 text-center space-y-3 border-2 ${
                self.lastEvaluation === 'Correct'
                  ? 'border-[var(--success)] bg-[var(--success-soft)]/30'
                  : self.lastEvaluation === 'HalfPoint'
                    ? 'border-[var(--warning)] bg-[var(--warning-soft)]/30'
                    : 'border-[var(--danger)] bg-[var(--danger-soft)]/25'
              }`}
            >
              {self.lastEvaluation === 'Correct' ? (
                <CheckCircle2 className="w-12 h-12 text-[var(--success)] mx-auto" aria-hidden="true" />
              ) : self.lastEvaluation === 'HalfPoint' ? (
                <HelpCircle className="w-12 h-12 text-[var(--warning)] mx-auto" aria-hidden="true" />
              ) : (
                <XCircle className="w-12 h-12 text-[var(--danger)] mx-auto" aria-hidden="true" />
              )}

              <h1 className="text-2xl font-black m-0">
                {self.lastEvaluation === 'Correct'
                  ? t.play.revealCorrect
                  : self.lastEvaluation === 'HalfPoint'
                    ? t.play.revealHalf
                    : self.hasSubmittedCurrentQuestion
                      ? t.play.revealWrong
                      : t.play.revealMissed}
              </h1>

              <div className="text-3xl font-black tabular-nums">
                {self.lastPointsAwarded > 0 ? `+${self.lastPointsAwarded}` : self.lastPointsAwarded} b.
              </div>

              <div className="elevated-card p-3.5 text-left space-y-1">
                <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                  {t.screen.correctAnswerLabel}
                </div>
                <div className="font-extrabold text-base">{q.correctAnswer}</div>
              </div>
            </div>

            <div className="surface-card p-4 flex items-center justify-around text-center">
              <div>
                <div className="text-xs text-[var(--text-muted)] font-bold">{t.play.yourRank}</div>
                <div className="text-2xl font-black">#{self.rank}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] font-bold">{t.play.yourScore}</div>
                <div className="text-2xl font-black text-[var(--accent)] tabular-nums">
                  {self.score.toLocaleString('cs-CZ')}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 7 & 8. LEADERBOARD / FINISHED */}
        {(gameState.state === 'Leaderboard' || gameState.state === 'Finished') && (
          <section className="space-y-4">
            <h1 className="text-2xl font-black text-center m-0">
              {gameState.state === 'Finished' ? t.play.gameFinishedTitle : t.screen.leaderboardTitle}
            </h1>
            <LeaderboardView
              entries={gameState.leaderboard}
              highlightTeamId={self.teamId}
              showPodium={gameState.state === 'Finished'}
            />
          </section>
        )}
      </main>

      {/* Bonus Tasks / Challenges Modal */}
      <ModalDialog
        open={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        title={t.play.bonusTasksTitle}
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] m-0">
            {t.play.bonusTasksHint}
          </p>

          {taskFeedback && (
            <div
              role="status"
              className={`p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${
                taskFeedback.kind === 'success'
                  ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]'
                  : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]'
              }`}
            >
              {taskFeedback.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{taskFeedback.text}</span>
            </div>
          )}

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-0.5">
            {gameState.bonusTasks.map((task) => {
              const myClaims = self.taskClaims.filter((c) => c.taskId === task.id);
              const approvedCount = myClaims.filter((c) => c.status === 'Approved').length;
              const pendingCount = myClaims.filter((c) => c.status === 'Pending').length;
              const reachedMax = approvedCount >= task.maxCompletionsPerTeam;
              const waitingMax = !reachedMax && approvedCount + pendingCount >= task.maxCompletionsPerTeam;
              const canClaim = !reachedMax && !waitingMax && gameState.state !== 'Finished';

              return (
                <div key={task.id} className="elevated-card p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-base leading-snug">{task.title}</div>
                      {task.description && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1 mb-0 leading-snug">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-black bg-[var(--accent)] text-[var(--accent-text)] tabular-nums">
                      +{task.points} b.
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    <span className="text-[var(--text-muted)] tabular-nums">
                      Splněno: {approvedCount} / {task.maxCompletionsPerTeam}×
                    </span>
                    {reachedMax && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                        ✓ {t.play.bonusTaskMaxReached}
                      </span>
                    )}
                    {pendingCount > 0 && !reachedMax && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {t.play.bonusTaskPendingStatus}
                      </span>
                    )}
                  </div>

                  {canClaim && (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        maxLength={200}
                        aria-label={`${t.play.bonusTaskNotePlaceholder} (${task.title})`}
                        value={taskNotes[task.id] ?? ''}
                        onChange={(e) =>
                          setTaskNotes((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        placeholder={t.play.bonusTaskNotePlaceholder}
                        className="w-full text-sm !min-h-[42px] !py-2"
                      />
                      <button
                        type="button"
                        disabled={claimingTaskId !== null}
                        onClick={() => void handleClaimBonusTask(task.id)}
                        className="btn-primary w-full text-sm !py-2"
                      >
                        <Gift className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {claimingTaskId === task.id ? t.play.submitting : t.play.bonusTaskClaimBtn}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {self.taskClaims.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                {t.play.bonusTaskHistoryTitle}
              </div>
              <ul className="list-none p-0 m-0 space-y-1.5 max-h-40 overflow-y-auto">
                {self.taskClaims.map((claim) => {
                  const taskTitle =
                    gameState.bonusTasks.find((bt) => bt.id === claim.taskId)?.title ?? claim.taskId;
                  return (
                    <li
                      key={claim.id}
                      className="p-2.5 rounded-xl bg-[var(--bg-elevated)] text-xs flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold truncate">{taskTitle}</div>
                        {claim.hostComment && (
                          <div className="text-[var(--text-secondary)] mt-0.5">
                            Moderátor: „{claim.hostComment}“
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full font-extrabold tabular-nums ${
                          claim.status === 'Approved'
                            ? 'bg-[var(--success-soft)] text-[var(--success)]'
                            : claim.status === 'Rejected'
                              ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                              : 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        }`}
                      >
                        {claim.status === 'Approved'
                          ? `${t.play.bonusTaskApproved} +${claim.pointsAwarded} b.`
                          : claim.status === 'Rejected'
                            ? t.play.bonusTaskRejected
                            : '⏳ Čeká'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={() => setTasksModalOpen(false)} className="btn-secondary">
              {t.app.close}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Edit Team Profile & Kahoot Avatar Modal */}
      <ModalDialog
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title={t.play.editProfile}
      >
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="elevated-card p-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-secondary)]">
              Obnovovací kód týmu:
            </span>
            <span className="font-mono font-black text-base tracking-widest px-2.5 py-0.5 rounded bg-[var(--bg-surface)]">
              {self.recoveryCode}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-team-name" className="font-bold text-sm">
              {t.play.teamNameLabel}
            </label>
            <input
              id="edit-team-name"
              type="text"
              required
              minLength={2}
              maxLength={32}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>

          <AvatarBuilder
            avatarId={avatarId}
            avatarColor={avatarColor}
            onChange={(nextId, nextCol) => {
              setAvatarId(nextId);
              setAvatarColor(nextCol);
            }}
          />

          {profileError && (
            <div role="alert" className="p-2.5 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-xs font-bold">
              {profileError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditProfileOpen(false)} className="btn-secondary">
              {t.app.cancel}
            </button>
            <button type="submit" className="btn-primary">
              {t.app.save}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
