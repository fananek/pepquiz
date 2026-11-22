import React, { useId } from 'react';

export interface AvatarConfig {
  character: string;
  hat: string;
  glasses: string;
  expression: string;
  pattern: string;
}

export const AVATAR_CHARACTERS = [
  { id: 'owl', label: 'Sova', base: '#92400e', accent: '#fde68a' },
  { id: 'fox', label: 'Liška', base: '#ea580c', accent: '#fff7ed' },
  { id: 'bear', label: 'Medvěd', base: '#78350f', accent: '#e5b887' },
  { id: 'cat', label: 'Kočka', base: '#f59e0b', accent: '#fef3c7' },
  { id: 'dog', label: 'Pes', base: '#d97706', accent: '#fef3c7' },
  { id: 'wolf', label: 'Vlk', base: '#64748b', accent: '#f1f5f9' },
  { id: 'panda', label: 'Panda', base: '#f8fafc', accent: '#1e293b' },
  { id: 'frog', label: 'Žába', base: '#22c55e', accent: '#bbf7d0' },
  { id: 'penguin', label: 'Tučňák', base: '#1e293b', accent: '#f8fafc' },
  { id: 'lion', label: 'Lev', base: '#f59e0b', accent: '#9a3412' },
  { id: 'rabbit', label: 'Králík', base: '#f1f5f9', accent: '#fda4af' },
  { id: 'dragon', label: 'Drak', base: '#10b981', accent: '#facc15' },
  { id: 'robot', label: 'Robot', base: '#94a3b8', accent: '#38bdf8' },
  { id: 'alien', label: 'Mimozemšťan', base: '#84cc16', accent: '#365314' },
  { id: 'ghost', label: 'Duch', base: '#f8fafc', accent: '#c7d2fe' },
  { id: 'unicorn', label: 'Jednorožec', base: '#f8fafc', accent: '#ec4899' },
  { id: 'octopus', label: 'Chobotnice', base: '#a855f7', accent: '#e9d5ff' },
  { id: 'beer', label: 'Pivní korbel', base: '#f59e0b', accent: '#ffffff' }
] as const;

export const AVATAR_HATS = [
  { id: 'none', label: 'Bez pokrývky' },
  { id: 'crown', label: 'Koruna' },
  { id: 'graduation', label: 'Promoce' },
  { id: 'cap', label: 'Kšiltovka' },
  { id: 'wizard', label: 'Kouzelník' },
  { id: 'viking', label: 'Viking' },
  { id: 'pirate', label: 'Pirát' },
  { id: 'chef', label: 'Kuchař' },
  { id: 'headphones', label: 'Sluchátka' },
  { id: 'party', label: 'Párty' },
  { id: 'beret', label: 'Baret' },
  { id: 'halo', label: 'Svatozář' }
] as const;

export const AVATAR_GLASSES = [
  { id: 'none', label: 'Bez brýlí' },
  { id: 'sunglasses', label: 'Sluneční' },
  { id: 'round', label: 'Kulaté' },
  { id: 'visor', label: 'Kyber štít' },
  { id: 'star', label: 'Hvězdičky' },
  { id: 'monocle', label: 'Monokl' },
  { id: 'retro3d', label: '3D brýle' },
  { id: 'pixel', label: 'Pixel MLG' }
] as const;

export const AVATAR_EXPRESSIONS = [
  { id: 'happy', label: 'Veselý' },
  { id: 'laugh', label: 'Vysmátý' },
  { id: 'cool', label: 'Cool úsměv' },
  { id: 'wink', label: 'Mrkající' },
  { id: 'love', label: 'Zamilovaný' },
  { id: 'surprised', label: 'Překvapený' },
  { id: 'mustache', label: 'Knírek' },
  { id: 'bowtie', label: 'Motýlek' }
] as const;

export const AVATAR_PATTERNS = [
  { id: 'solid', label: 'Záře' },
  { id: 'rays', label: 'Paprsky' },
  { id: 'dots', label: 'Bokeh' },
  { id: 'stars', label: 'Hvězdy' },
  { id: 'stripes', label: 'Pruhy' },
  { id: 'rings', label: 'Kruhy' }
] as const;

export const AVATAR_COLORS = [
  '#b45309',
  '#1d4ed8',
  '#047857',
  '#b91c1c',
  '#6d28d9',
  '#0f766e',
  '#be185d',
  '#4338ca',
  '#c2410c',
  '#0369a1',
  '#4d7c0f',
  '#7c2d12',
  '#334155',
  '#9333ea'
] as const;

export const AVATAR_COLOR_NAMES: Record<string, string> = {
  '#b45309': 'Jantarová',
  '#1d4ed8': 'Královská modrá',
  '#047857': 'Smaragdová',
  '#b91c1c': 'Rubínová',
  '#6d28d9': 'Fialová',
  '#0f766e': 'Petrolejová',
  '#be185d': 'Malinová',
  '#4338ca': 'Indigová',
  '#c2410c': 'Terakota',
  '#0369a1': 'Oceánská',
  '#4d7c0f': 'Olivová',
  '#7c2d12': 'Mahagonová',
  '#334155': 'Břidlicová',
  '#9333ea': 'Ametystová'
};

// Legacy alias kept for compatibility
export const AVATAR_OPTIONS = AVATAR_CHARACTERS.map((c) => ({
  id: c.id,
  label: c.label
}));

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  character: 'owl',
  hat: 'none',
  glasses: 'none',
  expression: 'happy',
  pattern: 'rays'
};

interface CharacterAnchor {
  eyeY: number;
  eyeSpread: number;
  mouthY: number;
  hatY: number;
  cheekY: number;
  hasBeak?: boolean;
  noNose?: boolean;
  isRobot?: boolean;
  isPanda?: boolean;
}

const DEFAULT_ANCHOR: CharacterAnchor = {
  eyeY: 54,
  eyeSpread: 11.5,
  mouthY: 71,
  hatY: 0,
  cheekY: 63
};

const CHARACTER_ANCHORS: Record<string, CharacterAnchor> = {
  owl: { eyeY: 52, eyeSpread: 12, mouthY: 66, hatY: 0, cheekY: 62, hasBeak: true },
  fox: { eyeY: 55, eyeSpread: 11.5, mouthY: 72, hatY: 1, cheekY: 63 },
  bear: { eyeY: 54, eyeSpread: 11.5, mouthY: 71, hatY: 0, cheekY: 62 },
  cat: { eyeY: 55, eyeSpread: 11.5, mouthY: 71, hatY: 1, cheekY: 63 },
  dog: { eyeY: 54, eyeSpread: 11.5, mouthY: 72, hatY: 0, cheekY: 63 },
  wolf: { eyeY: 55, eyeSpread: 11.5, mouthY: 72, hatY: 1, cheekY: 63 },
  panda: { eyeY: 54, eyeSpread: 12, mouthY: 71, hatY: 0, cheekY: 64, isPanda: true },
  frog: { eyeY: 42, eyeSpread: 14, mouthY: 68, hatY: -6, cheekY: 60, noNose: true },
  penguin: { eyeY: 52, eyeSpread: 11.5, mouthY: 65, hatY: -1, cheekY: 61, hasBeak: true },
  lion: { eyeY: 55, eyeSpread: 11, mouthY: 71, hatY: -2, cheekY: 63 },
  rabbit: { eyeY: 57, eyeSpread: 11, mouthY: 72, hatY: 2, cheekY: 64 },
  dragon: { eyeY: 54, eyeSpread: 12, mouthY: 71, hatY: -1, cheekY: 63, noNose: true },
  robot: { eyeY: 52, eyeSpread: 11.5, mouthY: 73, hatY: 1, cheekY: 64, isRobot: true, noNose: true },
  alien: { eyeY: 54, eyeSpread: 12, mouthY: 71, hatY: 0, cheekY: 63, noNose: true },
  ghost: { eyeY: 51, eyeSpread: 11, mouthY: 66, hatY: -2, cheekY: 59, noNose: true },
  unicorn: { eyeY: 56, eyeSpread: 11.5, mouthY: 72, hatY: 2, cheekY: 64 },
  octopus: { eyeY: 52, eyeSpread: 11.5, mouthY: 65, hatY: -3, cheekY: 59, noNose: true },
  beer: { eyeY: 59, eyeSpread: 11, mouthY: 73, hatY: -2, cheekY: 66, noNose: true }
};

const OUTLINE = '#1b1714';

export function parseAvatarId(avatarId?: string | null): AvatarConfig {
  if (!avatarId) return { ...DEFAULT_AVATAR_CONFIG };
  if (avatarId.startsWith('v2:')) {
    const parts = avatarId.split(':');
    return {
      character: parts[1] || 'owl',
      hat: parts[2] || 'none',
      glasses: parts[3] || 'none',
      expression: parts[4] || 'happy',
      pattern: parts[5] || 'solid'
    };
  }
  const legacyMap: Record<string, Partial<AvatarConfig>> = {
    crown: { character: 'lion', hat: 'crown' },
    rocket: { character: 'robot', hat: 'halo' },
    brain: { character: 'alien', glasses: 'round' },
    guitar: { character: 'fox', hat: 'headphones', glasses: 'sunglasses' },
    lightning: { character: 'cat', glasses: 'star', pattern: 'rays' }
  };
  const mapped = legacyMap[avatarId];
  if (mapped) {
    return { ...DEFAULT_AVATAR_CONFIG, ...mapped };
  }
  const known = AVATAR_CHARACTERS.some((c) => c.id === avatarId);
  return { ...DEFAULT_AVATAR_CONFIG, character: known ? avatarId : 'owl', pattern: 'solid' };
}

export function serializeAvatarConfig(cfg: AvatarConfig): string {
  return `v2:${cfg.character}:${cfg.hat}:${cfg.glasses}:${cfg.expression}:${cfg.pattern}`;
}

export function randomAvatar(): { avatarId: string; avatarColor: string } {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const cfg: AvatarConfig = {
    character: pick(AVATAR_CHARACTERS).id,
    hat: pick(AVATAR_HATS).id,
    glasses: pick(AVATAR_GLASSES).id,
    expression: pick(AVATAR_EXPRESSIONS).id,
    pattern: pick(AVATAR_PATTERNS).id
  };
  return {
    avatarId: serializeAvatarConfig(cfg),
    avatarColor: pick(AVATAR_COLORS)
  };
}

interface TeamAvatarProps {
  avatarId: string;
  avatarColor: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

interface SvgGradientIds {
  bgGlow: string;
  rimShade: string;
  gold: string;
  steel: string;
  lens: string;
  beer: string;
  clip: string;
}

export function TeamAvatar({ avatarId, avatarColor, size = 'md' }: TeamAvatarProps) {
  const rawUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids: SvgGradientIds = {
    bgGlow: `av-bg-${rawUid}`,
    rimShade: `av-rim-${rawUid}`,
    gold: `av-gold-${rawUid}`,
    steel: `av-steel-${rawUid}`,
    lens: `av-lens-${rawUid}`,
    beer: `av-beer-${rawUid}`,
    clip: `av-clip-${rawUid}`
  };

  const cfg = parseAvatarId(avatarId);
  const bg = /^#[0-9a-fA-F]{6}$/.test(avatarColor || '') ? avatarColor : '#b45309';
  const anchor = CHARACTER_ANCHORS[cfg.character] ?? DEFAULT_ANCHOR;

  const dims =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
        ? 'w-16 h-16'
        : size === 'xl'
          ? 'w-28 h-28'
          : 'w-12 h-12';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none shadow-md ring-2 ring-white/35 ${dims}`}
      style={{ backgroundColor: bg }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full block">
        <defs>
          <clipPath id={ids.clip}>
            <circle cx="50" cy="50" r="50" />
          </clipPath>
          <radialGradient id={ids.bgGlow} cx="35%" cy="24%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="48%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.36" />
          </radialGradient>
          <linearGradient id={ids.rimShade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.24" />
          </linearGradient>
          <linearGradient id={ids.gold} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id={ids.steel} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="45%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id={ids.lens} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="55%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id={ids.beer} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#c2410c" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${ids.clip})`}>
          {/* Rich studio radial lighting over chosen team color */}
          <rect x="0" y="0" width="100" height="100" fill={bg} />
          <rect x="0" y="0" width="100" height="100" fill={`url(#${ids.bgGlow})`} />

          {/* Background pattern layer */}
          {renderPattern(cfg.pattern)}

          {/* Grounding shadow */}
          <ellipse cx="50" cy="89" rx="28" ry="8" fill="#000000" opacity="0.24" />

          {/* Character base illustration */}
          {renderCharacterBase(cfg.character, ids)}

          {/* Face features & expressions */}
          {renderFaceFeatures(cfg.character, cfg.expression, anchor)}

          {/* Eyewear anchored dynamically to character eyes */}
          {renderGlasses(cfg.glasses, anchor, ids)}

          {/* Headgear anchored dynamically above character crown */}
          {renderHat(cfg.hat, anchor, ids)}

          {/* Subtle glossy top badge arc & inner rim definition */}
          <ellipse cx="50" cy="4" rx="42" ry="14" fill="#ffffff" opacity="0.1" />
          <circle cx="50" cy="50" r="48.5" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2.5" />
        </g>
      </svg>
    </span>
  );
}

function renderPattern(pattern: string): React.ReactNode {
  switch (pattern) {
    case 'rays':
      return (
        <g opacity="0.17" fill="#ffffff">
          <polygon points="50,50 41,-2 59,-2" />
          <polygon points="50,50 82,-2 102,16" />
          <polygon points="50,50 102,41 102,59" />
          <polygon points="50,50 102,84 82,102" />
          <polygon points="50,50 59,102 41,102" />
          <polygon points="50,50 18,102 -2,84" />
          <polygon points="50,50 -2,59 -2,41" />
          <polygon points="50,50 -2,16 18,-2" />
        </g>
      );
    case 'dots':
      return (
        <g fill="#ffffff">
          <circle cx="17" cy="22" r="7" opacity="0.16" />
          <circle cx="84" cy="24" r="9" opacity="0.14" />
          <circle cx="14" cy="74" r="8" opacity="0.13" />
          <circle cx="87" cy="74" r="6" opacity="0.18" />
          <circle cx="52" cy="13" r="4.5" opacity="0.2" />
          <circle cx="24" cy="48" r="3.5" opacity="0.18" />
          <circle cx="78" cy="51" r="4" opacity="0.16" />
          <circle cx="34" cy="18" r="2.5" opacity="0.24" />
        </g>
      );
    case 'stars':
      return (
        <g fill="#fef9c3">
          <path d="M18,14 L19.8,19.2 L25,21 L19.8,22.8 L18,28 L16.2,22.8 L11,21 L16.2,19.2 Z" opacity="0.55" />
          <path d="M83,16 L84.5,20 L88.5,21.5 L84.5,23 L83,27 L81.5,23 L77.5,21.5 L81.5,20 Z" opacity="0.5" />
          <path d="M15,70 L16.3,73.5 L19.8,74.8 L16.3,76.1 L15,79.6 L13.7,76.1 L10.2,74.8 L13.7,73.5 Z" opacity="0.45" />
          <path d="M85,68 L86.6,72.2 L90.8,73.8 L86.6,75.4 L85,79.6 L83.4,75.4 L79.2,73.8 L83.4,72.2 Z" opacity="0.5" />
          <circle cx="33" cy="14" r="1.6" opacity="0.6" />
          <circle cx="71" cy="15" r="1.4" opacity="0.5" />
          <circle cx="22" cy="46" r="1.5" opacity="0.4" />
          <circle cx="88" cy="46" r="1.6" opacity="0.45" />
        </g>
      );
    case 'stripes':
      return (
        <g opacity="0.13" stroke="#ffffff" strokeWidth="8">
          <line x1="-10" y1="20" x2="20" y2="-10" />
          <line x1="-10" y1="44" x2="44" y2="-10" />
          <line x1="-10" y1="68" x2="68" y2="-10" />
          <line x1="-10" y1="92" x2="92" y2="-10" />
          <line x1="6" y1="108" x2="108" y2="6" />
          <line x1="30" y1="108" x2="108" y2="30" />
          <line x1="54" y1="108" x2="108" y2="54" />
        </g>
      );
    case 'rings':
      return (
        <g fill="none" stroke="#ffffff" opacity="0.16">
          <circle cx="50" cy="54" r="22" strokeWidth="2.5" />
          <circle cx="50" cy="54" r="34" strokeWidth="2.5" />
          <circle cx="50" cy="54" r="46" strokeWidth="2.5" />
        </g>
      );
    default:
      return null;
  }
}

function renderCharacterBase(character: string, ids: SvgGradientIds): React.ReactNode {
  switch (character) {
    case 'owl':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Wings tucked at sides */}
          <ellipse cx="22" cy="68" rx="8" ry="15" transform="rotate(14 22 68)" fill="#78350f" />
          <ellipse cx="78" cy="68" rx="8" ry="15" transform="rotate(-14 78 68)" fill="#78350f" />
          {/* Ear feather tufts */}
          <path d="M23,44 L25,21 L42,35 Z" fill="#78350f" />
          <path d="M77,44 L75,21 L58,35 Z" fill="#78350f" />
          {/* Head & rounded body */}
          <ellipse cx="50" cy="60" rx="30" ry="30" fill="#a16207" />
          {/* Soft top highlight & bottom shade */}
          <path d="M28,44 Q50,28 72,44" fill="none" stroke="#fde68a" strokeWidth="4" opacity="0.35" />
          <path d="M23,66 A29,29 0 0,0 77,66 A32,20 0 0,1 23,66 Z" fill="#000000" opacity="0.14" stroke="none" />
          {/* Cream belly plumage */}
          <ellipse cx="50" cy="75" rx="19" ry="14" fill="#fef3c7" stroke="none" />
          <path d="M40,74 Q43,78 46,74 M54,74 Q57,78 60,74 M47,80 Q50,84 53,80" fill="none" stroke="#b45309" strokeWidth="2" opacity="0.55" />
          {/* Sculpted facial discs */}
          <circle cx="38" cy="52" r="12.5" fill="#fef9c3" stroke="#92400e" strokeWidth="1.8" />
          <circle cx="62" cy="52" r="12.5" fill="#fef9c3" stroke="#92400e" strokeWidth="1.8" />
          <path d="M46,42 L50,47 L54,42" fill="#78350f" stroke="none" />
        </g>
      );

    case 'fox':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Sleek pointed ears */}
          <path d="M21,49 L22,18 L44,34 Z" fill="#ea580c" />
          <path d="M22,18 L29,23 L22,29 Z" fill="#1e293b" stroke="none" />
          <path d="M26,41 L27,26 L38,35 Z" fill="#fed7aa" stroke="none" />
          <path d="M79,49 L78,18 L56,34 Z" fill="#ea580c" />
          <path d="M78,18 L71,23 L78,29 Z" fill="#1e293b" stroke="none" />
          <path d="M74,41 L73,26 L62,35 Z" fill="#fed7aa" stroke="none" />
          {/* Cheek fur silhouette */}
          <path
            d="M19,58 C19,40 33,31 50,31 C67,31 81,40 81,58 C84,65 80,74 71,79 C64,85 57,88 50,88 C43,88 36,85 29,79 C20,74 16,65 19,58 Z"
            fill="#f97316"
          />
          {/* Forehead shine */}
          <ellipse cx="44" cy="40" rx="14" ry="5" fill="#ffffff" opacity="0.22" stroke="none" />
          {/* Sculpted cream cheek mask */}
          <path
            d="M21,62 Q35,66 50,58 Q65,66 79,62 C78,74 66,86 50,87 C34,86 22,74 21,62 Z"
            fill="#fff7ed"
            stroke="none"
          />
          <path
            d="M22,64 Q35,68 50,60 Q65,68 78,64"
            fill="none"
            stroke="#c2410c"
            strokeWidth="1.4"
            opacity="0.35"
          />
        </g>
      );

    case 'bear':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Plush ears */}
          <circle cx="26" cy="34" r="11" fill="#854d0e" />
          <circle cx="26" cy="34" r="6" fill="#e5b887" stroke="none" />
          <circle cx="74" cy="34" r="11" fill="#854d0e" />
          <circle cx="74" cy="34" r="6" fill="#e5b887" stroke="none" />
          {/* Head */}
          <circle cx="50" cy="60" r="30" fill="#92400e" />
          <ellipse cx="42" cy="41" rx="13" ry="6" transform="rotate(-14 42 41)" fill="#ffffff" opacity="0.18" stroke="none" />
          <path d="M22,67 A30,30 0 0,0 78,67 A34,20 0 0,1 22,67 Z" fill="#000000" opacity="0.16" stroke="none" />
          {/* Soft light muzzle */}
          <ellipse cx="50" cy="69" rx="16" ry="12.5" fill="#f3d5b5" stroke="#78350f" strokeWidth="1.6" />
        </g>
      );

    case 'cat':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          <path d="M22,48 L24,19 L44,34 Z" fill="#f59e0b" />
          <path d="M27,42 L28,26 L39,35 Z" fill="#fda4af" stroke="none" />
          <path d="M78,48 L76,19 L56,34 Z" fill="#f59e0b" />
          <path d="M73,42 L72,26 L61,35 Z" fill="#fda4af" stroke="none" />
          <ellipse cx="50" cy="60" rx="30" ry="27" fill="#fbbf24" />
          <path d="M22,67 A30,27 0 0,0 78,67 A34,18 0 0,1 22,67 Z" fill="#b45309" opacity="0.2" stroke="none" />
          {/* Tabby stripes */}
          <path d="M44,34 L46,43 M50,33 L50,44 M56,34 L54,43" stroke="#b45309" strokeWidth="3.2" />
          {/* Whiskers */}
          <line x1="13" y1="60" x2="27" y2="62" stroke={OUTLINE} strokeWidth="2" />
          <line x1="14" y1="68" x2="27" y2="66" stroke={OUTLINE} strokeWidth="2" />
          <line x1="87" y1="60" x2="73" y2="62" stroke={OUTLINE} strokeWidth="2" />
          <line x1="86" y1="68" x2="73" y2="66" stroke={OUTLINE} strokeWidth="2" />
          {/* Soft cream chin */}
          <ellipse cx="50" cy="70" rx="14" ry="10" fill="#fef3c7" stroke="none" opacity="0.9" />
        </g>
      );

    case 'dog':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Floppy velvet ears */}
          <ellipse cx="19" cy="58" rx="9.5" ry="20" transform="rotate(14 19 58)" fill="#78350f" />
          <ellipse cx="81" cy="58" rx="9.5" ry="20" transform="rotate(-14 81 58)" fill="#78350f" />
          {/* Head */}
          <circle cx="50" cy="59" r="29" fill="#d97706" />
          {/* Cute eye patch */}
          <ellipse cx="38" cy="54" rx="11" ry="12" transform="rotate(-10 38 54)" fill="#92400e" stroke="none" opacity="0.6" />
          <ellipse cx="56" cy="40" rx="12" ry="5" fill="#ffffff" opacity="0.2" stroke="none" />
          {/* Snout */}
          <ellipse cx="50" cy="70" rx="16.5" ry="12.5" fill="#fef3c7" stroke="#92400e" strokeWidth="1.5" />
        </g>
      );

    case 'wolf':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Tall wolf ears */}
          <path d="M22,47 L23,17 L44,34 Z" fill="#475569" />
          <path d="M27,40 L28,25 L38,34 Z" fill="#cbd5e1" stroke="none" />
          <path d="M78,47 L77,17 L56,34 Z" fill="#475569" />
          <path d="M73,40 L72,25 L62,34 Z" fill="#cbd5e1" stroke="none" />
          {/* Head with side cheek tufts */}
          <path
            d="M20,57 C20,39 33,31 50,31 C67,31 80,39 80,57 L84,65 L75,71 C70,82 61,88 50,88 C39,88 30,82 25,71 L16,65 Z"
            fill="#64748b"
          />
          {/* Silver facial mask */}
          <path
            d="M24,62 Q33,47 45,51 L50,57 L55,51 Q67,47 76,62 C73,77 63,86 50,86 C37,86 27,77 24,62 Z"
            fill="#f1f5f9"
            stroke="none"
          />
          {/* Forehead diamond mark */}
          <polygon points="50,35 55,44 50,49 45,44" fill="#cbd5e1" stroke="none" opacity="0.55" />
        </g>
      );

    case 'panda':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          <circle cx="26" cy="34" r="10.5" fill="#1e293b" />
          <circle cx="74" cy="34" r="10.5" fill="#1e293b" />
          <circle cx="50" cy="60" r="30" fill="#f8fafc" />
          <path d="M23,68 A30,30 0 0,0 77,68 A34,18 0 0,1 23,68 Z" fill="#cbd5e1" opacity="0.55" stroke="none" />
          {/* Tilted velvety panda eye patches */}
          <ellipse cx="37.5" cy="54" rx="9.5" ry="11.5" transform="rotate(-18 37.5 54)" fill="#1e293b" stroke="none" />
          <ellipse cx="62.5" cy="54" rx="9.5" ry="11.5" transform="rotate(18 62.5 54)" fill="#1e293b" stroke="none" />
        </g>
      );

    case 'frog':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Perched eye domes */}
          <circle cx="35" cy="41" r="13" fill="#22c55e" />
          <circle cx="65" cy="41" r="13" fill="#22c55e" />
          {/* Wide glossy frog head */}
          <ellipse cx="50" cy="64" rx="33" ry="24" fill="#22c55e" />
          {/* Blend eye domes smoothly into head */}
          <circle cx="35" cy="42" r="11" fill="#22c55e" stroke="none" />
          <circle cx="65" cy="42" r="11" fill="#22c55e" stroke="none" />
          {/* Specular green shine */}
          <ellipse cx="32" cy="34" rx="5" ry="2.6" transform="rotate(-20 32 34)" fill="#bbf7d0" opacity="0.6" stroke="none" />
          <ellipse cx="62" cy="34" rx="5" ry="2.6" transform="rotate(-20 62 34)" fill="#bbf7d0" opacity="0.6" stroke="none" />
          {/* Soft cream throat */}
          <ellipse cx="50" cy="75" rx="22" ry="11" fill="#dcfce7" stroke="none" />
          {/* White scleras inside perched domes */}
          <circle cx="36" cy="42" r="8" fill="#ffffff" stroke="#15803d" strokeWidth="1.6" />
          <circle cx="64" cy="42" r="8" fill="#ffffff" stroke="#15803d" strokeWidth="1.6" />
        </g>
      );

    case 'penguin':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Cute side flippers */}
          <ellipse cx="20" cy="70" rx="6" ry="13" transform="rotate(18 20 70)" fill="#1e293b" />
          <ellipse cx="80" cy="70" rx="6" ry="13" transform="rotate(-18 80 70)" fill="#1e293b" />
          {/* Tuxedo head/body */}
          <ellipse cx="50" cy="60" rx="29" ry="31" fill="#1e293b" />
          <ellipse cx="42" cy="37" rx="11" ry="4.5" transform="rotate(-16 42 37)" fill="#64748b" opacity="0.35" stroke="none" />
          {/* Heart-shaped snow-white face */}
          <path
            d="M27,59 C27,42 38,40 46,45 Q50,48 54,45 C62,40 73,42 73,59 C73,84 62,89 50,89 C38,89 27,84 27,59 Z"
            fill="#f8fafc"
            stroke="none"
          />
          <path d="M29,76 A24,14 0 0,0 71,76 A26,12 0 0,1 29,76 Z" fill="#cbd5e1" opacity="0.45" stroke="none" />
        </g>
      );

    case 'lion':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Layered scalloped royal mane */}
          <g fill="#b45309">
            <circle cx="50" cy="24" r="11" />
            <circle cx="71" cy="30" r="11" />
            <circle cx="82" cy="48" r="11" />
            <circle cx="80" cy="69" r="11" />
            <circle cx="65" cy="83" r="11" />
            <circle cx="35" cy="83" r="11" />
            <circle cx="20" cy="69" r="11" />
            <circle cx="18" cy="48" r="11" />
            <circle cx="29" cy="30" r="11" />
          </g>
          <circle cx="50" cy="57" r="32" fill="#b45309" stroke="none" />
          {/* Inner ears */}
          <circle cx="29" cy="36" r="8" fill="#f59e0b" />
          <circle cx="29" cy="36" r="4" fill="#fef3c7" stroke="none" />
          <circle cx="71" cy="36" r="8" fill="#f59e0b" />
          <circle cx="71" cy="36" r="4" fill="#fef3c7" stroke="none" />
          {/* Golden face */}
          <circle cx="50" cy="59" r="25" fill="#fbbf24" />
          <ellipse cx="43" cy="42" rx="11" ry="4.5" fill="#fef9c3" opacity="0.45" stroke="none" />
          <ellipse cx="50" cy="69" rx="14" ry="10.5" fill="#fef3c7" stroke="#b45309" strokeWidth="1.4" />
        </g>
      );

    case 'rabbit':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Tall sculpted ears */}
          <ellipse cx="36" cy="26" rx="7.5" ry="20" transform="rotate(-10 36 26)" fill="#f8fafc" />
          <ellipse cx="36.5" cy="27" rx="3.8" ry="13" transform="rotate(-10 36.5 27)" fill="#fda4af" stroke="none" />
          <ellipse cx="64" cy="26" rx="7.5" ry="20" transform="rotate(10 64 26)" fill="#f8fafc" />
          <ellipse cx="63.5" cy="27" rx="3.8" ry="13" transform="rotate(10 63.5 27)" fill="#fda4af" stroke="none" />
          {/* Round fluffy head */}
          <ellipse cx="50" cy="63" rx="28" ry="25" fill="#f8fafc" />
          <path d="M24,69 A28,25 0 0,0 76,69 A30,16 0 0,1 24,69 Z" fill="#cbd5e1" opacity="0.45" stroke="none" />
          <ellipse cx="42" cy="46" rx="10" ry="4.5" fill="#ffffff" opacity="0.7" stroke="none" />
        </g>
      );

    case 'dragon':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Curved golden dragon horns */}
          <path d="M31,37 C22,25 22,16 30,13 C29,21 34,26 40,33 Z" fill={`url(#${ids.gold})`} />
          <path d="M69,37 C78,25 78,16 70,13 C71,21 66,26 60,33 Z" fill={`url(#${ids.gold})`} />
          {/* Cheek fins */}
          <polygon points="18,57 25,52 25,65" fill="#059669" />
          <polygon points="82,57 75,52 75,65" fill="#059669" />
          {/* Emerald dragon head */}
          <ellipse cx="50" cy="59" rx="29" ry="28" fill="#10b981" />
          <ellipse cx="43" cy="40" rx="12" ry="5" fill="#a7f3d0" opacity="0.4" stroke="none" />
          {/* Belly / jaw plates */}
          <ellipse cx="50" cy="73" rx="18" ry="12" fill="#d1fae5" stroke="#047857" strokeWidth="1.5" />
          {/* Cute nostrils */}
          <circle cx="44" cy="64" r="1.8" fill="#065f46" stroke="none" />
          <circle cx="56" cy="64" r="1.8" fill="#065f46" stroke="none" />
        </g>
      );

    case 'robot':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Antenna with glowing energy orb */}
          <line x1="50" y1="21" x2="50" y2="33" stroke={OUTLINE} strokeWidth="3.5" />
          <circle cx="50" cy="18" r="5.5" fill={`url(#${ids.gold})`} />
          <circle cx="48.5" cy="16.5" r="1.6" fill="#ffffff" stroke="none" />
          {/* Side audio bolts */}
          <rect x="17" y="49" width="8" height="17" rx="3.5" fill="#475569" />
          <rect x="75" y="49" width="8" height="17" rx="3.5" fill="#475569" />
          {/* Brushed metallic chassis */}
          <rect x="23" y="32" width="54" height="53" rx="14" fill={`url(#${ids.steel})`} />
          {/* Corner rivets */}
          <circle cx="29" cy="38" r="1.6" fill="#334155" stroke="none" />
          <circle cx="71" cy="38" r="1.6" fill="#334155" stroke="none" />
          {/* Dark glowing CRT visor */}
          <rect x="29" y="41" width="42" height="23" rx="7" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
          {/* Visor glass glare */}
          <path d="M33,44 L45,44 L37,61 L31,61 Z" fill="#38bdf8" opacity="0.14" stroke="none" />
          {/* Speaker mouth grill */}
          <rect x="38" y="70" width="24" height="8" rx="4" fill="#1e293b" stroke="none" />
        </g>
      );

    case 'alien':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          <path d="M34,21 Q38,29 42,35" fill="none" stroke="#65a30d" strokeWidth="3.5" />
          <circle cx="33" cy="19" r="5.5" fill="#d9f99d" />
          <path d="M66,21 Q62,29 58,35" fill="none" stroke="#65a30d" strokeWidth="3.5" />
          <circle cx="67" cy="19" r="5.5" fill="#d9f99d" />
          {/* Sculpted alien head */}
          <path
            d="M21,55 C21,36 34,29 50,29 C66,29 79,36 79,55 C79,73 66,87 50,87 C34,87 21,73 21,55 Z"
            fill="#84cc16"
          />
          <ellipse cx="41" cy="39" rx="12" ry="5" transform="rotate(-14 41 39)" fill="#ecfccb" opacity="0.5" stroke="none" />
          <path d="M24,66 A29,26 0 0,0 76,66 A32,16 0 0,1 24,66 Z" fill="#365314" opacity="0.18" stroke="none" />
        </g>
      );

    case 'ghost':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          <path
            d="M22,58 C22,33 34,24 50,24 C66,24 78,33 78,58 L78,84 Q72,78 66,84 Q60,90 54,84 Q50,80 46,84 Q40,90 34,84 Q28,78 22,84 Z"
            fill="#f8fafc"
          />
          {/* Soft iridescent lavender shading */}
          <path
            d="M24,70 Q50,80 76,70 L76,82 Q70,77 65,82 Q60,87 54,82 Q50,78 46,82 Q40,87 35,82 Q29,77 24,82 Z"
            fill="#c7d2fe"
            opacity="0.55"
            stroke="none"
          />
          <ellipse cx="40" cy="36" rx="10" ry="5" transform="rotate(-18 40 36)" fill="#ffffff" stroke="none" />
        </g>
      );

    case 'unicorn':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Ears */}
          <path d="M25,44 L27,23 L41,35 Z" fill="#f8fafc" />
          <path d="M29,39 L30,28 L38,35 Z" fill="#fbcfe8" stroke="none" />
          <path d="M75,44 L73,23 L59,35 Z" fill="#f8fafc" />
          <path d="M71,39 L70,28 L62,35 Z" fill="#fbcfe8" stroke="none" />
          {/* Spiraled metallic golden horn */}
          <polygon points="43,36 50,9 57,36" fill={`url(#${ids.gold})`} />
          <line x1="46" y1="28" x2="54" y2="25" stroke="#92400e" strokeWidth="1.4" />
          <line x1="47.5" y1="21" x2="53" y2="19" stroke="#92400e" strokeWidth="1.4" />
          {/* Pastel swooping mane */}
          <path d="M26,41 Q38,29 49,38 Q38,45 24,50 Z" fill="#ec4899" />
          <path d="M74,41 Q62,29 51,38 Q62,45 76,50 Z" fill="#a855f7" />
          {/* Ivory head */}
          <ellipse cx="50" cy="61" rx="28" ry="26" fill="#f8fafc" />
          <ellipse cx="50" cy="72" rx="17" ry="11.5" fill="#fce7f3" stroke="#ec4899" strokeWidth="1.4" />
        </g>
      );

    case 'octopus':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Curling tentacles */}
          <path d="M25,68 C16,74 17,86 27,86 C33,86 35,80 33,74" fill="#9333ea" />
          <path d="M75,68 C84,74 83,86 73,86 C67,86 65,80 67,74" fill="#9333ea" />
          <ellipse cx="38" cy="81" rx="7" ry="8" fill="#9333ea" />
          <ellipse cx="50" cy="83" rx="7" ry="8" fill="#a855f7" />
          <ellipse cx="62" cy="81" rx="7" ry="8" fill="#9333ea" />
          {/* Glossy bulbous dome */}
          <ellipse cx="50" cy="52" rx="29" ry="26" fill="#a855f7" />
          <ellipse cx="39" cy="36" rx="11" ry="5.5" transform="rotate(-18 39 36)" fill="#f3e8ff" opacity="0.48" stroke="none" />
          {/* Cute suction dots */}
          <circle cx="25" cy="82" r="2" fill="#e9d5ff" stroke="none" />
          <circle cx="75" cy="82" r="2" fill="#e9d5ff" stroke="none" />
        </g>
      );

    case 'beer':
      return (
        <g stroke={OUTLINE} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
          {/* Glass handle */}
          <path d="M71,48 C87,48 87,76 71,76" fill="none" stroke={OUTLINE} strokeWidth="10" />
          <path d="M71,48 C87,48 87,76 71,76" fill="none" stroke="#e2e8f0" strokeWidth="5.5" />
          {/* Golden lager mug */}
          <rect x="25" y="38" width="48" height="49" rx="9" fill={`url(#${ids.beer})`} />
          {/* Glass highlight & vertical facets */}
          <rect x="30" y="47" width="6" height="33" rx="3" fill="#ffffff" opacity="0.34" stroke="none" />
          <rect x="61" y="49" width="5" height="30" rx="2.5" fill="#92400e" opacity="0.18" stroke="none" />
          {/* Rising carbonation bubbles */}
          <circle cx="43" cy="77" r="2" fill="#fef9c3" opacity="0.7" stroke="none" />
          <circle cx="57" cy="72" r="1.7" fill="#fef9c3" opacity="0.65" stroke="none" />
          <circle cx="49" cy="64" r="1.5" fill="#fef9c3" opacity="0.6" stroke="none" />
          {/* Rich sculpted foam head */}
          <path
            d="M23,41 C20,33 28,27 36,31 C40,23 55,22 60,30 C69,26 78,33 74,42 C74,47 68,48 63,46 C59,51 52,50 49,46 C44,51 35,49 33,45 C27,48 23,45 23,41 Z"
            fill="#ffffff"
          />
          <path d="M29,43 Q49,47 69,43" fill="none" stroke="#e2e8f0" strokeWidth="2.2" />
        </g>
      );

    default:
      return <circle cx="50" cy="58" r="28" fill="#fbbf24" stroke={OUTLINE} strokeWidth="2.3" />;
  }
}

function renderFaceFeatures(character: string, expression: string, anchor: CharacterAnchor): React.ReactNode {
  const lx = 50 - anchor.eyeSpread;
  const rx = 50 + anchor.eyeSpread;
  const ey = anchor.eyeY;
  const my = anchor.mouthY;
  const eyeColor = anchor.isRobot ? '#38bdf8' : anchor.isPanda ? '#f8fafc' : '#1b1714';
  const mouthColor = anchor.isRobot ? '#38bdf8' : '#1b1714';

  const renderEyes = () => {
    if (expression === 'laugh') {
      return (
        <g fill="none" stroke={eyeColor} strokeWidth="3.2" strokeLinecap="round">
          <path d={`M${lx - 5},${ey + 1} Q${lx},${ey - 5.5} ${lx + 5},${ey + 1}`} />
          <path d={`M${rx - 5},${ey + 1} Q${rx},${ey - 5.5} ${rx + 5},${ey + 1}`} />
        </g>
      );
    }

    if (expression === 'love') {
      const heart = (cx: number, cy: number) => (
        <path
          d={`M${cx},${cy + 4.8} C${cx - 6.2},${cy + 0.5} ${cx - 6.2},${cy - 5.2} ${cx},${cy - 1.6} C${cx + 6.2},${cy - 5.2} ${cx + 6.2},${cy + 0.5} ${cx},${cy + 4.8} Z`}
          fill="#f43f5e"
          stroke="#881337"
          strokeWidth="1.2"
        />
      );
      return (
        <g>
          {heart(lx, ey)}
          {heart(rx, ey)}
        </g>
      );
    }

    if (expression === 'wink') {
      return (
        <g>
          <circle cx={lx} cy={ey} r="4.8" fill={eyeColor} />
          <circle cx={lx - 1.5} cy={ey - 1.6} r="1.7" fill="#ffffff" />
          <circle cx={lx + 1.5} cy={ey + 1.5} r="0.9" fill="#ffffff" opacity="0.8" />
          <path
            d={`M${rx - 5},${ey + 0.5} Q${rx},${ey - 4.5} ${rx + 5},${ey + 0.5}`}
            fill="none"
            stroke={eyeColor}
            strokeWidth="3.1"
            strokeLinecap="round"
          />
        </g>
      );
    }

    const r = expression === 'surprised' ? 5.3 : 4.7;
    return (
      <g>
        {/* Subtle expressive eyebrows */}
        {expression === 'cool' && !anchor.isRobot && (
          <g stroke={OUTLINE} strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
            <line x1={lx - 5} y1={ey - 7.5} x2={lx + 4} y2={ey - 6.5} />
            <path d={`M${rx - 4},${ey - 7} Q${rx},${ey - 10} ${rx + 5},${ey - 7.5}`} fill="none" />
          </g>
        )}
        <circle cx={lx} cy={ey} r={r} fill={eyeColor} />
        <circle cx={rx} cy={ey} r={r} fill={eyeColor} />
        {!anchor.isPanda && (
          <>
            <circle cx={lx - 1.5} cy={ey - 1.6} r="1.7" fill="#ffffff" />
            <circle cx={rx - 1.5} cy={ey - 1.6} r="1.7" fill="#ffffff" />
            <circle cx={lx + 1.5} cy={ey + 1.5} r="0.9" fill="#ffffff" opacity="0.75" />
            <circle cx={rx + 1.5} cy={ey + 1.5} r="0.9" fill="#ffffff" opacity="0.75" />
          </>
        )}
        {anchor.isPanda && (
          <>
            <circle cx={lx} cy={ey} r="2.5" fill="#0f172a" />
            <circle cx={rx} cy={ey} r="2.5" fill="#0f172a" />
            <circle cx={lx - 1} cy={ey - 1.1} r="1.1" fill="#ffffff" />
            <circle cx={rx - 1} cy={ey - 1.1} r="1.1" fill="#ffffff" />
          </>
        )}
      </g>
    );
  };

  return (
    <g>
      {/* Warm rosy cheeks */}
      {!anchor.isRobot && (
        <g opacity="0.45" fill="#fb7185">
          <ellipse cx={lx - 6} cy={anchor.cheekY} rx="5.2" ry="3.1" />
          <ellipse cx={rx + 6} cy={anchor.cheekY} rx="5.2" ry="3.1" />
        </g>
      )}

      {renderEyes()}

      {/* Sculpted beak or glossy nose */}
      {anchor.hasBeak ? (
        <g stroke={OUTLINE} strokeWidth="1.8" strokeLinejoin="round">
          <path d={`M44,${ey + 5} Q50,${ey + 2} 56,${ey + 5} L50,${ey + 14} Z`} fill="#f97316" />
          <path d={`M47,${ey + 6} L50,${ey + 10.5} L52,${ey + 6} Z`} fill="#fed7aa" stroke="none" opacity="0.6" />
        </g>
      ) : !anchor.noNose ? (
        <g>
          <ellipse cx="50" cy={my - 7.5} rx="4.6" ry="3.3" fill={OUTLINE} />
          <ellipse cx="48.5" cy={my - 8.6} rx="1.6" ry="0.9" fill="#ffffff" opacity="0.55" />
        </g>
      ) : null}

      {/* Mouth */}
      {!anchor.hasBeak && (
        <>
          {expression === 'surprised' ? (
            <ellipse cx="50" cy={my + 1} rx="4.2" ry="5" fill={mouthColor} />
          ) : expression === 'laugh' ? (
            <g>
              <path
                d={`M41,${my - 2} Q50,${my + 10} 59,${my - 2} Z`}
                fill={anchor.isRobot ? '#38bdf8' : '#991b1b'}
                stroke={mouthColor}
                strokeWidth="2.1"
                strokeLinejoin="round"
              />
              {!anchor.isRobot && (
                <ellipse cx="50" cy={my + 3.5} rx="4.5" ry="2.2" fill="#fb7185" />
              )}
            </g>
          ) : expression === 'cool' ? (
            <path
              d={`M42,${my + 1} Q52,${my + 4} 60,${my - 3}`}
              fill="none"
              stroke={mouthColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : (
            <path
              d={`M41.5,${my - 1} Q50,${my + 7} 58.5,${my - 1}`}
              fill="none"
              stroke={mouthColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          )}
        </>
      )}

      {/* Dapper handlebar mustache */}
      {expression === 'mustache' && (
        <g stroke={OUTLINE} strokeWidth="1.6" strokeLinejoin="round">
          <path
            d={`M50,${my - 3} C45,${my - 8} 34,${my - 6} 31,${my + 1} C36,${my + 3} 44,${my + 2} 50,${my - 0.5} C56,${my + 2} 64,${my + 3} 69,${my + 1} C66,${my - 6} 55,${my - 8} 50,${my - 3} Z`}
            fill="#44403c"
          />
          <path d={`M38,${my - 2} Q43,${my - 4} 48,${my - 2}`} fill="none" stroke="#a8a29e" strokeWidth="1.2" opacity="0.5" />
        </g>
      )}

      {/* Glossy satin red bowtie */}
      {expression === 'bowtie' && (
        <g transform={`translate(50, ${character === 'beer' ? 86 : 85})`} stroke={OUTLINE} strokeWidth="1.9" strokeLinejoin="round">
          <path d="M0,0 L-14,-7.5 Q-16,0 -14,7.5 Z" fill="#ef4444" />
          <path d="M0,0 L14,-7.5 Q16,0 14,7.5 Z" fill="#ef4444" />
          <circle cx="0" cy="0" r="4" fill="#b91c1c" />
          <circle cx="-1" cy="-1" r="1.2" fill="#fca5a5" stroke="none" />
        </g>
      )}
    </g>
  );
}

function renderGlasses(glasses: string, anchor: CharacterAnchor, ids: SvgGradientIds): React.ReactNode {
  if (glasses === 'none') return null;
  const dy = anchor.eyeY - 54;
  const lx = 50 - anchor.eyeSpread;
  const rx = 50 + anchor.eyeSpread;

  switch (glasses) {
    case 'sunglasses':
      return (
        <g transform={`translate(0, ${dy})`}>
          {/* Soft shadow on face */}
          <rect x={lx - 11} y="49" width="21" height="14" rx="4.5" fill="#000000" opacity="0.2" />
          <rect x={rx - 10} y="49" width="21" height="14" rx="4.5" fill="#000000" opacity="0.2" />
          {/* Sleek frames */}
          <path
            d={`M${lx - 12},49 Q${lx},46 ${lx + 10},49 L${lx + 9},59 Q${lx},63 ${lx - 10},59 Z`}
            fill={`url(#${ids.lens})`}
            stroke={OUTLINE}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d={`M${rx - 10},49 Q${rx},46 ${rx + 12},49 L${rx + 10},59 Q${rx},63 ${rx - 9},59 Z`}
            fill={`url(#${ids.lens})`}
            stroke={OUTLINE}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d={`M${lx + 9},51 Q50,49 ${rx - 9},51`} fill="none" stroke={OUTLINE} strokeWidth="2.6" />
          {/* Crisp lens glare streaks */}
          <line x1={lx - 7} y1="50.5" x2={lx - 2} y2="57.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
          <line x1={rx - 6} y1="50.5" x2={rx - 1} y2="57.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
        </g>
      );

    case 'round':
      return (
        <g transform={`translate(0, ${dy})`}>
          <circle cx={lx} cy="54" r="9.5" fill="#ffffff" fillOpacity="0.24" stroke={`url(#${ids.gold})`} strokeWidth="2.8" />
          <circle cx={rx} cy="54" r="9.5" fill="#ffffff" fillOpacity="0.24" stroke={`url(#${ids.gold})`} strokeWidth="2.8" />
          <path d={`M${lx + 9.2},54 Q50,51 ${rx - 9.2},54`} fill="none" stroke={`url(#${ids.gold})`} strokeWidth="2.6" />
          <path d={`M${lx - 5},49 A6,6 0 0,1 ${lx + 1},47.5`} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <path d={`M${rx - 5},49 A6,6 0 0,1 ${rx + 1},47.5`} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
      );

    case 'visor':
      return (
        <g transform={`translate(0, ${dy})`}>
          <rect
            x="22"
            y="47"
            width="56"
            height="14"
            rx="7"
            fill="#0284c7"
            fillOpacity="0.82"
            stroke={OUTLINE}
            strokeWidth="2.2"
          />
          <rect x="26" y="50" width="48" height="3.2" rx="1.6" fill="#7dd3fc" opacity="0.85" />
          <path d="M29,49 L38,49 L33,59 L25,59 Z" fill="#ffffff" opacity="0.3" />
        </g>
      );

    case 'star':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="1.8" strokeLinejoin="round">
          <line x1={lx + 6} y1="53" x2={rx - 6} y2="53" stroke={OUTLINE} strokeWidth="2.5" />
          <polygon
            transform={`translate(${lx}, 54)`}
            points="0,-11 3.2,-3.5 11,-3 5,2.2 6.8,10 0,5.8 -6.8,10 -5,2.2 -11,-3 -3.2,-3.5"
            fill={`url(#${ids.gold})`}
          />
          <polygon
            transform={`translate(${rx}, 54)`}
            points="0,-11 3.2,-3.5 11,-3 5,2.2 6.8,10 0,5.8 -6.8,10 -5,2.2 -11,-3 -3.2,-3.5"
            fill={`url(#${ids.gold})`}
          />
        </g>
      );

    case 'monocle':
      return (
        <g transform={`translate(0, ${dy})`}>
          <path
            d={`M${rx + 9.5},56 Q${rx + 15},70 ${rx + 10},86`}
            fill="none"
            stroke={`url(#${ids.gold})`}
            strokeWidth="2"
            strokeDasharray="2.5 2"
          />
          <circle cx={rx} cy="54" r="10" fill="#fef9c3" fillOpacity="0.28" stroke={`url(#${ids.gold})`} strokeWidth="2.8" />
          <path d={`M${rx - 5},49 A6,6 0 0,1 ${rx + 2},47.5`} fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
        </g>
      );

    case 'retro3d':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round">
          <rect x="23" y="46.5" width="54" height="15" rx="3.5" fill="#f8fafc" />
          <rect x="27" y="49.5" width="19" height="9" rx="1.5" fill="#ef4444" stroke="none" opacity="0.88" />
          <rect x="54" y="49.5" width="19" height="9" rx="1.5" fill="#06b6d4" stroke="none" opacity="0.88" />
          <line x1="30" y1="50.5" x2="34" y2="57.5" stroke="#ffffff" strokeWidth="1.8" opacity="0.55" />
          <line x1="57" y1="50.5" x2="61" y2="57.5" stroke="#ffffff" strokeWidth="1.8" opacity="0.55" />
        </g>
      );

    case 'pixel':
      return (
        <g transform={`translate(0, ${dy})`}>
          <rect x="23" y="48" width="54" height="5" fill="#0f172a" />
          <rect x="26" y="53" width="19" height="5" fill="#0f172a" />
          <rect x="55" y="53" width="19" height="5" fill="#0f172a" />
          <rect x="29" y="58" width="13" height="3" fill="#0f172a" />
          <rect x="58" y="58" width="13" height="3" fill="#0f172a" />
          <rect x="29" y="50" width="5" height="3" fill="#ffffff" />
          <rect x="34" y="53" width="3" height="3" fill="#ffffff" />
          <rect x="58" y="50" width="5" height="3" fill="#ffffff" />
          <rect x="63" y="53" width="3" height="3" fill="#ffffff" />
        </g>
      );

    default:
      return null;
  }
}

function renderHat(hat: string, anchor: CharacterAnchor, ids: SvgGradientIds): React.ReactNode {
  if (hat === 'none') return null;
  const dy = anchor.hatY;

  switch (hat) {
    case 'crown':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <ellipse cx="50" cy="34" rx="20" ry="3.5" fill="#000000" opacity="0.22" stroke="none" />
          <path d="M29,33 L32,14 L42,24 L50,11 L58,24 L68,14 L71,33 Q50,37 29,33 Z" fill={`url(#${ids.gold})`} />
          <circle cx="32" cy="13.5" r="2.4" fill="#fef08a" />
          <circle cx="50" cy="10.5" r="2.8" fill="#fef08a" />
          <circle cx="68" cy="13.5" r="2.4" fill="#fef08a" />
          <circle cx="50" cy="27" r="2.8" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1.1" />
          <circle cx="38" cy="28" r="2.1" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="1" />
          <circle cx="62" cy="28" r="2.1" fill="#10b981" stroke="#065f46" strokeWidth="1" />
        </g>
      );

    case 'graduation':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path d="M32,26 L32,35 Q50,40 68,35 L68,26 Z" fill="#1e293b" />
          <polygon points="50,12 80,22 50,32 20,22" fill="#0f172a" />
          <polygon points="50,15 73,22 50,29 27,22" fill="#334155" stroke="none" opacity="0.45" />
          {/* Golden tassel */}
          <path d="M50,22 L73,26 L75,40" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="75" cy="41" r="2.8" fill={`url(#${ids.gold})`} stroke={OUTLINE} strokeWidth="1.4" />
        </g>
      );

    case 'cap':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path d="M26,35 C26,16 74,16 74,35 Z" fill="#dc2626" />
          <path d="M35,20 Q47,16 58,20" fill="none" stroke="#fca5a5" strokeWidth="2" opacity="0.45" />
          <path d="M25,33 L84,35 C84,40 71,42 50,39 L25,36 Z" fill="#991b1b" />
          <circle cx="50" cy="18" r="3" fill="#fef08a" />
        </g>
      );

    case 'wizard':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <ellipse cx="50" cy="34" rx="30" ry="6.5" fill="#4c1d95" />
          <path d="M30,33 L49,5 L70,33 Q50,37 30,33 Z" fill="#6d28d9" />
          <path d="M32,28 Q50,32 68,28 L69,33 Q50,37 31,33 Z" fill={`url(#${ids.gold})`} stroke="none" />
          <polygon
            points="50,14 52,19 57,19.5 53,22.5 54.5,27 50,24.5 45.5,27 47,22.5 43,19.5 48,19"
            fill="#fef08a"
            stroke="#92400e"
            strokeWidth="1"
          />
        </g>
      );

    case 'viking':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          {/* Curved ivory horns */}
          <path d="M28,29 C14,25 11,13 18,8 C18,16 23,20 31,22 Z" fill="#fef9c3" />
          <path d="M72,29 C86,25 89,13 82,8 C82,16 77,20 69,22 Z" fill="#fef9c3" />
          {/* Steel dome */}
          <path d="M26,35 C26,17 74,17 74,35 Q50,38 26,35 Z" fill={`url(#${ids.steel})`} />
          <path d="M25,31 Q50,35 75,31 L74,36 Q50,40 26,36 Z" fill={`url(#${ids.gold})`} />
          <circle cx="38" cy="34" r="1.4" fill={OUTLINE} stroke="none" />
          <circle cx="50" cy="35" r="1.4" fill={OUTLINE} stroke="none" />
          <circle cx="62" cy="34" r="1.4" fill={OUTLINE} stroke="none" />
        </g>
      );

    case 'pirate':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path d="M18,36 C21,16 38,12 50,15 C62,12 79,16 82,36 Q50,30 18,36 Z" fill="#0f172a" />
          <path d="M21,34 C25,20 39,16 50,18 C61,16 75,20 79,34" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="2" />
          <circle cx="50" cy="24" r="4.2" fill="#f8fafc" stroke="none" />
          <line x1="44" y1="29" x2="56" y2="29" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );

    case 'chef':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path
            d="M31,28 C23,23 26,12 36,14 C40,7 60,7 64,14 C74,12 77,23 69,28 Z"
            fill="#ffffff"
          />
          <rect x="30" y="25" width="40" height="10" rx="3" fill="#f1f5f9" />
          <line x1="42" y1="15" x2="42" y2="24" stroke="#cbd5e1" strokeWidth="1.6" />
          <line x1="58" y1="15" x2="58" y2="24" stroke="#cbd5e1" strokeWidth="1.6" />
        </g>
      );

    case 'headphones':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M19,54 C19,19 81,19 81,54" fill="none" stroke={OUTLINE} strokeWidth="8.5" strokeLinecap="round" />
          <path d="M19,54 C19,19 81,19 81,54" fill="none" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
          <rect x="12" y="45" width="11" height="22" rx="5.5" fill="#ef4444" />
          <rect x="15" y="48" width="3" height="15" rx="1.5" fill="#fca5a5" stroke="none" opacity="0.55" />
          <rect x="77" y="45" width="11" height="22" rx="5.5" fill="#ef4444" />
          <rect x="80" y="48" width="3" height="15" rx="1.5" fill="#fca5a5" stroke="none" opacity="0.55" />
        </g>
      );

    case 'party':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path d="M33,34 L50,7 L67,34 Q50,38 33,34 Z" fill="#ec4899" />
          <line x1="41" y1="22" x2="59" y2="22" stroke="#fde047" strokeWidth="3.2" />
          <line x1="36" y1="30" x2="64" y2="30" stroke="#38bdf8" strokeWidth="3" />
          <circle cx="50" cy="7" r="4.8" fill="#fef08a" />
        </g>
      );

    case 'beret':
      return (
        <g transform={`translate(0, ${dy})`} stroke={OUTLINE} strokeWidth="2.1" strokeLinejoin="round">
          <path d="M47,13 L49,19" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="48" cy="27" rx="25" ry="10.5" transform="rotate(-9 48 27)" fill="#be123c" />
          <path d="M32,24 Q47,18 62,22" fill="none" stroke="#fda4af" strokeWidth="2" opacity="0.4" />
        </g>
      );

    case 'halo':
      return (
        <g transform={`translate(0, ${dy})`}>
          <ellipse cx="50" cy="17" rx="22" ry="6" fill="none" stroke="#fef08a" strokeWidth="7" opacity="0.32" />
          <ellipse cx="50" cy="17" rx="21" ry="5.5" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="4.2" />
          <ellipse cx="50" cy="16.5" rx="19" ry="4.5" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.65" />
        </g>
      );

    default:
      return null;
  }
}
