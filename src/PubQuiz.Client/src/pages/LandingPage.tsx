import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, SlidersHorizontal, Smartphone, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function LandingPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.landing.title} | ${t.app.tagline}`;
  }, [t]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link visually-hidden">
        {t.app.skipToContent}
      </a>

      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] inline-flex items-center justify-center">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </span>
            <span>{t.app.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-3">
            {t.landing.title}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] m-0">
            {t.landing.subtitle}
          </p>
        </div>

        <nav aria-label="Výběr pohledu" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            to="/host"
            className="surface-card p-6 no-underline text-inherit flex flex-col justify-between gap-5 hover:border-[var(--accent)] transition-colors"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
                <SlidersHorizontal className="w-6 h-6" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-extrabold mb-2">{t.landing.hostTitle}</h2>
              <p className="text-sm text-[var(--text-secondary)] m-0">{t.landing.hostDesc}</p>
            </div>
            <span className="btn-primary w-full">{t.landing.hostCta}</span>
          </Link>

          <Link
            to="/screen"
            className="surface-card p-6 no-underline text-inherit flex flex-col justify-between gap-5 hover:border-[var(--accent)] transition-colors"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[var(--info-soft)] text-[var(--info)] flex items-center justify-center mb-4">
                <Monitor className="w-6 h-6" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-extrabold mb-2">{t.landing.screenTitle}</h2>
              <p className="text-sm text-[var(--text-secondary)] m-0">{t.landing.screenDesc}</p>
            </div>
            <span className="btn-secondary w-full">{t.landing.screenCta}</span>
          </Link>

          <Link
            to="/play"
            className="surface-card p-6 no-underline text-inherit flex flex-col justify-between gap-5 hover:border-[var(--accent)] transition-colors"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[var(--success-soft)] text-[var(--success)] flex items-center justify-center mb-4">
                <Smartphone className="w-6 h-6" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-extrabold mb-2">{t.landing.playTitle}</h2>
              <p className="text-sm text-[var(--text-secondary)] m-0">{t.landing.playDesc}</p>
            </div>
            <span className="btn-secondary w-full">{t.landing.playCta}</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}
