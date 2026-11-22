import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { cs, type TranslationDict } from './cs';
import { en } from './en';

export type UiLanguage = 'cs' | 'en';

const DICTIONARIES: Record<UiLanguage, TranslationDict> = { cs, en };
const STORAGE_KEY = 'pubquiz-ui-lang';

interface I18nContextValue {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  t: TranslationDict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function loadInitialLang(): UiLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'cs' || saved === 'en') return saved;
  } catch {
    // Ignore
  }
  return 'cs';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(loadInitialLang);

  const setLang = (next: UiLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t: DICTIONARIES[lang] }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}
