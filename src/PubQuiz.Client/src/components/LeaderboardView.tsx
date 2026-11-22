import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUp, Minus, Sparkles, Trophy, WifiOff } from 'lucide-react';
import type { LeaderboardEntry } from '../types/quiz';
import { TeamAvatar } from './TeamAvatar';

interface LeaderboardViewProps {
  entries: LeaderboardEntry[];
  highlightTeamId?: string | null;
  large?: boolean;
  showPodium?: boolean;
}

export function LeaderboardView({
  entries,
  highlightTeamId,
  large = false,
  showPodium = false
}: LeaderboardViewProps) {
  if (entries.length === 0) {
    return (
      <p className="text-center text-[var(--text-muted)] py-8">
        Zatím nejsou přihlášeny žádné týmy.
      </p>
    );
  }

  const topThree = showPodium ? entries.slice(0, 3) : [];
  const restEntries = showPodium ? entries.slice(3) : entries;

  return (
    <div className="w-full space-y-6">
      {showPodium && topThree.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end max-w-4xl mx-auto pt-4">
          {[1, 0, 2].map((idx) => {
            const entry = topThree[idx];
            if (!entry) return <div key={idx} className="hidden sm:block" />;
            const isFirst = idx === 0;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            return (
              <motion.div
                key={entry.teamId}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24, delay: idx * 0.1 }}
                className={`surface-card p-5 text-center flex flex-col items-center gap-2 ${
                  isFirst
                    ? 'sm:order-2 border-[var(--accent)] border-2 bg-[var(--accent-soft)]/30 sm:py-8'
                    : idx === 1
                      ? 'sm:order-1 sm:py-6'
                      : 'sm:order-3 sm:py-5'
                }`}
              >
                <span className="text-4xl" aria-label={`${entry.rank}. místo`}>
                  {medal}
                </span>
                <TeamAvatar avatarId={entry.avatarId} avatarColor={entry.avatarColor} size="lg" />
                <div className="font-extrabold text-xl truncate max-w-full">{entry.name}</div>
                <div className="text-2xl sm:text-3xl font-black text-[var(--accent)] tabular-nums">
                  {entry.score.toLocaleString('cs-CZ')} b.
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {entry.correctCount} správných odpovědí
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {restEntries.length > 0 && (
        <ol className="list-none p-0 m-0 space-y-2.5 max-w-4xl mx-auto" role="list">
          <AnimatePresence>
            {restEntries.map((entry) => {
              const rankChange = entry.previousRank - entry.rank;
              const isHighlighted = highlightTeamId === entry.teamId;
              const medalIcon =
                entry.rank === 1 ? (
                  <Trophy className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
                ) : null;

              return (
                <motion.li
                  key={entry.teamId}
                  layout
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className={`flex items-center justify-between gap-3 rounded-2xl border-2 ${
                    large ? 'px-5 py-4' : 'px-4 py-3'
                  } ${
                    isHighlighted
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`font-black tabular-nums flex items-center justify-center shrink-0 ${
                        large ? 'w-11 text-2xl' : 'w-8 text-lg'
                      }`}
                    >
                      {medalIcon ?? `${entry.rank}.`}
                    </div>

                    <TeamAvatar
                      avatarId={entry.avatarId}
                      avatarColor={entry.avatarColor}
                      size={large ? 'md' : 'sm'}
                    />

                    <div className="min-w-0">
                      <div className={`font-bold truncate flex items-center gap-2 ${large ? 'text-xl sm:text-2xl' : 'text-base'}`}>
                        <span className="truncate">{entry.name}</span>
                        {!entry.isConnected && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                            title="Odpojeno"
                          >
                            <WifiOff className="w-3 h-3" aria-hidden="true" />
                            Offline
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        {rankChange > 0 && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--success)]">
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />+{rankChange}
                          </span>
                        )}
                        {rankChange < 0 && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--danger)]">
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                            {rankChange}
                          </span>
                        )}
                        {rankChange === 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[var(--text-muted)]">
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          </span>
                        )}
                        {entry.jokersRemaining > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-[var(--accent)]" aria-hidden="true" />
                            {entry.jokersRemaining}× Žolík
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {entry.lastQuestionDelta !== 0 && (
                      <span
                        className={`font-bold tabular-nums px-2.5 py-1 rounded-full ${
                          large ? 'text-base' : 'text-xs'
                        } ${
                          entry.lastQuestionDelta > 0
                            ? 'bg-[var(--success-soft)] text-[var(--success)]'
                            : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                        }`}
                      >
                        {entry.lastQuestionDelta > 0 ? `+${entry.lastQuestionDelta}` : entry.lastQuestionDelta}
                      </span>
                    )}
                    <div
                      className={`font-black tabular-nums ${
                        large ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
                      }`}
                    >
                      {entry.score.toLocaleString('cs-CZ')}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
