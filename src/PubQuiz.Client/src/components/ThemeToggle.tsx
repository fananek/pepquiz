import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  getResolvedScheme,
  subscribeColorScheme,
  toggleTwoStateScheme,
  type ResolvedColorScheme
} from '../services/theme';
import { useI18n } from '../i18n/I18nContext';

export function ThemeToggle() {
  const { t } = useI18n();
  const [resolved, setResolved] = useState<ResolvedColorScheme>(() => getResolvedScheme());

  useEffect(() => {
    return subscribeColorScheme((_, nextResolved) => {
      setResolved(nextResolved);
    });
  }, []);

  const handleToggle = () => {
    const nextStored = toggleTwoStateScheme();
    setResolved(getResolvedScheme(nextStored));
  };

  const label = resolved === 'dark' ? t.app.themeLight : t.app.themeDark;

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      className="btn-secondary !px-3 !py-2 !min-h-[40px]"
    >
      {resolved === 'dark' ? (
        <Sun className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4" aria-hidden="true" />
      )}
      <span className="text-sm font-semibold hidden sm:inline">
        {resolved === 'dark' ? t.app.themeLightShort : t.app.themeDarkShort}
      </span>
    </button>
  );
}
