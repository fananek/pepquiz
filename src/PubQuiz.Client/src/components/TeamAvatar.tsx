import React from 'react';

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
  { id: 'bear', label: 'Medvěd', base: '#78350f', accent: '#d6a271' },
  { id: 'cat', label: 'Kočka', base: '#f59e0b', accent: '#fef3c7' },
  { id: 'dog', label: 'Pes', base: '#b45309', accent: '#fef3c7' },
  { id: 'panda', label: 'Panda', base: '#f8fafc', accent: '#1e293b' },
  { id: 'frog', label: 'Žába', base: '#22c55e', accent: '#bbf7d0' },
  { id: 'penguin', label: 'Tučňák', base: '#1e293b', accent: '#f8fafc' },
  { id: 'lion', label: 'Lev', base: '#f59e0b', accent: '#9a3412' },
  { id: 'rabbit', label: 'Králík', base: '#e2e8f0', accent: '#fda4af' },
  { id: 'robot', label: 'Robot', base: '#64748b', accent: '#38bdf8' },
  { id: 'alien', label: 'Mimozemšťan', base: '#84cc16', accent: '#365314' },
  { id: 'ghost', label: 'Duch', base: '#f1f5f9', accent: '#cbd5e1' },
  { id: 'unicorn', label: 'Jednorožec', base: '#f8fafc', accent: '#ec4899' },
  { id: 'octopus', label: 'Chobotnice', base: '#a855f7', accent: '#e9d5ff' },
  { id: 'beer', label: 'Pivní korbel', base: '#f59e0b', accent: '#ffffff' }
] as const;

export const AVATAR_HATS = [
  { id: 'none', label: 'Bez pokrývky' },
  { id: 'crown', label: 'Koruna' },
  { id: 'cap', label: 'Kšiltovka' },
  { id: 'wizard', label: 'Kouzelník' },
  { id: 'pirate', label: 'Pirát' },
  { id: 'chef', label: 'Kuchař' },
  { id: 'headphones', label: 'Sluchátka' },
  { id: 'party', label: 'Párty' },
  { id: 'halo', label: 'Svatozář' },
  { id: 'beret', label: 'Baret' }
] as const;

export const AVATAR_GLASSES = [
  { id: 'none', label: 'Bez brýlí' },
  { id: 'sunglasses', label: 'Sluneční' },
  { id: 'round', label: 'Kulaté' },
  { id: 'star', label: 'Hvězdičky' },
  { id: 'monocle', label: 'Monokl' },
  { id: 'retro3d', label: '3D brýle' },
  { id: 'pixel', label: 'Pixel MLG' }
] as const;

export const AVATAR_EXPRESSIONS = [
  { id: 'happy', label: 'Veselý' },
  { id: 'cool', label: 'Cool úsměv' },
  { id: 'surprised', label: 'Překvapený' },
  { id: 'wink', label: 'Mrkající' },
  { id: 'mustache', label: 'Knírek' },
  { id: 'bowtie', label: 'Motýlek' }
] as const;

export const AVATAR_PATTERNS = [
  { id: 'solid', label: 'Jednobarevné' },
  { id: 'rays', label: 'Paprsky' },
  { id: 'dots', label: 'Puntíky' },
  { id: 'stars', label: 'Hvězdy' }
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
  '#334155'
] as const;

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
  // Map legacy simple IDs cleanly
  const legacyMap: Record<string, Partial<AvatarConfig>> = {
    wolf: { character: 'dog', hat: 'none' },
    crown: { character: 'lion', hat: 'crown' },
    rocket: { character: 'robot', hat: 'halo' },
    brain: { character: 'alien', glasses: 'round' },
    dragon: { character: 'frog', hat: 'crown' },
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

export function TeamAvatar({ avatarId, avatarColor, size = 'md' }: TeamAvatarProps) {
  const cfg = parseAvatarId(avatarId);
  const bg = avatarColor || '#b45309';

  const dims =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
        ? 'w-16 h-16'
        : size === 'xl'
          ? 'w-28 h-28'
          : 'w-11 h-11';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none shadow-sm border-2 border-white/30 ${dims}`}
      style={{ backgroundColor: bg }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full block">
        {renderPattern(cfg.pattern)}
        {renderCharacterBase(cfg.character)}
        {renderFaceFeatures(cfg.character, cfg.expression)}
        {renderGlasses(cfg.glasses)}
        {renderHat(cfg.hat)}
      </svg>
    </span>
  );
}

function renderPattern(pattern: string): React.ReactNode {
  if (pattern === 'rays') {
    return (
      <g opacity="0.18" fill="#ffffff">
        <polygon points="50,50 40,0 60,0" />
        <polygon points="50,50 85,0 100,15" />
        <polygon points="50,50 100,40 100,60" />
        <polygon points="50,50 100,85 85,100" />
        <polygon points="50,50 60,100 40,100" />
        <polygon points="50,50 15,100 0,85" />
        <polygon points="50,50 0,60 0,40" />
        <polygon points="50,50 0,15 15,0" />
      </g>
    );
  }
  if (pattern === 'dots') {
    return (
      <g opacity="0.22" fill="#ffffff">
        <circle cx="16" cy="20" r="4" />
        <circle cx="84" cy="22" r="5" />
        <circle cx="14" cy="76" r="5" />
        <circle cx="86" cy="78" r="4" />
        <circle cx="50" cy="12" r="3" />
        <circle cx="24" cy="48" r="3" />
        <circle cx="78" cy="52" r="3" />
      </g>
    );
  }
  if (pattern === 'stars') {
    return (
      <g opacity="0.3" fill="#fef08a">
        <polygon points="18,14 20,20 26,20 21,23 23,29 18,25 13,29 15,23 10,20 16,20" />
        <polygon points="82,16 83.5,20 88,20 84.5,22.5 86,27 82,24 78,27 79.5,22.5 76,20 80.5,20" />
        <polygon points="16,74 17.5,78 22,78 18.5,80.5 20,85 16,82 12,85 13.5,80.5 10,78 14.5,78" />
        <polygon points="84,72 86,77 91,77 87,80 88.5,85 84,82 79.5,85 81,80 77,77 82,77" />
      </g>
    );
  }
  return null;
}

function renderCharacterBase(character: string): React.ReactNode {
  switch (character) {
    case 'owl':
      return (
        <g>
          {/* Ear tufts */}
          <polygon points="24,38 30,22 42,33" fill="#78350f" />
          <polygon points="76,38 70,22 58,33" fill="#78350f" />
          {/* Head & body */}
          <ellipse cx="50" cy="60" rx="30" ry="30" fill="#92400e" />
          <ellipse cx="50" cy="72" rx="20" ry="17" fill="#fde68a" />
          {/* Facial discs */}
          <circle cx="38" cy="52" r="11" fill="#fef3c7" />
          <circle cx="62" cy="52" r="11" fill="#fef3c7" />
        </g>
      );
    case 'fox':
      return (
        <g>
          <polygon points="22,45 24,18 44,34" fill="#ea580c" />
          <polygon points="26,40 27,25 38,34" fill="#1e293b" />
          <polygon points="78,45 76,18 56,34" fill="#ea580c" />
          <polygon points="74,40 73,25 62,34" fill="#1e293b" />
          <ellipse cx="50" cy="60" rx="31" ry="27" fill="#ea580c" />
          <path d="M22,62 Q35,84 50,86 Q65,84 78,62 Q65,68 50,60 Q35,68 22,62 Z" fill="#fff7ed" />
        </g>
      );
    case 'bear':
      return (
        <g>
          <circle cx="27" cy="34" r="11" fill="#78350f" />
          <circle cx="27" cy="34" r="6" fill="#d6a271" />
          <circle cx="73" cy="34" r="11" fill="#78350f" />
          <circle cx="73" cy="34" r="6" fill="#d6a271" />
          <circle cx="50" cy="60" r="30" fill="#78350f" />
          <ellipse cx="50" cy="67" rx="14" ry="11" fill="#d6a271" />
        </g>
      );
    case 'cat':
      return (
        <g>
          <polygon points="23,46 25,20 44,35" fill="#f59e0b" />
          <polygon points="27,42 28,27 39,36" fill="#fda4af" />
          <polygon points="77,46 75,20 56,35" fill="#f59e0b" />
          <polygon points="73,42 72,27 61,36" fill="#fda4af" />
          <ellipse cx="50" cy="60" rx="30" ry="27" fill="#f59e0b" />
          <path d="M46,35 L50,43 L54,35" fill="#b45309" />
          <line x1="16" y1="60" x2="29" y2="62" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="67" x2="29" y2="66" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="60" x2="71" y2="62" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="67" x2="71" y2="66" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'dog':
      return (
        <g>
          {/* Floppy ears */}
          <ellipse cx="20" cy="58" rx="9" ry="19" transform="rotate(14 20 58)" fill="#78350f" />
          <ellipse cx="80" cy="58" rx="9" ry="19" transform="rotate(-14 80 58)" fill="#78350f" />
          <circle cx="50" cy="59" r="29" fill="#d97706" />
          <ellipse cx="50" cy="68" rx="15" ry="12" fill="#fef3c7" />
        </g>
      );
    case 'panda':
      return (
        <g>
          <circle cx="27" cy="34" r="10" fill="#0f172a" />
          <circle cx="73" cy="34" r="10" fill="#0f172a" />
          <circle cx="50" cy="60" r="30" fill="#f8fafc" />
          <ellipse cx="38" cy="54" rx="9" ry="11" transform="rotate(-15 38 54)" fill="#0f172a" />
          <ellipse cx="62" cy="54" rx="9" ry="11" transform="rotate(15 62 54)" fill="#0f172a" />
        </g>
      );
    case 'frog':
      return (
        <g>
          <circle cx="34" cy="38" r="12" fill="#22c55e" />
          <circle cx="66" cy="38" r="12" fill="#22c55e" />
          <ellipse cx="50" cy="62" rx="32" ry="25" fill="#22c55e" />
          <ellipse cx="50" cy="72" rx="22" ry="12" fill="#bbf7d0" />
        </g>
      );
    case 'penguin':
      return (
        <g>
          <ellipse cx="50" cy="60" rx="29" ry="31" fill="#1e293b" />
          <path d="M28,60 Q28,42 40,42 Q47,42 50,50 Q53,42 60,42 Q72,42 72,60 Q72,88 50,88 Q28,88 28,60 Z" fill="#f8fafc" />
        </g>
      );
    case 'lion':
      return (
        <g>
          {/* Mane */}
          <circle cx="50" cy="58" r="37" fill="#9a3412" />
          <circle cx="27" cy="34" r="9" fill="#f59e0b" />
          <circle cx="73" cy="34" r="9" fill="#f59e0b" />
          <circle cx="50" cy="59" r="26" fill="#fbbf24" />
          <ellipse cx="50" cy="67" rx="12" ry="9" fill="#fef3c7" />
        </g>
      );
    case 'rabbit':
      return (
        <g>
          <ellipse cx="37" cy="24" rx="7" ry="20" transform="rotate(-8 37 24)" fill="#f1f5f9" />
          <ellipse cx="37" cy="25" rx="3.5" ry="13" transform="rotate(-8 37 25)" fill="#fda4af" />
          <ellipse cx="63" cy="24" rx="7" ry="20" transform="rotate(8 63 24)" fill="#f1f5f9" />
          <ellipse cx="63" cy="25" rx="3.5" ry="13" transform="rotate(8 63 25)" fill="#fda4af" />
          <ellipse cx="50" cy="62" rx="28" ry="26" fill="#f1f5f9" />
        </g>
      );
    case 'robot':
      return (
        <g>
          <line x1="50" y1="20" x2="50" y2="33" stroke="#cbd5e1" strokeWidth="4" />
          <circle cx="50" cy="18" r="5" fill="#facc15" />
          <rect x="19" y="50" width="7" height="16" rx="3" fill="#475569" />
          <rect x="74" y="50" width="7" height="16" rx="3" fill="#475569" />
          <rect x="24" y="33" width="52" height="52" rx="12" fill="#94a3b8" stroke="#334155" strokeWidth="2.5" />
          <rect x="30" y="42" width="40" height="22" rx="6" fill="#0f172a" />
        </g>
      );
    case 'alien':
      return (
        <g>
          <line x1="36" y1="22" x2="42" y2="35" stroke="#84cc16" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="35" cy="20" r="5" fill="#bef264" />
          <line x1="64" y1="22" x2="58" y2="35" stroke="#84cc16" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="65" cy="20" r="5" fill="#bef264" />
          <ellipse cx="50" cy="59" rx="29" ry="28" fill="#84cc16" />
        </g>
      );
    case 'ghost':
      return (
        <g>
          <path
            d="M22,60 C22,34 34,26 50,26 C66,26 78,34 78,60 L78,86 L69,80 L60,86 L50,80 L40,86 L31,80 L22,86 Z"
            fill="#f8fafc"
          />
        </g>
      );
    case 'unicorn':
      return (
        <g>
          <polygon points="44,34 50,10 56,34" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
          <polygon points="26,42 29,24 41,35" fill="#f8fafc" />
          <polygon points="74,42 71,24 59,35" fill="#f8fafc" />
          <path d="M28,36 Q38,28 45,35 Q36,42 26,46 Z" fill="#ec4899" />
          <path d="M72,36 Q62,28 55,35 Q64,42 74,46 Z" fill="#a855f7" />
          <ellipse cx="50" cy="60" rx="28" ry="27" fill="#f8fafc" />
          <ellipse cx="50" cy="70" rx="16" ry="11" fill="#fce7f3" />
        </g>
      );
    case 'octopus':
      return (
        <g>
          <ellipse cx="50" cy="52" rx="28" ry="26" fill="#a855f7" />
          <circle cx="28" cy="78" r="8" fill="#9333ea" />
          <circle cx="43" cy="82" r="8" fill="#9333ea" />
          <circle cx="57" cy="82" r="8" fill="#9333ea" />
          <circle cx="72" cy="78" r="8" fill="#9333ea" />
        </g>
      );
    case 'beer':
      return (
        <g>
          {/* Handle */}
          <path d="M72,46 C86,46 86,74 72,74" fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" />
          {/* Mug body */}
          <rect x="26" y="38" width="48" height="48" rx="8" fill="#f59e0b" stroke="#fef3c7" strokeWidth="2.5" />
          {/* Foam crown */}
          <circle cx="34" cy="36" r="10" fill="#ffffff" />
          <circle cx="48" cy="33" r="12" fill="#ffffff" />
          <circle cx="63" cy="36" r="10" fill="#ffffff" />
          <rect x="26" y="34" width="48" height="11" rx="5" fill="#ffffff" />
        </g>
      );
    default:
      return <circle cx="50" cy="58" r="28" fill="#fbbf24" />;
  }
}

function renderFaceFeatures(character: string, expression: string): React.ReactNode {
  const isRobot = character === 'robot';
  const isPanda = character === 'panda';
  const isBird = character === 'owl' || character === 'penguin';
  const eyeColor = isRobot ? '#38bdf8' : isPanda ? '#ffffff' : '#0f172a';
  const eyeY = character === 'frog' ? 40 : 54;

  return (
    <g>
      {/* Rosy cheeks */}
      {!isRobot && (
        <g opacity="0.45" fill="#fb7185">
          <ellipse cx="31" cy="64" rx="5" ry="3" />
          <ellipse cx="69" cy="64" rx="5" ry="3" />
        </g>
      )}

      {/* Eyes */}
      {expression === 'wink' ? (
        <>
          <circle cx="39" cy={eyeY} r="4.3" fill={eyeColor} />
          <circle cx="40.5" cy={eyeY - 1.3} r="1.4" fill="#ffffff" />
          <path d={`M56,${eyeY} Q61,${eyeY - 4} 66,${eyeY}`} fill="none" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="39" cy={eyeY} r="4.3" fill={eyeColor} />
          <circle cx="61" cy={eyeY} r="4.3" fill={eyeColor} />
          {!isPanda && (
            <>
              <circle cx="40.5" cy={eyeY - 1.3} r="1.4" fill="#ffffff" />
              <circle cx="62.5" cy={eyeY - 1.3} r="1.4" fill="#ffffff" />
            </>
          )}
        </>
      )}

      {/* Beak or nose */}
      {isBird ? (
        <polygon points="45,59 55,59 50,67" fill="#f97316" />
      ) : !isRobot && character !== 'beer' && character !== 'ghost' && character !== 'alien' ? (
        <ellipse cx="50" cy="63" rx="4.2" ry="3" fill="#1e293b" />
      ) : null}

      {/* Mouth / Expression */}
      {expression === 'surprised' ? (
        <circle cx="50" cy="72" r="4.5" fill="#0f172a" />
      ) : expression === 'cool' ? (
        <path d="M41,71 Q51,75 61,68" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      ) : !isBird ? (
        <path d="M41,70 Q50,78 59,70" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      ) : null}

      {/* Mustache prop */}
      {expression === 'mustache' && (
        <path
          d="M50,67 C45,62 35,64 33,70 C38,71 45,71 50,69 C55,71 62,71 67,70 C65,64 55,62 50,67 Z"
          fill="#292524"
        />
      )}

      {/* Bowtie prop */}
      {expression === 'bowtie' && (
        <g transform="translate(50, 86)">
          <polygon points="0,0 -13,-7 -13,7" fill="#dc2626" />
          <polygon points="0,0 13,-7 13,7" fill="#dc2626" />
          <circle cx="0" cy="0" r="3.5" fill="#991b1b" />
        </g>
      )}
    </g>
  );
}

function renderGlasses(glasses: string): React.ReactNode {
  switch (glasses) {
    case 'sunglasses':
      return (
        <g>
          <rect x="27" y="47" width="20" height="13" rx="3" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.5" />
          <rect x="53" y="47" width="20" height="13" rx="3" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1="47" y1="52" x2="53" y2="52" stroke="#e2e8f0" strokeWidth="2.5" />
          <line x1="30" y1="50" x2="36" y2="56" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" />
          <line x1="56" y1="50" x2="62" y2="56" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" />
        </g>
      );
    case 'round':
      return (
        <g fill="none" stroke="#1e293b" strokeWidth="2.8">
          <circle cx="38" cy="54" r="9.5" fill="rgba(255,255,255,0.22)" />
          <circle cx="62" cy="54" r="9.5" fill="rgba(255,255,255,0.22)" />
          <line x1="47.5" y1="54" x2="52.5" y2="54" />
        </g>
      );
    case 'star':
      return (
        <g fill="#facc15" stroke="#b45309" strokeWidth="1.5">
          <polygon points="38,43 41,50 48,50 42,55 44,62 38,57 32,62 34,55 28,50 35,50" />
          <polygon points="62,43 65,50 72,50 66,55 68,62 62,57 56,62 58,55 52,50 59,50" />
          <line x1="46" y1="52" x2="54" y2="52" stroke="#b45309" strokeWidth="2.5" />
        </g>
      );
    case 'monocle':
      return (
        <g>
          <circle cx="62" cy="54" r="10" fill="rgba(254,240,138,0.28)" stroke="#eab308" strokeWidth="2.6" />
          <path d="M72,57 Q78,72 72,88" fill="none" stroke="#eab308" strokeWidth="1.8" strokeDasharray="3 2" />
        </g>
      );
    case 'retro3d':
      return (
        <g>
          <rect x="26" y="47" width="48" height="14" rx="2.5" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
          <rect x="29" y="50" width="18" height="8" fill="#ef4444" opacity="0.85" />
          <rect x="53" y="50" width="18" height="8" fill="#06b6d4" opacity="0.85" />
        </g>
      );
    case 'pixel':
      return (
        <g fill="#0f172a">
          <rect x="26" y="49" width="48" height="5" />
          <rect x="29" y="54" width="17" height="5" />
          <rect x="54" y="54" width="17" height="5" />
          <rect x="33" y="51" width="4" height="3" fill="#ffffff" />
          <rect x="58" y="51" width="4" height="3" fill="#ffffff" />
        </g>
      );
    default:
      return null;
  }
}

function renderHat(hat: string): React.ReactNode {
  switch (hat) {
    case 'crown':
      return (
        <g>
          <polygon points="30,33 34,14 43,24 50,11 57,24 66,14 70,33" fill="#facc15" stroke="#b45309" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="50" cy="25" r="2.5" fill="#dc2626" />
          <circle cx="38" cy="27" r="2" fill="#2563eb" />
          <circle cx="62" cy="27" r="2" fill="#16a34a" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M27,36 C27,18 73,18 73,36 Z" fill="#dc2626" />
          <path d="M27,34 L82,36 C82,40 70,41 50,39 L27,36 Z" fill="#991b1b" />
          <circle cx="50" cy="19" r="3" fill="#fef08a" />
        </g>
      );
    case 'wizard':
      return (
        <g>
          <ellipse cx="50" cy="34" rx="28" ry="6" fill="#4c1d95" />
          <polygon points="31,34 50,5 69,34" fill="#6d28d9" />
          <polygon points="50,15 52,20 57,20 53,23 54.5,28 50,25 45.5,28 47,23 43,20 48,20" fill="#fde047" />
        </g>
      );
    case 'pirate':
      return (
        <g>
          <path d="M20,36 C24,18 40,14 50,16 C60,14 76,18 80,36 Q50,31 20,36 Z" fill="#0f172a" stroke="#f8fafc" strokeWidth="1.5" />
          <circle cx="50" cy="24" r="4" fill="#f8fafc" />
          <line x1="44" y1="29" x2="56" y2="29" stroke="#f8fafc" strokeWidth="2" />
        </g>
      );
    case 'chef':
      return (
        <g fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5">
          <circle cx="36" cy="21" r="9" />
          <circle cx="50" cy="16" r="10" />
          <circle cx="64" cy="21" r="9" />
          <rect x="31" y="24" width="38" height="11" rx="2" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M21,54 C21,22 79,22 79,54" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" />
          <rect x="14" y="46" width="10" height="20" rx="5" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
          <rect x="76" y="46" width="10" height="20" rx="5" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
        </g>
      );
    case 'party':
      return (
        <g>
          <polygon points="34,34 50,7 66,34" fill="#ec4899" />
          <line x1="41" y1="23" x2="59" y2="23" stroke="#fde047" strokeWidth="3" />
          <circle cx="50" cy="7" r="4.5" fill="#fde047" />
        </g>
      );
    case 'halo':
      return (
        <ellipse cx="50" cy="18" rx="20" ry="5" fill="none" stroke="#fde047" strokeWidth="4" />
      );
    case 'beret':
      return (
        <g>
          <ellipse cx="48" cy="27" rx="24" ry="10" transform="rotate(-10 48 27)" fill="#9f1239" />
          <line x1="46" y1="13" x2="48" y2="19" stroke="#9f1239" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}
