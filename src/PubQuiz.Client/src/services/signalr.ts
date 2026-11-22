import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel
} from '@microsoft/signalr';
import type { GameStateBroadcast, SubmitAnswerResult } from '../types/quiz';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface QuizSignalRClient {
  connection: HubConnection;
  start: () => Promise<void>;
  ensureConnected: () => Promise<void>;
  stop: () => Promise<void>;
  submitAnswer: (payload: {
    questionId: string;
    submissionId: string;
    answerText?: string | null;
    orderedItems?: string[] | null;
    useJoker: boolean;
  }) => Promise<SubmitAnswerResult>;
  preSelectJokers: (questionIds: string[]) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (payload: {
    teamName: string;
    avatarId: string;
    avatarColor: string;
  }) => Promise<{ success: boolean; error?: string }>;
  dismissMessage: (messageId: string) => Promise<{ success: boolean; error?: string }>;
  claimBonusTask: (taskId: string, note?: string | null) => Promise<{ success: boolean; error?: string }>;
}

export function createQuizSignalRClient(
  token: string,
  callbacks: {
    onState: (state: GameStateBroadcast) => void;
    onStatus: (status: ConnectionStatus) => void;
    onClockSync: (clockOffsetMs: number, oneWayLatencyMs: number) => void;
    onAuthError?: () => void;
    onTeamMissing?: () => void;
  }
): QuizSignalRClient {
  const hubUrl = `/hubs/quiz?token=${encodeURIComponent(token)}`;

  const connection = new HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect([0, 500, 1000, 2000, 3000, 5000, 5000, 8000])
    .configureLogging(LogLevel.Warning)
    .build();

  let syncTimer: number | null = null;
  let retryTimer: number | null = null;
  let lastOneWayLatency: number | null = null;
  let stopped = false;

  const clearTimers = () => {
    if (syncTimer !== null) {
      window.clearInterval(syncTimer);
      syncTimer = null;
    }
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const runClockSync = async () => {
    if (connection.state !== HubConnectionState.Connected) return;
    try {
      const t0 = Date.now();
      const serverMs = await connection.invoke<number>('SyncClock', t0, lastOneWayLatency);
      const t1 = Date.now();
      const rtt = Math.max(0, t1 - t0);
      const oneWay = Math.round(rtt / 2);
      lastOneWayLatency = oneWay;
      const offset = serverMs - (t0 + oneWay);
      callbacks.onClockSync(offset, oneWay);
    } catch {
      // Non-fatal
    }
  };

  const startLoop = async (attempt = 0): Promise<void> => {
    if (stopped) return;
    if (connection.state === HubConnectionState.Connected) {
      callbacks.onStatus('connected');
      return;
    }
    if (connection.state === HubConnectionState.Connecting || connection.state === HubConnectionState.Reconnecting) {
      return;
    }

    callbacks.onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    try {
      await connection.start();
      if (stopped) {
        await connection.stop();
        return;
      }
      callbacks.onStatus('connected');
      await runClockSync();
      if (syncTimer === null) {
        syncTimer = window.setInterval(runClockSync, 20000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('401') || message.includes('Unauthorized')) {
        callbacks.onStatus('disconnected');
        callbacks.onAuthError?.();
        return;
      }
      // Transient network error (mobile wake-up / flaky Wi-Fi) -> NEVER wipe token; keep retrying!
      callbacks.onStatus('reconnecting');
      const delay = Math.min(5000, 1000 * Math.max(1, attempt + 1));
      retryTimer = window.setTimeout(() => {
        void startLoop(attempt + 1);
      }, delay);
    }
  };

  connection.on('GameStateUpdated', (snapshot: GameStateBroadcast) => {
    callbacks.onState(snapshot);
  });

  connection.on('SessionTeamMissing', () => {
    stopped = true;
    clearTimers();
    callbacks.onTeamMissing?.();
  });

  connection.onreconnecting(() => {
    callbacks.onStatus('reconnecting');
  });

  connection.onreconnected(async () => {
    callbacks.onStatus('connected');
    await runClockSync();
    try {
      const snap = await connection.invoke<GameStateBroadcast>('RequestStateSnapshot');
      callbacks.onState(snap);
    } catch {
      // Ignore
    }
  });

  connection.onclose(() => {
    if (syncTimer !== null) {
      window.clearInterval(syncTimer);
      syncTimer = null;
    }
    if (stopped) {
      callbacks.onStatus('disconnected');
      return;
    }
    // If automatic reconnect exhausted retries (e.g. phone slept 10 min), keep trying cleanly!
    callbacks.onStatus('reconnecting');
    retryTimer = window.setTimeout(() => {
      void startLoop(1);
    }, 2000);
  });

  return {
    connection,
    async start() {
      stopped = false;
      await startLoop(0);
    },
    async ensureConnected() {
      if (stopped) return;
      if (connection.state === HubConnectionState.Connected) {
        await runClockSync();
        try {
          const snap = await connection.invoke<GameStateBroadcast>('RequestStateSnapshot');
          callbacks.onState(snap);
        } catch {
          // Will reconnect on close
        }
      } else if (connection.state === HubConnectionState.Disconnected) {
        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }
        await startLoop(1);
      }
    },
    async stop() {
      stopped = true;
      clearTimers();
      if (connection.state !== HubConnectionState.Disconnected) {
        await connection.stop();
      }
    },
    submitAnswer(payload) {
      return connection.invoke<SubmitAnswerResult>('SubmitAnswer', payload);
    },
    preSelectJokers(questionIds) {
      return connection.invoke<{ success: boolean; error?: string }>('PreSelectJokers', { questionIds });
    },
    updateProfile(payload) {
      return connection.invoke<{ success: boolean; error?: string }>('UpdateProfile', payload);
    },
    dismissMessage(messageId) {
      return connection.invoke<{ success: boolean; error?: string }>('DismissPlayerMessage', messageId);
    },
    claimBonusTask(taskId, note) {
      return connection.invoke<{ success: boolean; error?: string }>('ClaimBonusTask', {
        taskId,
        note: note || null
      });
    }
  };
}
