import { Globe } from 'lucide-react';
import { useI18n, type UiLanguage } from '../i18n/I18nContext';

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  const toggle = () => {
    const next: UiLanguage = lang === 'cs' ? 'en' : 'cs';
    setLang(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${t.app.languageLabel}: ${lang.toUpperCase()}`}
      className="btn-secondary !px-3 !py-2 !min-h-[40px] text-sm font-bold"
    >
      <Globe className="w-4 h-4" aria-hidden="true" />
      <span>{lang.toUpperCase()}</span>
    </button>
  );
}
