import React, { useId, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import {
  AVATAR_CHARACTERS,
  AVATAR_COLORS,
  AVATAR_EXPRESSIONS,
  AVATAR_GLASSES,
  AVATAR_HATS,
  AVATAR_PATTERNS,
  parseAvatarId,
  randomAvatar,
  serializeAvatarConfig,
  TeamAvatar,
  type AvatarConfig
} from './TeamAvatar';

interface AvatarBuilderProps {
  avatarId: string;
  avatarColor: string;
  onChange: (nextAvatarId: string, nextColor: string) => void;
}

type BuilderTab = 'character' | 'hat' | 'glasses' | 'expression' | 'background';

const TABS: { id: BuilderTab; label: string }[] = [
  { id: 'character', label: 'Postava' },
  { id: 'hat', label: 'Pokrývka' },
  { id: 'glasses', label: 'Brýle' },
  { id: 'expression', label: 'Výraz' },
  { id: 'background', label: 'Pozadí' }
];

export function AvatarBuilder({ avatarId, avatarColor, onChange }: AvatarBuilderProps) {
  const [activeTab, setActiveTab] = useState<BuilderTab>('character');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();
  const cfg = parseAvatarId(avatarId);

  const updateCfg = (patch: Partial<AvatarConfig>, nextColor = avatarColor) => {
    const merged: AvatarConfig = { ...cfg, ...patch };
    onChange(serializeAvatarConfig(merged), nextColor);
  };

  const handleRandomize = () => {
    const r = randomAvatar();
    onChange(r.avatarId, r.avatarColor);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = TABS.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      const target = TABS[nextIdx];
      setActiveTab(target.id);
      const btn = tabRefs.current[target.id];
      btn?.focus();
      btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Large Live Preview + Randomize */}
      <div className="elevated-card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <TeamAvatar avatarId={avatarId} avatarColor={avatarColor} size="xl" />
          <div className="text-sm space-y-1">
            <div className="font-extrabold text-base">
              {AVATAR_CHARACTERS.find((c) => c.id === cfg.character)?.label ?? 'Avatar'}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Naklikejte si postavu, pokrývku, brýle i výraz!
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRandomize}
          className="btn-secondary !px-3 !py-2 text-xs shrink-0"
          aria-label="Vygenerovat náhodného avatara"
        >
          <Shuffle className="w-4 h-4" aria-hidden="true" />
          <span>Náhodný</span>
        </button>
      </div>

      {/* Single-row horizontally scrollable accessible tablist */}
      <div role="tablist" aria-label="Vrstvy avatara" className="tablist-scroll">
        {TABS.map((tab, idx) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={(e) => {
                setActiveTab(tab.id);
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-character`}
        hidden={activeTab !== 'character'}
      >
        <div className="grid grid-cols-4 gap-2 pt-1 max-h-56 overflow-y-auto pr-0.5">
          {AVATAR_CHARACTERS.map((ch) => {
            const active = cfg.character === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateCfg({ character: ch.id })}
                className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                }`}
              >
                <TeamAvatar
                  avatarId={serializeAvatarConfig({ ...cfg, character: ch.id })}
                  avatarColor={avatarColor}
                  size="md"
                />
                <span className="text-[11px] font-bold truncate max-w-full">{ch.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-hat`}
        hidden={activeTab !== 'hat'}
      >
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
          {AVATAR_HATS.map((h) => {
            const active = cfg.hat === h.id;
            return (
              <button
                key={h.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateCfg({ hat: h.id })}
                className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                }`}
              >
                <TeamAvatar
                  avatarId={serializeAvatarConfig({ ...cfg, hat: h.id })}
                  avatarColor={avatarColor}
                  size="sm"
                />
                <span className="text-[11px] font-bold truncate max-w-full">{h.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-glasses`}
        hidden={activeTab !== 'glasses'}
      >
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
          {AVATAR_GLASSES.map((g) => {
            const active = cfg.glasses === g.id;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateCfg({ glasses: g.id })}
                className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                }`}
              >
                <TeamAvatar
                  avatarId={serializeAvatarConfig({ ...cfg, glasses: g.id })}
                  avatarColor={avatarColor}
                  size="sm"
                />
                <span className="text-[11px] font-bold truncate max-w-full">{g.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-expression`}
        hidden={activeTab !== 'expression'}
      >
        <div className="grid grid-cols-3 gap-2 pt-1">
          {AVATAR_EXPRESSIONS.map((ex) => {
            const active = cfg.expression === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateCfg({ expression: ex.id })}
                className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                }`}
              >
                <TeamAvatar
                  avatarId={serializeAvatarConfig({ ...cfg, expression: ex.id })}
                  avatarColor={avatarColor}
                  size="sm"
                />
                <span className="text-[11px] font-bold truncate max-w-full">{ex.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-background`}
        hidden={activeTab !== 'background'}
      >
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateCfg({}, c)}
                aria-label={`Barva pozadí ${c}`}
                aria-pressed={avatarColor === c}
                className={`w-9 h-9 rounded-full cursor-pointer border-3 ${
                  avatarColor === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {AVATAR_PATTERNS.map((p) => {
              const active = cfg.pattern === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateCfg({ pattern: p.id })}
                  className={`py-2 px-2 rounded-xl border-2 text-xs font-bold cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
