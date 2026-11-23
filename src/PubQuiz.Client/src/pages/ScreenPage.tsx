import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Gift,
  HelpCircle,
  Info,
  Lightbulb,
  Maximize2,
  PauseCircle,
  Sparkles,
  Timer,
  Users,
  Volume2,
  XCircle
} from 'lucide-react';
import { api } from '../services/api';
import { createQuizSignalRClient, type ConnectionStatus } from '../services/signalr';
import type { GameStateBroadcast } from '../types/quiz';
import { useI18n, formatTemplate } from '../i18n/I18nContext';
import { QrCodeDisplay } from '../components/QrCodeDisplay';
import { TeamAvatar } from '../components/TeamAvatar';
import { CountdownBar } from '../components/CountdownBar';
import { MediaPlayer } from '../components/MediaPlayer';
import { LeaderboardView } from '../components/LeaderboardView';
import { ThemeToggle } from '../components/ThemeToggle';

const SCREEN_TOKEN_KEY = 'pubquiz-screen-token';
const HOST_TOKEN_KEY = 'pubquiz-host-token';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ScreenPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SCREEN_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [screenPin, setScreenPin] = useState('');
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const [gameState, setGameState] = useState<GameStateBroadcast | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const autoPairedRef = useRef(false);

  useEffect(() => {
    document.title = gameState?.quizTitle
      ? `${gameState.quizTitle} – Projektor | PepQuiz Engine`
      : 'Projektor (/screen) | PepQuiz Engine';
  }, [gameState?.quizTitle]);

  // Passwordless opening when launched from /host:
  // 1) One-time ?launch=<token> link (works on another computer / TV), OR
  // 2) Active Host JWT in the same browser (localStorage).
  useEffect(() => {
    if (autoPairedRef.current) return;

    const launchToken = searchParams.get('launch');
    if (launchToken) {
      autoPairedRef.current = true;
      setPairing(true);
      api
        .pairScreen({ launchToken })
        .then((res) => {
          setToken(res.token);
          try {
            localStorage.setItem(SCREEN_TOKEN_KEY, res.token);
          } catch {}
          setSearchParams({}, { replace: true });
          setPairError(null);
        })
        .catch((err) => {
          setSearchParams({}, { replace: true });
          setPairError(err instanceof Error ? err.message : 'Jednorázový odkaz vypršel nebo byl již použit. Zadejte PIN moderátora.');
        })
        .finally(() => setPairing(false));
      return;
    }

    if (token) return;

    let hostToken: string | null = null;
    try {
      hostToken = localStorage.getItem(HOST_TOKEN_KEY);
    } catch {}

    if (hostToken) {
      autoPairedRef.current = true;
      setPairing(true);
      api
        .issueScreenTokenFromHost(hostToken)
        .then((res) => {
          setToken(res.token);
          try {
            localStorage.setItem(SCREEN_TOKEN_KEY, res.token);
          } catch {}
          setPairError(null);
        })
        .catch(() => {
          // Host token expired or invalid — fall back cleanly to PIN prompt
        })
        .finally(() => setPairing(false));
    }
  }, [searchParams, setSearchParams, token]);

  // Connect SignalR once paired
  useEffect(() => {
    if (!token) return;
    let active = true;
    const client = createQuizSignalRClient(token, {
      onState: (snap) => {
        if (active) setGameState(snap);
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
            localStorage.removeItem(SCREEN_TOKEN_KEY);
          } catch {}
        }
      }
    });

    client.start().catch(() => {
      // Fallback initial check to see if token expired
      api.verifyToken(token).catch(() => {
        if (active) {
          setToken(null);
          try {
            localStorage.removeItem(SCREEN_TOKEN_KEY);
          } catch {}
        }
      });
    });

    return () => {
      active = false;
      client.stop();
    };
  }, [token]);

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairError(null);
    setPairing(true);
    try {
      const res = await api.pairScreen({ pin: screenPin.trim() });
      setToken(res.token);
      setScreenPin('');
      try {
        localStorage.setItem(SCREEN_TOKEN_KEY, res.token);
      } catch {}
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Nesprávný PIN moderátora.');
    } finally {
      setPairing(false);
    }
  };

  const unlockAudioAndFullscreen = () => {
    // Play silent audio buffer to unlock browser autoplay policy for audio/video questions
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
      }
    } catch {}
    setAudioUnlocked(true);
  };

  const enterFullscreen = () => {
    unlockAudioAndFullscreen();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // --- Pairing Screen (before JWT is issued) ---
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="surface-card p-8 max-w-md w-full space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black m-0">{t.auth.screenTitle}</h1>
            <ThemeToggle />
          </div>
          <p className="text-sm text-[var(--text-secondary)] m-0">{t.auth.screenHint}</p>
          <form onSubmit={handlePairSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="screen-pin" className="font-semibold text-sm">
                {t.auth.screenCodeLabel}
              </label>
              <input
                id="screen-pin"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                value={screenPin}
                onChange={(e) => setScreenPin(e.target.value)}
                placeholder="••••••"
                className="tracking-widest font-mono text-center text-2xl font-bold"
              />
            </div>
            {pairError && (
              <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-semibold flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{pairError}</span>
              </div>
            )}
            <button type="submit" disabled={pairing} className="btn-primary w-full text-lg">
              {t.auth.screenSubmit}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="text-2xl font-bold">{t.app.connecting}</div>
          <div className="text-sm text-[var(--text-muted)]">{connStatus}</div>
        </div>
      </main>
    );
  }

  const q = gameState.currentQuestion;
  const banner = gameState.screenBanner;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden select-none">
      {/* Live Host Banner Overlay (short notice / hint / apology) */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            role="status"
            aria-live="polite"
            className={`w-full px-6 py-4 text-center font-extrabold text-xl sm:text-2xl shadow-lg flex items-center justify-center gap-3 z-40 ${
              banner.kind === 'warning'
                ? 'bg-[var(--warning)] text-[#14100a]'
                : banner.kind === 'hint'
                  ? 'bg-[var(--success)] text-white'
                  : 'bg-[var(--info)] text-white'
            }`}
          >
            {banner.kind === 'warning' ? (
              <AlertTriangle className="w-7 h-7 shrink-0" aria-hidden="true" />
            ) : banner.kind === 'hint' ? (
              <Lightbulb className="w-7 h-7 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="w-7 h-7 shrink-0" aria-hidden="true" />
            )}
            <span>{banner.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle top status bar (no game controls!) */}
      <header className="px-6 py-3 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)]/60 bg-[var(--bg-surface)]/80">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-black text-lg sm:text-xl tracking-tight truncate">
            {gameState.quizTitle ?? t.app.name}
          </span>
          {gameState.currentRound && gameState.state !== 'Lobby' && gameState.state !== 'QuizIntro' && (
            <span className="px-3 py-1 rounded-full text-sm font-bold bg-[var(--accent-soft)] text-[var(--accent)] min-w-0 max-w-[40ch] truncate">
              {gameState.currentRound.isFinal
                ? t.screen.finalRoundBadge
                : `${t.screen.roundPrefix} ${gameState.currentRound.roundNumber}: ${gameState.currentRound.title}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!audioUnlocked && (
            <button
              type="button"
              onClick={unlockAudioAndFullscreen}
              className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span className="hidden md:inline">{t.screen.enableAudioBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={enterFullscreen}
            aria-label={t.screen.fullscreenBtn}
            className="btn-secondary !p-2 !min-h-[36px] !min-w-[36px]"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Projector Canvas */}
      <main className="flex-1 flex flex-col justify-center px-6 py-6 sm:px-12 sm:py-8 max-w-7xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {/* 1. LOBBY */}
          {gameState.state === 'Lobby' && (
            <motion.section
              key="lobby"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
            >
              <div className="lg:col-span-5 flex flex-col items-center text-center surface-card p-8 space-y-5">
                <h1 className="text-3xl sm:text-4xl font-black m-0">
                  {gameState.quizTitle ?? t.app.name}
                </h1>
                <p className="text-lg font-semibold text-[var(--text-secondary)] m-0">
                  {t.screen.scanToJoin}
                </p>
                <QrCodeDisplay value={gameState.joinUrl} size={260} label={`QR kód: ${gameState.joinUrl}`} />
                <div className="w-full space-y-2">
                  <div className="text-sm text-[var(--text-muted)]">{t.screen.orVisit}</div>
                  <div className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] font-mono text-base sm:text-lg font-bold break-all">
                    {gameState.joinUrl}
                  </div>
                  <div className="pt-1 flex items-center justify-center gap-3">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">
                      {t.screen.joinCodeLabel}:
                    </span>
                    <span className="px-4 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] font-mono text-2xl font-black tracking-widest">
                      {gameState.joinCode}
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl sm:text-3xl font-extrabold m-0 flex items-center gap-3">
                    <Users className="w-8 h-8 text-[var(--accent)]" aria-hidden="true" />
                    {t.screen.teamsJoined} ({gameState.totalTeamsCount})
                  </h2>
                </div>

                {gameState.leaderboard.length === 0 ? (
                  <div className="surface-card p-12 text-center text-xl text-[var(--text-muted)]">
                    {t.screen.waitingForTeams}
                  </div>
                ) : (
                  <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-4" role="list">
                    <AnimatePresence>
                      {gameState.leaderboard.map((team) => (
                        <motion.li
                          key={team.teamId}
                          layout
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.85, opacity: 0 }}
                          className="surface-card p-4 flex items-center gap-4"
                        >
                          <TeamAvatar avatarId={team.avatarId} avatarColor={team.avatarColor} size="lg" />
                          <div className="min-w-0">
                            <div className="font-extrabold text-xl truncate">{team.name}</div>
                            <div className="text-sm font-semibold text-[var(--success)]">
                              {team.isConnected ? '● Připraveno' : '○ Odpojeno'}
                            </div>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </motion.section>
          )}

          {/* 2. QUIZ INTRO */}
          {gameState.state === 'QuizIntro' && (
            <motion.section
              key="quiz-intro"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto w-full space-y-8"
            >
              <div className="text-center space-y-3">
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight m-0">
                  {gameState.quizTitle}
                </h1>
                {gameState.quizDescription && (
                  <p className="text-xl sm:text-2xl text-[var(--text-secondary)] m-0">
                    {gameState.quizDescription}
                  </p>
                )}
              </div>

              <div className="surface-card p-8 space-y-5">
                <h2 className="text-2xl font-extrabold text-[var(--accent)] m-0">
                  {t.screen.rulesHeading}
                </h2>
                <ol className="space-y-4 text-lg sm:text-2xl font-medium pl-7 m-0">
                  {gameState.quizRules.map((rule, idx) => (
                    <li key={idx} className="leading-snug">
                      {rule}
                    </li>
                  ))}
                </ol>
              </div>

              {gameState.bonusTasks.length > 0 && (
                <div className="surface-card p-6 sm:p-8 space-y-4 border-2 border-[var(--accent)]/60">
                  <h2 className="text-2xl font-extrabold text-[var(--accent)] m-0 flex items-center gap-2.5">
                    <Gift className="w-7 h-7 shrink-0" aria-hidden="true" />
                    <span>{t.screen.bonusTasksHeading}</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {gameState.bonusTasks.map((task) => (
                      <div key={task.id} className="elevated-card p-4 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-black text-lg leading-tight">{task.title}</span>
                          <span className="shrink-0 px-2.5 py-1 rounded-full text-sm font-black bg-[var(--accent)] text-[var(--accent-text)] tabular-nums">
                            +{task.points} b.
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm sm:text-base text-[var(--text-secondary)] m-0 leading-snug">
                            {task.description}
                          </p>
                        )}
                        <div className="text-xs font-extrabold uppercase text-[var(--text-muted)] pt-1">
                          Max. {task.maxCompletionsPerTeam}× za hru na tým • hlásí vedoucí týmu moderátorovi
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gameState.rounds.length > 0 && (
                <div className="surface-card p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-extrabold text-[var(--accent)] m-0">
                      {t.screen.roundsOverviewHeading}
                    </h2>
                    <span className="text-sm font-bold text-[var(--text-muted)] tabular-nums">
                      {gameState.rounds.length} kol •{' '}
                      {gameState.rounds.reduce((sum, r) => sum + r.questionCount, 0)} {t.screen.questionsCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {gameState.rounds.map((r) => (
                      <div
                        key={r.roundNumber}
                        className={`px-4 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-base ${
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
            </motion.section>
          )}

          {/* 3. ROUND INTRO */}
          {gameState.state === 'RoundIntro' && gameState.currentRound && (
            <motion.section
              key={`round-${gameState.currentRound.roundNumber}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              className="max-w-4xl mx-auto w-full text-center space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-xl tracking-wide">
                {gameState.currentRound.isFinal
                  ? t.screen.finalRoundBadge
                  : `${t.screen.roundPrefix} ${gameState.currentRound.roundNumber}`}
              </div>

              <h1 className="text-4xl sm:text-6xl font-black tracking-tight m-0">
                {gameState.currentRound.title}
              </h1>

              {gameState.currentRound.description && (
                <p className="text-2xl sm:text-3xl text-[var(--text-secondary)] m-0">
                  {gameState.currentRound.description}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <div className="surface-card px-6 py-4 text-xl font-bold">
                  {gameState.currentRound.questionCount} {t.screen.questionsCount}
                </div>
                <div className="surface-card px-6 py-4 text-xl font-bold text-[var(--accent)]">
                  {t.screen.pointsMultiplier}: {gameState.currentRound.pointMultiplier}×
                </div>
              </div>

              {gameState.currentRound.isFinal && (
                <div className="p-6 rounded-2xl bg-[var(--accent-soft)] border-2 border-[var(--accent)] text-xl sm:text-2xl font-extrabold flex items-center justify-center gap-3">
                  <Sparkles className="w-8 h-8 text-[var(--accent)] shrink-0" aria-hidden="true" />
                  <span>
                    {formatTemplate(
                      gameState.jokerMode === 'PreSelect'
                        ? t.screen.jokerPreSelectBanner
                        : t.screen.jokerOnDemandBanner,
                      { count: gameState.jokerCount }
                    )}
                  </span>
                </div>
              )}
            </motion.section>
          )}

          {/* 4. QUESTION READY & QUESTION ACTIVE */}
          {(gameState.state === 'QuestionReady' || gameState.state === 'QuestionActive') && q && (
            <motion.section
              key={`q-stage-${q.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6 w-full"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="px-4 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] font-black text-lg">
                    {t.screen.questionLabel} {q.questionNumberInRound} / {q.totalQuestionsInRound}
                  </span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] font-bold text-base">
                    {t.questionTypes[q.type]}
                  </span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] font-bold text-base text-[var(--accent)]">
                    {q.basePoints} b. {q.speedBonusMax > 0 ? `(+${q.speedBonusMax})` : ''}
                  </span>
                </div>

                {gameState.state === 'QuestionReady' ? (
                  <div className="px-4 py-1.5 rounded-full bg-[var(--info-soft)] text-[var(--info)] font-extrabold text-base flex items-center gap-2">
                    <Timer className="w-5 h-5" aria-hidden="true" />
                    <span>{t.host.manualStartBadge} ({Math.round(q.timeLimitSeconds)} s)</span>
                  </div>
                ) : (
                  <div className="text-lg font-extrabold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[var(--success)]" aria-hidden="true" />
                    <span>
                      {t.screen.answeredProgress}: {gameState.answeredTeamsCount} / {gameState.totalTeamsCount}
                    </span>
                  </div>
                )}
              </div>

              {gameState.state === 'QuestionActive' ? (
                <CountdownBar
                  endsAtUtc={q.endsAtUtc}
                  timeLimitSeconds={q.timeLimitSeconds}
                  gracePeriodSeconds={q.gracePeriodSeconds}
                  isPaused={q.isPaused}
                  pausedRemainingSeconds={q.pausedRemainingSeconds}
                  clockOffsetMs={clockOffsetMs}
                  large
                />
              ) : (
                <div className="w-full h-5 rounded-full bg-[var(--bg-subtle)] overflow-hidden" aria-hidden="true">
                  <div className="h-full w-full rounded-full bg-[var(--info)] opacity-55" />
                </div>
              )}

              {gameState.state === 'QuestionActive' && q.isPaused && (
                <div
                  role="alert"
                  className="p-5 rounded-2xl bg-[var(--warning-soft)] border-2 border-[var(--warning)] text-[var(--warning)] text-2xl sm:text-3xl font-black text-center flex items-center justify-center gap-3"
                >
                  <PauseCircle className="w-9 h-9" aria-hidden="true" />
                  <span>{t.screen.pausedOverlay}</span>
                </div>
              )}

              <div className="surface-card p-6 sm:p-10 space-y-6">
                <h1 className="text-3xl sm:text-5xl font-black leading-tight text-center m-0">
                  {q.text}
                </h1>

                {q.media && q.media.playbackMode === 'duringQuestion' && (
                  <MediaPlayer
                    media={q.media}
                    token={token}
                    autoPlay={gameState.state === 'QuestionActive'}
                    isPaused={gameState.state === 'QuestionReady' || q.isPaused}
                    large
                  />
                )}

                {q.type === 'MultipleChoice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {q.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className="elevated-card p-5 flex items-center gap-4 text-xl sm:text-2xl font-bold"
                      >
                        <span className="w-11 h-11 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] font-black flex items-center justify-center shrink-0">
                          {OPTION_LETTERS[idx] ?? idx + 1}
                        </span>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'Ordering' && q.options && (
                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    {q.options.map((item, idx) => (
                      <span
                        key={idx}
                        className="elevated-card px-5 py-3 text-xl font-bold"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Live answered indicators strip (during active voting) */}
              {gameState.state === 'QuestionActive' && gameState.questionOutcomes.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {gameState.questionOutcomes.map((o) => (
                    <div
                      key={o.teamId}
                      className={`px-4 py-2 rounded-full border-2 font-bold flex items-center gap-2 transition-all ${
                        o.hasAnswered
                          ? 'bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      <TeamAvatar avatarId={o.avatarId} avatarColor={o.avatarColor} size="sm" />
                      <span>{o.teamName}</span>
                      {o.hasAnswered && <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          )}

          {/* 5. QUESTION LOCKED */}
          {gameState.state === 'QuestionLocked' && q && (
            <motion.section
              key={`q-locked-${q.id}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto w-full text-center space-y-8"
            >
              <div className="surface-card p-10 space-y-4">
                <Timer className="w-16 h-16 text-[var(--accent)] mx-auto" aria-hidden="true" />
                <h1 className="text-3xl sm:text-5xl font-black m-0">{t.screen.votingLockedTitle}</h1>
                <p className="text-xl text-[var(--text-secondary)] m-0">{t.screen.votingLockedSubtitle}</p>
                <p className="text-2xl font-bold pt-4 text-[var(--text-primary)] m-0">{q.text}</p>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                {gameState.questionOutcomes.map((o) => (
                  <div
                    key={o.teamId}
                    className={`px-4 py-2.5 rounded-2xl border-2 font-bold flex items-center gap-2.5 ${
                      o.hasAnswered
                        ? 'bg-[var(--bg-surface)] border-[var(--accent)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-60'
                    }`}
                  >
                    <TeamAvatar avatarId={o.avatarId} avatarColor={o.avatarColor} size="sm" />
                    <span>{o.teamName}</span>
                    {o.hasAnswered && o.elapsedSeconds != null && (
                      <span className="text-sm text-[var(--text-muted)] tabular-nums">
                        {o.elapsedSeconds.toFixed(1)}s
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* 6. QUESTION REVEAL */}
          {gameState.state === 'QuestionReveal' && q && (
            <motion.section
              key={`q-reveal-${q.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6 w-full"
            >
              <p className="text-xl sm:text-2xl text-center font-bold text-[var(--text-secondary)] m-0">
                {q.text}
              </p>

              <div className="surface-card p-6 sm:p-8 border-2 border-[var(--success)] bg-[var(--success-soft)]/35 text-center space-y-4">
                <div className="text-sm uppercase tracking-wider font-extrabold text-[var(--success)]">
                  {q.type === 'Ordering' ? t.screen.correctOrderLabel : t.screen.correctAnswerLabel}
                </div>

                {q.type === 'Ordering' && q.correctOrder ? (
                  <ol className="list-none p-0 m-0 flex flex-wrap justify-center gap-3">
                    {q.correctOrder.map((item, idx) => (
                      <li
                        key={idx}
                        className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border-2 border-[var(--success)] font-extrabold text-xl flex items-center gap-2"
                      >
                        <span className="w-7 h-7 rounded-full bg-[var(--success)] text-white text-sm flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <h1 className="text-3xl sm:text-5xl font-black m-0">{q.correctAnswer}</h1>
                )}

                {q.media && q.media.playbackMode === 'onReveal' && (
                  <div className="pt-3">
                    <MediaPlayer media={q.media} token={token} autoPlay={true} isPaused={false} large />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-extrabold text-center m-0">{t.screen.roundPointsTitle}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {gameState.questionOutcomes.map((o) => {
                    const isCorrect = o.evaluation === 'Correct';
                    const isHalf = o.evaluation === 'HalfPoint';
                    return (
                      <div
                        key={o.teamId}
                        className={`surface-card p-4 flex items-center justify-between gap-3 border-2 ${
                          isCorrect
                            ? 'border-[var(--success)]'
                            : isHalf
                              ? 'border-[var(--warning)]'
                              : 'border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamAvatar avatarId={o.avatarId} avatarColor={o.avatarColor} size="md" />
                          <div className="min-w-0">
                            <div className="font-bold text-lg truncate flex items-center gap-1.5">
                              <span className="truncate">{o.teamName}</span>
                              {o.jokerUsed && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-text)] text-xs font-black">
                                  2×
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] truncate">
                              {o.hasAnswered
                                ? o.orderedItems
                                  ? o.orderedItems.join(' → ')
                                  : o.answerText
                                : '—'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCorrect ? (
                            <CheckCircle2 className="w-5 h-5 text-[var(--success)]" aria-label="Správně" />
                          ) : isHalf ? (
                            <HelpCircle className="w-5 h-5 text-[var(--warning)]" aria-label="Půl bodu" />
                          ) : (
                            <XCircle className="w-5 h-5 text-[var(--danger)]" aria-label="Špatně" />
                          )}
                          <span
                            className={`font-black text-xl tabular-nums ${
                              o.pointsAwarded > 0
                                ? 'text-[var(--success)]'
                                : o.pointsAwarded < 0
                                  ? 'text-[var(--danger)]'
                                  : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {o.pointsAwarded > 0 ? `+${o.pointsAwarded}` : o.pointsAwarded}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          )}

          {/* 7. LEADERBOARD */}
          {gameState.state === 'Leaderboard' && (
            <motion.section
              key="leaderboard"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6 w-full"
            >
              <h1 className="text-3xl sm:text-5xl font-black text-center m-0">
                {t.screen.leaderboardTitle}
              </h1>
              <LeaderboardView entries={gameState.leaderboard} large />
            </motion.section>
          )}

          {/* 8. FINISHED */}
          {gameState.state === 'Finished' && (
            <motion.section
              key="finished"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 w-full"
            >
              <h1 className="text-4xl sm:text-6xl font-black text-center m-0">
                {t.screen.finalPodiumTitle}
              </h1>

              <LeaderboardView entries={gameState.leaderboard} large showPodium />

              {gameState.statistics && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
                  {gameState.statistics.fastestTeamName && (
                    <div className="surface-card p-5 text-center space-y-1">
                      <Timer className="w-7 h-7 text-[var(--accent)] mx-auto" aria-hidden="true" />
                      <div className="text-sm font-semibold text-[var(--text-muted)]">
                        {t.screen.statsFastest}
                      </div>
                      <div className="text-xl font-black">{gameState.statistics.fastestTeamName}</div>
                      <div className="text-sm text-[var(--text-secondary)]">
                        průměr {gameState.statistics.fastestAvgResponseSeconds?.toFixed(2)} s
                      </div>
                    </div>
                  )}

                  {gameState.statistics.bestRoundTitle && (
                    <div className="surface-card p-5 text-center space-y-1">
                      <Award className="w-7 h-7 text-[var(--success)] mx-auto" aria-hidden="true" />
                      <div className="text-sm font-semibold text-[var(--text-muted)]">
                        {t.screen.statsBestRound}
                      </div>
                      <div className="text-xl font-black">
                        Kolo {gameState.statistics.bestRoundNumber}: {gameState.statistics.bestRoundTitle}
                      </div>
                      <div className="text-sm text-[var(--text-secondary)]">
                        úspěšnost {gameState.statistics.bestRoundAccuracyPercent}%
                      </div>
                    </div>
                  )}

                  <div className="surface-card p-5 text-center space-y-1">
                    <Sparkles className="w-7 h-7 text-[var(--info)] mx-auto" aria-hidden="true" />
                    <div className="text-sm font-semibold text-[var(--text-muted)]">
                      {t.screen.statsTotalQuestions}
                    </div>
                    <div className="text-2xl font-black">
                      {gameState.statistics.totalQuestionsPlayed}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      {gameState.statistics.totalAnswersSubmitted} odeslaných odpovědí
                    </div>
                  </div>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
