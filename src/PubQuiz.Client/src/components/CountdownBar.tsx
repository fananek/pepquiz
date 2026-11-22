import { useEffect, useState } from 'react';
import { Clock, Pause, Zap } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface CountdownBarProps {
  endsAtUtc?: string | null;
  timeLimitSeconds: number;
  gracePeriodSeconds: number;
  isPaused: boolean;
  pausedRemainingSeconds?: number | null;
  clockOffsetMs: number;
  large?: boolean;
}

export function CountdownBar({
  endsAtUtc,
  timeLimitSeconds,
  gracePeriodSeconds,
  isPaused,
  pausedRemainingSeconds,
  clockOffsetMs,
  large = false
}: CountdownBarProps) {
  const { t } = useI18n();
  const computeRemaining = () => {
    if (isPaused) {
      return Math.max(0, pausedRemainingSeconds ?? timeLimitSeconds);
    }
    if (!endsAtUtc) return 0;
    const serverNow = Date.now() + clockOffsetMs;
    const endMs = Date.parse(endsAtUtc);
    return Math.max(0, (endMs - serverNow) / 1000);
  };

  const [remaining, setRemaining] = useState<number>(computeRemaining);

  useEffect(() => {
    setRemaining(computeRemaining());
    if (isPaused || !endsAtUtc) return;

    const id = window.setInterval(() => {
      setRemaining(computeRemaining());
    }, 100);
    return () => window.clearInterval(id);
  }, [endsAtUtc, isPaused, pausedRemainingSeconds, clockOffsetMs, timeLimitSeconds]);

  const safeLimit = Math.max(1, timeLimitSeconds);
  const pct = Math.max(0, Math.min(100, (remaining / safeLimit) * 100));
  const elapsed = safeLimit - remaining;
  const inGrace = elapsed <= gracePeriodSeconds && !isPaused && remaining > 0;
  const urgent = remaining <= 5 && remaining > 0 && !isPaused;
  const displaySeconds = Math.ceil(remaining);

  const barColor = isPaused
    ? 'var(--warning)'
    : urgent
      ? 'var(--danger)'
      : inGrace
        ? 'var(--success)'
        : 'var(--accent)';

  return (
    <div className="w-full" role="timer" aria-label={`${t.app.remainingTimeAria} ${displaySeconds} s`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 font-bold">
          {isPaused ? (
            <Pause className={large ? 'w-7 h-7 text-[var(--warning)]' : 'w-5 h-5 text-[var(--warning)]'} aria-hidden="true" />
          ) : (
            <Clock
              className={`${large ? 'w-7 h-7' : 'w-5 h-5'} ${urgent ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}
              aria-hidden="true"
            />
          )}
          <span
            className={`tabular-nums ${large ? 'text-3xl sm:text-4xl' : 'text-xl'} ${
              urgent ? 'text-[var(--danger)]' : ''
            }`}
          >
            {displaySeconds} s
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold">
          {isPaused && (
            <span className="px-2.5 py-1 rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
              {t.app.pausedBadge}
            </span>
          )}
          {inGrace && gracePeriodSeconds > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
              <Zap className="w-3.5 h-3.5" aria-hidden="true" />
              {t.app.fullBonusBadge}
            </span>
          )}
        </div>
      </div>

      <div
        className={`w-full rounded-full overflow-hidden bg-[var(--bg-subtle)] ${large ? 'h-5' : 'h-3'}`}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}
