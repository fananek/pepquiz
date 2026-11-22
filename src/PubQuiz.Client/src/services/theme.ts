export type StoredColorScheme = 'light' | 'dark' | null;
export type ResolvedColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'color-scheme';

function getSystemScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredScheme(): StoredColorScheme {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'light' || val === 'dark') return val;
    return null;
  } catch {
    return null;
  }
}

export function getResolvedScheme(stored: StoredColorScheme = getStoredScheme()): ResolvedColorScheme {
  return stored ?? getSystemScheme();
}

export function applyColorScheme(stored: StoredColorScheme): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = stored ?? 'light dark';
  }
  try {
    if (stored === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, stored);
    }
  } catch {
    // Still applied to <meta> even if storage is restricted
  }
}

/**
 * Two-state toggle per modern-web-guidance:
 * Switches to the opposite of the currently rendered scheme.
 * If the target matches the current system preference, removes the stored override
 * so the app returns to following the OS theme automatically.
 */
export function toggleTwoStateScheme(): StoredColorScheme {
  const currentRendered = getResolvedScheme();
  const target: ResolvedColorScheme = currentRendered === 'dark' ? 'light' : 'dark';
  const system = getSystemScheme();
  const nextStored: StoredColorScheme = target === system ? null : target;
  applyColorScheme(nextStored);
  return nextStored;
}

export function subscribeColorScheme(onChange: (stored: StoredColorScheme, resolved: ResolvedColorScheme) => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const notify = () => {
    const stored = getStoredScheme();
    // Never retroactively delete stored preference when system changes
    onChange(stored, getResolvedScheme(stored));
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      const stored = getStoredScheme();
      const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
      if (meta) meta.content = stored ?? 'light dark';
      notify();
    }
  };

  mq.addEventListener('change', notify);
  window.addEventListener('storage', handleStorage);
  return () => {
    mq.removeEventListener('change', notify);
    window.removeEventListener('storage', handleStorage);
  };
}
