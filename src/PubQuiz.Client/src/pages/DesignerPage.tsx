import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  Film,
  FolderOpen,
  Gift,
  Globe,
  Image as ImageIcon,
  Layers,
  Music,
  Play,
  Plus,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Youtube
} from 'lucide-react';
import { api, withMediaToken } from '../services/api';
import type {
  BonusTask,
  DesignerMediaAttachment,
  DesignerQuestion,
  DesignerQuizPackage,
  DesignerRound,
  DesignerTranslation,
  QuestionType,
  QuizSummary
} from '../types/quiz';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ModalDialog } from '../components/ModalDialog';
import { MediaPlayer } from '../components/MediaPlayer';

const HOST_TOKEN_KEY = 'pubquiz-host-token';

type SelectionTarget =
  | { kind: 'settings' }
  | { kind: 'tasks' }
  | { kind: 'translations' }
  | { kind: 'media' }
  | { kind: 'round'; roundIndex: number }
  | { kind: 'question'; roundIndex: number; questionIndex: number };

function normalizeForMatch(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—/_:,.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function evaluateLocalTypoPreview(question: DesignerQuestion, sample: string): { matched: boolean; distance: number | null } {
  const norm = normalizeForMatch(sample);
  if (!norm) return { matched: false, distance: null };
  const candidates = [...(question.acceptedAnswers ?? []), ...(question.correctAnswer ? [question.correctAnswer] : [])];
  let best = Number.POSITIVE_INFINITY;
  let matched = false;
  for (const cand of candidates) {
    const nc = normalizeForMatch(cand);
    if (!nc) continue;
    const d = levenshtein(norm, nc);
    if (d < best) best = d;
    const isNumeric = /^[0-9\s]+$/.test(nc);
    const tol = isNumeric ? 0 : nc.length <= 4 ? 0 : nc.length <= 9 ? 1 : nc.length <= 16 ? 2 : 3;
    if (d <= tol) matched = true;
  }
  return { matched, distance: Number.isFinite(best) ? best : null };
}

function createBlankQuestion(roundNum: number, qNum: number, type: QuestionType = 'MultipleChoice'): DesignerQuestion {
  const id = `r${roundNum}-q${qNum}-${Math.random().toString(36).slice(2, 5)}`;
  if (type === 'TextInput') {
    return {
      id,
      type: 'TextInput',
      text: `Nová otevřená otázka ${qNum}`,
      correctAnswer: 'Správná odpověď',
      acceptedAnswers: ['Správná odpověď'],
      hostNote: '',
      timeLimitSeconds: null,
      media: null
    };
  }
  if (type === 'Ordering') {
    return {
      id,
      type: 'Ordering',
      text: `Seřaďte položky v otázce ${qNum}:`,
      options: ['První položka', 'Druhá položka', 'Třetí položka'],
      correctOrder: ['První položka', 'Druhá položka', 'Třetí položka'],
      correctAnswer: 'První položka → Druhá položka → Třetí položka',
      hostNote: '',
      timeLimitSeconds: null,
      media: null
    };
  }
  return {
    id,
    type: 'MultipleChoice',
    text: `Nová otázka ${qNum}`,
    options: ['Možnost A', 'Možnost B', 'Možnost C', 'Možnost D'],
    correctAnswer: 'Možnost A',
    hostNote: '',
    timeLimitSeconds: null,
    media: null
  };
}

function createStarterQuiz(id: string, title: string, template: 'blank' | 'full70'): DesignerQuizPackage {
  const makeRounds = (): DesignerRound[] => {
    if (template === 'blank') {
      return [
        {
          roundNumber: 1,
          title: 'Kolo 1 – Všeobecný přehled',
          description: 'Úvodní rozehřívací kolo',
          isFinal: false,
          pointMultiplier: 1.0,
          questions: [createBlankQuestion(1, 1, 'MultipleChoice')]
        }
      ];
    }
    const rounds: DesignerRound[] = [];
    const titles = [
      'Všeobecný přehled',
      'Film, seriály a kultura',
      'Hudba a zvuky',
      'Zeměpis a příroda',
      'Sport, věda a technika'
    ];
    for (let r = 1; r <= 5; r++) {
      rounds.push({
        roundNumber: r,
        title: titles[r - 1],
        description: '12 otázek základního kola',
        isFinal: false,
        pointMultiplier: 1.0,
        questions: Array.from({ length: 12 }, (_, idx) =>
          createBlankQuestion(r, idx + 1, idx % 4 === 1 ? 'TextInput' : idx % 6 === 5 ? 'Ordering' : 'MultipleChoice')
        )
      });
    }
    rounds.push({
      roundNumber: 6,
      title: 'Finálový rozstřel',
      description: '10 finálových otázek za dvojnásobek bodů',
      isFinal: true,
      pointMultiplier: 2.0,
      questions: Array.from({ length: 10 }, (_, idx) =>
        createBlankQuestion(6, idx + 1, idx % 3 === 0 ? 'TextInput' : 'MultipleChoice')
      )
    });
    return rounds;
  };

  return {
    id,
    title,
    description: 'Vlastní kvíz vytvořený v editoru PepQuiz Engine.',
    defaultLanguage: 'cs',
    rules: [
      'Základní správná odpověď je za 1 000 bodů + rychlostní bonus až 200 bodů.',
      'Rychlostní bonus klesá až po 5 sekundách na přečtení otázky.',
      'Ve finále jsou dvojnásobné body a každý tým má 2 Žolíky.'
    ],
    settings: {
      defaultTimeLimitSeconds: 30,
      gracePeriodSeconds: 5,
      basePoints: 1000,
      speedBonusMax: 200,
      jokerMode: 'OnDemand',
      jokerCount: 2,
      autoStartTimer: false
    },
    bonusTasks: [],
    rounds: makeRounds()
  };
}

export function DesignerPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HOST_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [quiz, setQuiz] = useState<DesignerQuizPackage | null>(null);
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<string, DesignerTranslation>>({});
  const [isNewUnsaved, setIsNewUnsaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [selection, setSelection] = useState<SelectionTarget>({ kind: 'settings' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newQuizId, setNewQuizId] = useState('');
  const [newTemplate, setNewTemplate] = useState<'blank' | 'full70'>('blank');

  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [dupTitle, setDupTitle] = useState('');
  const [dupId, setDupId] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Live typo tester & translation language editor state
  const [typoSample, setTypoSample] = useState('');
  const [mediaInputMode, setMediaInputMode] = useState<'local' | 'url'>('local');
  const [activeTrLang, setActiveTrLang] = useState('en');
  const [newTrLang, setNewTrLang] = useState('');

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = quiz ? `Editor: ${quiz.title} | PepQuiz Engine` : 'Editor kvízů | PepQuiz Engine';
  }, [quiz]);

  const loadQuizIntoEditor = useCallback(
    async (quizId: string) => {
      if (!token) return;
      setStatusBanner(null);
      try {
        const detail = await api.designer.getQuizDetail(token, quizId);
        setQuiz(detail.quiz);
        setMediaFiles(detail.mediaFiles);
        setTranslations(detail.translations);
        const firstTr = Object.keys(detail.translations)[0];
        if (firstTr) setActiveTrLang(firstTr);
        setIsNewUnsaved(false);
        setDirty(false);
        setSelection({ kind: 'settings' });
      } catch (err) {
        setStatusBanner({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Nepodařilo se načíst kvíz.'
        });
      }
    },
    [token]
  );

  const refreshQuizList = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.designer.listQuizzes(token);
      setQuizzes(list);
      return list;
    } catch {
      return [];
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refreshQuizList().then((list) => {
      if (list && list.length > 0 && !quiz) {
        void loadQuizIntoEditor(list[0].id);
      }
    });
  }, [token]);

  const mutateQuiz = useCallback((updater: (prev: DesignerQuizPackage) => DesignerQuizPackage) => {
    setQuiz((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  }, []);

  const validationErrors = useMemo(() => {
    if (!quiz) return [];
    const errs: string[] = [];
    if (!quiz.id.trim()) errs.push('Chybí ID (slug) kvízu.');
    if (!quiz.title.trim()) errs.push('Chybí název kvízu.');
    if (quiz.rounds.length === 0) errs.push('Kvíz musí mít alespoň 1 kolo.');
    quiz.rounds.forEach((r, rIdx) => {
      if (!r.title.trim()) errs.push(`Kolo ${rIdx + 1} nemá název.`);
      if (r.questions.length === 0) errs.push(`Kolo ${rIdx + 1} nemá žádné otázky.`);
      r.questions.forEach((q, qIdx) => {
        if (!q.text.trim()) errs.push(`Kolo ${rIdx + 1}, otázka ${qIdx + 1}: chybí znění otázky.`);
        if (q.type === 'MultipleChoice') {
          const valid = (q.options ?? []).filter((o) => o.trim());
          if (valid.length < 2) errs.push(`Kolo ${rIdx + 1}, otázka ${qIdx + 1}: zadejte alespoň 2 možnosti.`);
        } else if (q.type === 'Ordering') {
          const valid = (q.correctOrder ?? q.options ?? []).filter((o) => o.trim());
          if (valid.length < 2) errs.push(`Kolo ${rIdx + 1}, otázka ${qIdx + 1}: zadejte alespoň 2 položky k seřazení.`);
        } else if (q.type === 'TextInput') {
          if (!q.correctAnswer?.trim() && !(q.acceptedAnswers ?? []).some((a) => a.trim())) {
            errs.push(`Kolo ${rIdx + 1}, otázka ${qIdx + 1}: zadejte správnou textovou odpověď.`);
          }
        }
      });
    });
    (quiz.bonusTasks ?? []).forEach((bt, tIdx) => {
      if (!bt.title.trim()) errs.push(`Bonusový úkol #${tIdx + 1}: zadejte název úkolu.`);
      if (bt.maxCompletionsPerTeam < 1) errs.push(`Bonusový úkol #${tIdx + 1}: max. počet splnění musí být alespoň 1.`);
    });
    return errs;
  }, [quiz]);

  const handleSave = useCallback(
    async (andLaunch = false) => {
      if (!token || !quiz) return;
      if (validationErrors.length > 0) {
        setStatusBanner({ kind: 'error', text: validationErrors[0] });
        return;
      }
      setSaving(true);
      setStatusBanner(null);
      try {
        const res = isNewUnsaved
          ? await api.designer.createQuiz(token, quiz)
          : await api.designer.saveQuiz(token, quiz.id, quiz);
        setQuiz(res.quiz);
        setMediaFiles(res.mediaFiles);
        setTranslations(res.translations);
        setIsNewUnsaved(false);
        setDirty(false);
        await refreshQuizList();

        if (andLaunch) {
          await api.loadQuiz(token, res.quiz.id, res.quiz.defaultLanguage);
          navigate('/host');
          return;
        }
        setStatusBanner({ kind: 'success', text: `Kvíz „${res.quiz.title}“ byl úspěšně uložen.` });
      } catch (err) {
        setStatusBanner({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Uložení selhalo.'
        });
      } finally {
        setSaving(false);
      }
    },
    [token, quiz, validationErrors, isNewUnsaved, refreshQuizList, navigate]
  );

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const rawId =
      newQuizId.trim() ||
      normalizeForMatch(newQuizTitle)
        .replace(/\s+/g, '-')
        .slice(0, 40) ||
      `kviz-${Date.now().toString().slice(-4)}`;
    const starter = createStarterQuiz(rawId, newQuizTitle.trim() || 'Nový hospodský kvíz', newTemplate);
    setQuiz(starter);
    setMediaFiles([]);
    setTranslations({});
    setIsNewUnsaved(true);
    setDirty(true);
    setSelection({ kind: 'settings' });
    setNewModalOpen(false);
    setNewQuizTitle('');
    setNewQuizId('');
    setStatusBanner({ kind: 'success', text: 'Nový kvíz připraven – nezapomeňte jej uložit tlačítkem Uložit.' });
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !quiz) return;
    try {
      const slug =
        dupId.trim() ||
        normalizeForMatch(dupTitle).replace(/\s+/g, '-') ||
        `${quiz.id}-kopie`;
      const detail = await api.designer.duplicateQuiz(token, quiz.id, slug, dupTitle.trim() || `${quiz.title} (kopie)`);
      setQuiz(detail.quiz);
      setMediaFiles(detail.mediaFiles);
      setTranslations(detail.translations);
      setIsNewUnsaved(false);
      setDirty(false);
      setDupModalOpen(false);
      await refreshQuizList();
      setStatusBanner({ kind: 'success', text: `Kvíz byl zduplikován jako „${detail.quiz.title}“.` });
    } catch (err) {
      setStatusBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Duplikace selhala.' });
    }
  };

  const handleDeleteQuiz = async () => {
    if (!token || !quiz) return;
    if (isNewUnsaved) {
      setDeleteModalOpen(false);
      const list = await refreshQuizList();
      if (list && list.length > 0) void loadQuizIntoEditor(list[0].id);
      else setQuiz(null);
      return;
    }
    try {
      await api.designer.deleteQuiz(token, quiz.id);
      setDeleteModalOpen(false);
      const list = await refreshQuizList();
      if (list && list.length > 0) void loadQuizIntoEditor(list[0].id);
      else setQuiz(null);
      setStatusBanner({ kind: 'success', text: 'Kvíz byl odstraněn.' });
    } catch (err) {
      setStatusBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Odstranění selhalo.' });
    }
  };

  const handleExportJson = () => {
    if (!quiz) return;
    const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quiz.id || 'quiz'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as DesignerQuizPackage;
      if (!parsed.title || !Array.isArray(parsed.rounds)) {
        throw new Error('Soubor nemá platnou strukturu quiz.json.');
      }
      parsed.id = parsed.id || `import-${Date.now().toString().slice(-4)}`;
      setQuiz(parsed);
      setIsNewUnsaved(true);
      setDirty(true);
      setSelection({ kind: 'settings' });
      setStatusBanner({ kind: 'success', text: `Importováno „${parsed.title}“ – klikněte na Uložit.` });
    } catch (err) {
      setStatusBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Neplatný JSON.' });
    } finally {
      e.target.value = '';
    }
  };

  const handleUploadMedia = async (file: File, attachToCurrentQuestion = false) => {
    if (!token || !quiz) return;
    if (isNewUnsaved) {
      setStatusBanner({ kind: 'error', text: 'Nejprve kvíz jednou uložte, aby vznikla jeho složka pro média.' });
      return;
    }
    setUploading(true);
    try {
      const res = await api.designer.uploadMedia(token, quiz.id, file);
      setMediaFiles(res.mediaFiles);
      if (attachToCurrentQuestion && selection.kind === 'question') {
        const ext = file.name.toLowerCase();
        const detectedType: DesignerMediaAttachment['type'] =
          ext.endsWith('.mp3') || ext.endsWith('.wav') || ext.endsWith('.ogg') || ext.endsWith('.m4a')
            ? 'audio'
            : ext.endsWith('.mp4') || ext.endsWith('.webm')
              ? 'video'
              : 'image';
        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
          ...q,
          media: {
            type: detectedType,
            src: res.src,
            playbackMode: q.media?.playbackMode ?? 'duringQuestion',
            startSeconds: q.media?.startSeconds ?? 0,
            endSeconds: q.media?.endSeconds ?? null,
            altText: q.media?.altText ?? file.name,
            transcript: q.media?.transcript ?? ''
          }
        }));
      }
      setStatusBanner({ kind: 'success', text: `Soubor nahrán: ${res.src}` });
    } catch (err) {
      setStatusBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Nahrání selhalo.' });
    } finally {
      setUploading(false);
    }
  };

  // --- Round & Question Mutations ---

  const addRound = (isFinal = false) => {
    if (!quiz) return;
    const nextNum = quiz.rounds.length + 1;
    const newRound: DesignerRound = {
      roundNumber: nextNum,
      title: isFinal ? 'Finálové kolo' : `Kolo ${nextNum}`,
      description: '',
      isFinal,
      pointMultiplier: isFinal ? 2.0 : 1.0,
      questions: [createBlankQuestion(nextNum, 1, 'MultipleChoice')]
    };
    mutateQuiz((prev) => ({ ...prev, rounds: [...prev.rounds, newRound] }));
    setSelection({ kind: 'round', roundIndex: quiz.rounds.length });
  };

  const moveRound = (idx: number, delta: -1 | 1) => {
    if (!quiz) return;
    const target = idx + delta;
    if (target < 0 || target >= quiz.rounds.length) return;
    mutateQuiz((prev) => {
      const rounds = [...prev.rounds];
      [rounds[idx], rounds[target]] = [rounds[target], rounds[idx]];
      return { ...prev, rounds: rounds.map((r, i) => ({ ...r, roundNumber: i + 1 })) };
    });
    setSelection({ kind: 'round', roundIndex: target });
  };

  const deleteRound = (idx: number) => {
    if (!quiz || quiz.rounds.length <= 1) return;
    mutateQuiz((prev) => ({
      ...prev,
      rounds: prev.rounds.filter((_, i) => i !== idx).map((r, i) => ({ ...r, roundNumber: i + 1 }))
    }));
    setSelection({ kind: 'settings' });
  };

  const updateRound = (roundIndex: number, updater: (r: DesignerRound) => DesignerRound) => {
    mutateQuiz((prev) => ({
      ...prev,
      rounds: prev.rounds.map((r, i) => (i === roundIndex ? updater(r) : r))
    }));
  };

  const addQuestion = (roundIndex: number, type: QuestionType = 'MultipleChoice') => {
    if (!quiz) return;
    const round = quiz.rounds[roundIndex];
    const newQ = createBlankQuestion(round.roundNumber, round.questions.length + 1, type);
    updateRound(roundIndex, (r) => ({ ...r, questions: [...r.questions, newQ] }));
    setSelection({ kind: 'question', roundIndex, questionIndex: round.questions.length });
  };

  const updateQuestion = (
    roundIndex: number,
    questionIndex: number,
    updater: (q: DesignerQuestion) => DesignerQuestion
  ) => {
    updateRound(roundIndex, (r) => ({
      ...r,
      questions: r.questions.map((q, i) => (i === questionIndex ? updater(q) : q))
    }));
  };

  const moveQuestion = (roundIndex: number, qIdx: number, delta: -1 | 1) => {
    if (!quiz) return;
    const qs = quiz.rounds[roundIndex].questions;
    const target = qIdx + delta;
    if (target < 0 || target >= qs.length) return;
    updateRound(roundIndex, (r) => {
      const copy = [...r.questions];
      [copy[qIdx], copy[target]] = [copy[target], copy[qIdx]];
      return { ...r, questions: copy };
    });
    setSelection({ kind: 'question', roundIndex, questionIndex: target });
  };

  const duplicateQuestion = (roundIndex: number, qIdx: number) => {
    if (!quiz) return;
    const orig = quiz.rounds[roundIndex].questions[qIdx];
    const clone: DesignerQuestion = {
      ...JSON.parse(JSON.stringify(orig)),
      id: `${orig.id}-copy-${Math.random().toString(36).slice(2, 5)}`
    };
    updateRound(roundIndex, (r) => {
      const copy = [...r.questions];
      copy.splice(qIdx + 1, 0, clone);
      return { ...r, questions: copy };
    });
    setSelection({ kind: 'question', roundIndex, questionIndex: qIdx + 1 });
  };

  const deleteQuestion = (roundIndex: number, qIdx: number) => {
    if (!quiz) return;
    const qs = quiz.rounds[roundIndex].questions;
    if (qs.length <= 1) return;
    updateRound(roundIndex, (r) => ({ ...r, questions: r.questions.filter((_, i) => i !== qIdx) }));
    setSelection({ kind: 'round', roundIndex });
  };

  // --- Host PIN Gate if navigated directly ---
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="surface-card p-8 max-w-md w-full space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black m-0">Editor kvízů – Přihlášení</h1>
            <ThemeToggle />
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginError(null);
              try {
                const res = await api.loginHost(pin.trim());
                setToken(res.token);
                try {
                  localStorage.setItem(HOST_TOKEN_KEY, res.token);
                } catch {}
              } catch (err) {
                setLoginError(err instanceof Error ? err.message : 'Nesprávný PIN.');
              }
            }}
            className="space-y-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="designer-pin" className="font-bold text-sm">
                PIN moderátora
              </label>
              <input
                id="designer-pin"
                type="password"
                inputMode="numeric"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="text-center font-mono text-2xl tracking-widest"
              />
            </div>
            {loginError && (
              <div role="alert" className="p-3 rounded-xl bg-[var(--danger-soft)] text-[var(--danger)] text-sm font-bold">
                {loginError}
              </div>
            )}
            <button type="submit" className="btn-primary w-full">
              Přihlásit se do editoru
            </button>
          </form>
        </div>
      </main>
    );
  }

  const activeRound =
    quiz && (selection.kind === 'round' || selection.kind === 'question')
      ? quiz.rounds[selection.roundIndex]
      : null;

  const activeQuestion =
    activeRound && selection.kind === 'question'
      ? activeRound.questions[selection.questionIndex]
      : null;

  const activeTranslation: DesignerTranslation | null =
    quiz && activeTrLang
      ? translations[activeTrLang] ?? {
          language: activeTrLang,
          title: '',
          description: '',
          rounds: {},
          questions: {}
        }
      : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Studio Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5">
        <div className="max-w-[1520px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link to="/host" className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-sm no-underline">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Zpět na pult</span>
            </Link>
            <h1 className="text-lg font-black m-0">Editor kvízů</h1>

            <select
              aria-label="Vybrat existující kvíz k úpravě"
              value={isNewUnsaved ? '' : quiz?.id ?? ''}
              onChange={(e) => {
                if (e.target.value) void loadQuizIntoEditor(e.target.value);
              }}
              className="!min-h-[38px] !py-1 text-sm max-w-[260px]"
            >
              {isNewUnsaved && <option value="">(Nový neuložený kvíz)</option>}
              {quizzes.map((qz) => (
                <option key={qz.id} value={qz.id}>
                  {qz.title} ({qz.questionCount} ot.)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-sm"
            >
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              <span>Nový</span>
            </button>

            {quiz && !isNewUnsaved && (
              <button
                type="button"
                onClick={() => {
                  setDupTitle(`${quiz.title} (kopie)`);
                  setDupId(`${quiz.id}-kopie`);
                  setDupModalOpen(true);
                }}
                className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-sm"
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span className="hidden xl:inline">Duplikovat</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportJson}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="btn-secondary !py-1.5 !px-2.5 !min-h-[38px] text-xs"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Import</span>
            </button>
            <button
              type="button"
              disabled={!quiz}
              onClick={handleExportJson}
              className="btn-secondary !py-1.5 !px-2.5 !min-h-[38px] text-xs"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export</span>
            </button>

            <button
              type="button"
              disabled={!quiz || saving}
              onClick={() => void handleSave(false)}
              className="btn-primary !py-1.5 !px-3.5 !min-h-[38px] text-sm"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{saving ? 'Ukládám…' : dirty ? 'Uložit *' : 'Uložit'}</span>
            </button>

            <button
              type="button"
              disabled={!quiz || saving}
              onClick={() => void handleSave(true)}
              className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-sm border-[var(--success)] text-[var(--success)]"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>Uložit a načíst do hry</span>
            </button>

            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Status & Validation Banner */}
      {(statusBanner || validationErrors.length > 0) && (
        <div className="max-w-[1520px] w-full mx-auto px-4 pt-3">
          {statusBanner && (
            <div
              role="status"
              className={`p-3 rounded-xl text-sm font-bold flex items-center justify-between gap-3 ${
                statusBanner.kind === 'success'
                  ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]'
                  : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]'
              }`}
            >
              <span className="flex items-center gap-2">
                {statusBanner.kind === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                {statusBanner.text}
              </span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="bg-transparent border-0 text-inherit cursor-pointer font-bold"
                aria-label="Zavřít upozornění"
              >
                ✕
              </button>
            </div>
          )}
          {validationErrors.length > 0 && (
            <div className="mt-2 p-3 rounded-xl bg-[var(--warning-soft)] text-[var(--warning)] text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Před uložením doplňte ({validationErrors.length}): {validationErrors[0]}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Studio 2-Pane Body */}
      {quiz ? (
        <div className="flex-1 max-w-[1520px] w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT OUTLINE SIDEBAR */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-3">
            <div className="surface-card p-3 space-y-1.5">
              <button
                type="button"
                onClick={() => setSelection({ kind: 'settings' })}
                className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2.5 border-2 cursor-pointer ${
                  selection.kind === 'settings'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <Settings className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                <span>Nastavení a pravidla</span>
              </button>

              <button
                type="button"
                onClick={() => setSelection({ kind: 'tasks' })}
                className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm flex items-center justify-between border-2 cursor-pointer ${
                  selection.kind === 'tasks'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Gift className="w-4 h-4 text-[var(--warning)]" aria-hidden="true" />
                  <span>Bonusové úkoly</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)]">
                  {(quiz.bonusTasks ?? []).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelection({ kind: 'media' })}
                className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm flex items-center justify-between border-2 cursor-pointer ${
                  selection.kind === 'media'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-[var(--info)]" aria-hidden="true" />
                  <span>Knihovna médií</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)]">{mediaFiles.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelection({ kind: 'translations' })}
                className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm flex items-center justify-between border-2 cursor-pointer ${
                  selection.kind === 'translations'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
                  <span>Překlady kvízu</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)]">
                  {Object.keys(translations).length}
                </span>
              </button>
            </div>

            {/* Rounds & Questions Tree */}
            <div className="surface-card p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase text-[var(--text-muted)] m-0 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" aria-hidden="true" />
                  Kola ({quiz.rounds.length}) • Otázky ({quiz.rounds.reduce((s, r) => s + r.questions.length, 0)})
                </h2>
              </div>

              <div className="space-y-2.5 max-h-[62vh] overflow-y-auto pr-1">
                {quiz.rounds.map((r, rIdx) => {
                  const isRoundSel = selection.kind === 'round' && selection.roundIndex === rIdx;
                  return (
                    <div
                      key={rIdx}
                      className={`rounded-xl border p-2 space-y-1.5 ${
                        isRoundSel
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/35'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => setSelection({ kind: 'round', roundIndex: rIdx })}
                          className="flex-1 text-left font-extrabold text-sm bg-transparent border-0 p-1 text-inherit cursor-pointer truncate"
                        >
                          {r.isFinal ? '★ ' : `${rIdx + 1}. `}
                          {r.title || 'Bez názvu'}
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={rIdx === 0}
                            onClick={() => moveRound(rIdx, -1)}
                            aria-label="Posunout kolo nahoru"
                            className="p-1 rounded bg-transparent border-0 text-[var(--text-muted)] cursor-pointer disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={rIdx === quiz.rounds.length - 1}
                            onClick={() => moveRound(rIdx, 1)}
                            aria-label="Posunout kolo dolů"
                            className="p-1 rounded bg-transparent border-0 text-[var(--text-muted)] cursor-pointer disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 pl-1">
                        {r.questions.map((q, qIdx) => {
                          const isQSel =
                            selection.kind === 'question' &&
                            selection.roundIndex === rIdx &&
                            selection.questionIndex === qIdx;
                          const typeTag = q.type === 'MultipleChoice' ? 'MC' : q.type === 'TextInput' ? 'TXT' : 'ORD';
                          return (
                            <button
                              key={q.id + qIdx}
                              type="button"
                              onClick={() => setSelection({ kind: 'question', roundIndex: rIdx, questionIndex: qIdx })}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-1.5 border cursor-pointer ${
                                isQSel
                                  ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)] font-bold'
                                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]/70 hover:border-[var(--accent)]'
                              }`}
                            >
                              <span className="truncate">
                                {qIdx + 1}. {q.text || '(bez textu)'}
                              </span>
                              <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-mono opacity-85">
                                {q.media?.type === 'audio' && <Music className="w-3 h-3" aria-hidden="true" />}
                                {q.media?.type === 'image' && <ImageIcon className="w-3 h-3" aria-hidden="true" />}
                                {q.media?.type === 'video' && <Film className="w-3 h-3" aria-hidden="true" />}
                                {q.media?.type === 'youtube' && <Youtube className="w-3 h-3" aria-hidden="true" />}
                                {typeTag}
                              </span>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => addQuestion(rIdx, 'MultipleChoice')}
                          className="w-full py-1.5 px-2 rounded-lg text-xs font-bold text-[var(--accent)] bg-transparent border border-dashed border-[var(--border-default)] hover:bg-[var(--accent-soft)]/30 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Přidat otázku
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={() => addRound(false)} className="btn-secondary !py-2 !px-2.5 text-xs">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Základní kolo
                </button>
                <button type="button" onClick={() => addRound(true)} className="btn-secondary !py-2 !px-2.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                  Finálové kolo
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT MAIN EDITOR WORKSPACE */}
          <main className="lg:col-span-8 xl:col-span-9">
            {/* 1. SETTINGS EDITOR */}
            {selection.kind === 'settings' && (
              <section className="surface-card p-6 space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black m-0">Nastavení kvízu a pravidla</h2>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(true)}
                    className="btn-secondary !py-1.5 !px-3 text-xs text-[var(--danger)]"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Smazat kvíz
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="qz-title" className="text-xs font-extrabold uppercase">Název kvízu</label>
                    <input
                      id="qz-title"
                      type="text"
                      value={quiz.title}
                      onChange={(e) => mutateQuiz((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="qz-id" className="text-xs font-extrabold uppercase">ID balíčku (složka v quizzes/)</label>
                    <input
                      id="qz-id"
                      type="text"
                      disabled={!isNewUnsaved}
                      value={quiz.id}
                      onChange={(e) => mutateQuiz((p) => ({ ...p, id: e.target.value }))}
                      className="font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label htmlFor="qz-desc" className="text-xs font-extrabold uppercase">Popis kvízu (zobrazuje se v úvodu)</label>
                    <textarea
                      id="qz-desc"
                      rows={2}
                      value={quiz.description ?? ''}
                      onChange={(e) => mutateQuiz((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="elevated-card p-4 space-y-4">
                  <h3 className="text-sm font-extrabold uppercase text-[var(--text-muted)] m-0">
                    Herní parametry, časovač a Žolík
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-time" className="text-xs font-bold">Výchozí limit (s)</label>
                      <input
                        id="set-time"
                        type="number"
                        min={5}
                        max={300}
                        value={quiz.settings.defaultTimeLimitSeconds}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, defaultTimeLimitSeconds: Number(e.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-grace" className="text-xs font-bold">Ochranná doba (s)</label>
                      <input
                        id="set-grace"
                        type="number"
                        min={0}
                        max={60}
                        value={quiz.settings.gracePeriodSeconds}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, gracePeriodSeconds: Number(e.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-base" className="text-xs font-bold">Základní body</label>
                      <input
                        id="set-base"
                        type="number"
                        min={0}
                        step={100}
                        value={quiz.settings.basePoints}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, basePoints: Number(e.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-speed" className="text-xs font-bold">Max. rychlostní bonus</label>
                      <input
                        id="set-speed"
                        type="number"
                        min={0}
                        step={50}
                        value={quiz.settings.speedBonusMax}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, speedBonusMax: Number(e.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-joker-mode" className="text-xs font-bold">Režim Finálového žolíka</label>
                      <select
                        id="set-joker-mode"
                        value={quiz.settings.jokerMode}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, jokerMode: e.target.value as 'OnDemand' | 'PreSelect' }
                          }))
                        }
                      >
                        <option value="OnDemand">Průběžně u otázky (OnDemand)</option>
                        <option value="PreSelect">Výběr předem před finále (PreSelect)</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="set-joker-count" className="text-xs font-bold">Počet žolíků na tým</label>
                      <input
                        id="set-joker-count"
                        type="number"
                        min={0}
                        max={10}
                        value={quiz.settings.jokerCount}
                        onChange={(e) =>
                          mutateQuiz((p) => ({
                            ...p,
                            settings: { ...p.settings, jokerCount: Number(e.target.value) }
                          }))
                        }
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2.5 font-bold text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quiz.settings.autoStartTimer}
                      onChange={(e) =>
                        mutateQuiz((p) => ({
                          ...p,
                          settings: { ...p.settings, autoStartTimer: e.target.checked }
                        }))
                      }
                      className="w-5 h-5"
                    />
                    <span>Spouštět odpočet automaticky při otevření otázky (výchozí: vypnuto – čeká na pokyn moderátora)</span>
                  </label>
                </div>

                {/* Rules editor */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold uppercase text-[var(--text-muted)] m-0">
                      Pravidla kvízu (zobrazí se v QuizIntro)
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        mutateQuiz((p) => ({ ...p, rules: [...(p.rules ?? []), 'Nové pravidlo…'] }))
                      }
                      className="btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Přidat pravidlo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(quiz.rules ?? []).map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[var(--text-muted)] w-6">{idx + 1}.</span>
                        <input
                          type="text"
                          aria-label={`Pravidlo ${idx + 1}`}
                          value={rule}
                          onChange={(e) =>
                            mutateQuiz((p) => ({
                              ...p,
                              rules: (p.rules ?? []).map((r, i) => (i === idx ? e.target.value : r))
                            }))
                          }
                          className="flex-1"
                        />
                        <button
                          type="button"
                          aria-label={`Odstranit pravidlo ${idx + 1}`}
                          onClick={() =>
                            mutateQuiz((p) => ({
                              ...p,
                              rules: (p.rules ?? []).filter((_, i) => i !== idx)
                            }))
                          }
                          className="btn-secondary !p-2.5 text-[var(--danger)]"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* 2. ROUND EDITOR */}
            {selection.kind === 'round' && activeRound && (
              <section className="surface-card p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black m-0">
                    Kolo {activeRound.roundNumber}: {activeRound.title}
                  </h2>
                  <button
                    type="button"
                    disabled={quiz.rounds.length <= 1}
                    onClick={() => deleteRound(selection.roundIndex)}
                    className="btn-secondary !py-1.5 !px-3 text-xs text-[var(--danger)]"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Smazat kolo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rd-title" className="text-xs font-extrabold uppercase">Název kola</label>
                    <input
                      id="rd-title"
                      type="text"
                      value={activeRound.title}
                      onChange={(e) =>
                        updateRound(selection.roundIndex, (r) => ({ ...r, title: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rd-mult" className="text-xs font-extrabold uppercase">Násobič bodů</label>
                    <input
                      id="rd-mult"
                      type="number"
                      min={0.5}
                      max={5}
                      step={0.5}
                      value={activeRound.pointMultiplier}
                      onChange={(e) =>
                        updateRound(selection.roundIndex, (r) => ({
                          ...r,
                          pointMultiplier: Number(e.target.value)
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label htmlFor="rd-desc" className="text-xs font-extrabold uppercase">Popis kola</label>
                    <textarea
                      id="rd-desc"
                      rows={2}
                      value={activeRound.description ?? ''}
                      onChange={(e) =>
                        updateRound(selection.roundIndex, (r) => ({ ...r, description: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2.5 font-bold text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeRound.isFinal}
                    onChange={(e) =>
                      updateRound(selection.roundIndex, (r) => ({
                        ...r,
                        isFinal: e.target.checked,
                        pointMultiplier: e.target.checked && r.pointMultiplier === 1 ? 2.0 : r.pointMultiplier
                      }))
                    }
                    className="w-5 h-5"
                  />
                  <span>Toto je Finálové kolo (aktivuje Finálového žolíka)</span>
                </label>

                <div className="elevated-card p-4 space-y-3">
                  <div className="font-extrabold text-sm">Přidat novou otázku do tohoto kola:</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestion(selection.roundIndex, 'MultipleChoice')}
                      className="btn-primary !py-2 text-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Výběr A / B / C / D
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion(selection.roundIndex, 'TextInput')}
                      className="btn-secondary !py-2 text-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Otevřená textová
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion(selection.roundIndex, 'Ordering')}
                      className="btn-secondary !py-2 text-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Seřazení položek
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* 3. QUESTION EDITOR */}
            {selection.kind === 'question' && activeRound && activeQuestion && (
              <section className="surface-card p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-black text-sm">
                      Kolo {activeRound.roundNumber} • Otázka {selection.questionIndex + 1}/{activeRound.questions.length}
                    </span>
                    <span className="text-xs font-mono text-[var(--text-muted)]">ID: {activeQuestion.id}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={selection.questionIndex === 0}
                      onClick={() => moveQuestion(selection.roundIndex, selection.questionIndex, -1)}
                      aria-label="Posunout otázku výše"
                      className="btn-secondary !p-2 !min-h-[38px]"
                    >
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={selection.questionIndex === activeRound.questions.length - 1}
                      onClick={() => moveQuestion(selection.roundIndex, selection.questionIndex, 1)}
                      aria-label="Posunout otázku níže"
                      className="btn-secondary !p-2 !min-h-[38px]"
                    >
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateQuestion(selection.roundIndex, selection.questionIndex)}
                      className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-xs"
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      Duplikovat
                    </button>
                    <button
                      type="button"
                      disabled={activeRound.questions.length <= 1}
                      onClick={() => deleteQuestion(selection.roundIndex, selection.questionIndex)}
                      className="btn-secondary !py-1.5 !px-3 !min-h-[38px] text-xs text-[var(--danger)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Smazat
                    </button>
                  </div>
                </div>

                {/* Type selector */}
                <div className="grid grid-cols-3 gap-2">
                  {(['MultipleChoice', 'TextInput', 'Ordering'] as const).map((qt) => (
                    <button
                      key={qt}
                      type="button"
                      aria-pressed={activeQuestion.type === qt}
                      onClick={() =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => {
                          if (q.type === qt) return q;
                          if (qt === 'MultipleChoice') {
                            const opts = q.options && q.options.length >= 2 ? q.options : ['Možnost A', 'Možnost B', 'Možnost C', 'Možnost D'];
                            return { ...q, type: qt, options: opts, correctAnswer: opts[0] };
                          }
                          if (qt === 'Ordering') {
                            const ord = q.correctOrder && q.correctOrder.length >= 2 ? q.correctOrder : ['První', 'Druhý', 'Třetí'];
                            return { ...q, type: qt, options: ord, correctOrder: ord, correctAnswer: ord.join(' → ') };
                          }
                          return {
                            ...q,
                            type: 'TextInput',
                            acceptedAnswers: q.acceptedAnswers?.length ? q.acceptedAnswers : [q.correctAnswer || '']
                          };
                        })
                      }
                      className={`py-2.5 px-3 rounded-xl border-2 font-bold text-sm cursor-pointer ${
                        activeQuestion.type === qt
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                      }`}
                    >
                      {qt === 'MultipleChoice'
                        ? 'Výběr A / B / C / D'
                        : qt === 'TextInput'
                          ? 'Otevřená textová'
                          : 'Seřazení položek'}
                    </button>
                  ))}
                </div>

                {/* Question text & Host Note */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-text" className="text-xs font-extrabold uppercase">Znění otázky</label>
                    <textarea
                      id="q-text"
                      rows={2}
                      value={activeQuestion.text}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          text: e.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-note" className="text-xs font-extrabold uppercase">Poznámka pro moderátora (hráči ji nevidí)</label>
                    <textarea
                      id="q-note"
                      rows={2}
                      value={activeQuestion.hostNote ?? ''}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          hostNote: e.target.value
                        }))
                      }
                      placeholder="Zajímavost k přečtení po odhalení odpovědi, tip k uznávání půl bodu…"
                    />
                  </div>
                </div>

                {/* TYPE-SPECIFIC EDITORS */}
                {activeQuestion.type === 'MultipleChoice' && (
                  <div className="elevated-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                        Možnosti odpovědí (označte správnou)
                      </span>
                      {(activeQuestion.options?.length ?? 0) < 6 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                              ...q,
                              options: [...(q.options ?? []), `Možnost ${(q.options?.length ?? 0) + 1}`]
                            }))
                          }
                          className="btn-secondary !py-1 !px-2.5 !min-h-[34px] text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Přidat možnost
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(activeQuestion.options ?? []).map((opt, oIdx) => {
                        const isCorrect = activeQuestion.correctAnswer === opt;
                        return (
                          <div key={oIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-mc-${activeQuestion.id}`}
                              checked={isCorrect}
                              onChange={() =>
                                updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                  ...q,
                                  correctAnswer: opt
                                }))
                              }
                              aria-label={`Označit možnost ${oIdx + 1} jako správnou`}
                              className="w-5 h-5 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQuestion(selection.roundIndex, selection.questionIndex, (q) => {
                                  const nextOpts = (q.options ?? []).map((o, i) => (i === oIdx ? val : o));
                                  return {
                                    ...q,
                                    options: nextOpts,
                                    correctAnswer: q.correctAnswer === opt ? val : q.correctAnswer
                                  };
                                });
                              }}
                              className="flex-1"
                            />
                            <button
                              type="button"
                              disabled={(activeQuestion.options?.length ?? 0) <= 2}
                              aria-label={`Smazat možnost ${oIdx + 1}`}
                              onClick={() =>
                                updateQuestion(selection.roundIndex, selection.questionIndex, (q) => {
                                  const nextOpts = (q.options ?? []).filter((_, i) => i !== oIdx);
                                  return {
                                    ...q,
                                    options: nextOpts,
                                    correctAnswer: q.correctAnswer === opt ? nextOpts[0] ?? '' : q.correctAnswer
                                  };
                                })
                              }
                              className="btn-secondary !p-2 text-[var(--danger)]"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeQuestion.type === 'TextInput' && (
                  <div className="elevated-card p-4 space-y-4">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="q-txt-correct" className="text-xs font-extrabold uppercase">
                        Správná odpověď (zobrazí se při odhalení na projektoru)
                      </label>
                      <input
                        id="q-txt-correct"
                        type="text"
                        value={activeQuestion.correctAnswer ?? ''}
                        onChange={(e) =>
                          updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                            ...q,
                            correctAnswer: e.target.value
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="q-txt-accepted" className="text-xs font-extrabold uppercase">
                        Automaticky uznávané varianty (každá na nový řádek)
                      </label>
                      <textarea
                        id="q-txt-accepted"
                        rows={3}
                        value={(activeQuestion.acceptedAnswers ?? []).join('\n')}
                        onChange={(e) =>
                          updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                            ...q,
                            acceptedAnswers: e.target.value.split('\n')
                          }))
                        }
                        placeholder="Např. Queen - Bohemian Rhapsody&#10;Bohemian Rhapsody"
                      />
                    </div>

                    {/* Live Typo / Diacritics Tester */}
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                      <label htmlFor="typo-tester" className="text-xs font-extrabold uppercase text-[var(--text-muted)] block">
                        Test automatického vyhodnocení překlepů (Levenshtein + diakritika)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="typo-tester"
                          type="text"
                          value={typoSample}
                          onChange={(e) => setTypoSample(e.target.value)}
                          placeholder="Zadejte zkušební odpověď hráče (např. s překlepem)…"
                          className="flex-1 !min-h-[40px]"
                        />
                        {typoSample.trim() && (() => {
                          const res = evaluateLocalTypoPreview(activeQuestion, typoSample);
                          return (
                            <span
                              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold shrink-0 ${
                                res.matched
                                  ? 'bg-[var(--success-soft)] text-[var(--success)]'
                                  : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                              }`}
                            >
                              {res.matched ? `✓ Uznáno (vzdál. ${res.distance})` : `✗ Zamítnuto (vzdál. ${res.distance ?? '—'})`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {activeQuestion.type === 'Ordering' && (
                  <div className="elevated-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                        Položky ve SPRÁVNÉM pořadí (1 = první; server je hráčům automaticky zamíchá)
                      </span>
                      {(activeQuestion.correctOrder ?? activeQuestion.options ?? []).length < 6 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(selection.roundIndex, selection.questionIndex, (q) => {
                              const list = [...(q.correctOrder ?? q.options ?? []), `Položka ${(q.correctOrder ?? q.options ?? []).length + 1}`];
                              return { ...q, options: list, correctOrder: list, correctAnswer: list.join(' → ') };
                            })
                          }
                          className="btn-secondary !py-1 !px-2.5 !min-h-[34px] text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Přidat položku
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(activeQuestion.correctOrder ?? activeQuestion.options ?? []).map((item, idx, arr) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-black text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const next = arr.map((x, i) => (i === idx ? e.target.value : x));
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                options: next,
                                correctOrder: next,
                                correctAnswer: next.join(' → ')
                              }));
                            }}
                            className="flex-1"
                          />
                          <button
                            type="button"
                            disabled={idx === 0}
                            aria-label="Posunout položku výše"
                            onClick={() => {
                              const next = [...arr];
                              [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                options: next,
                                correctOrder: next,
                                correctAnswer: next.join(' → ')
                              }));
                            }}
                            className="btn-secondary !p-2"
                          >
                            <ArrowUp className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === arr.length - 1}
                            aria-label="Posunout položku níže"
                            onClick={() => {
                              const next = [...arr];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                options: next,
                                correctOrder: next,
                                correctAnswer: next.join(' → ')
                              }));
                            }}
                            className="btn-secondary !p-2"
                          >
                            <ArrowDown className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={arr.length <= 2}
                            aria-label="Smazat položku"
                            onClick={() => {
                              const next = arr.filter((_, i) => i !== idx);
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                options: next,
                                correctOrder: next,
                                correctAnswer: next.join(' → ')
                              }));
                            }}
                            className="btn-secondary !p-2 text-[var(--danger)]"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-question timing & scoring overrides: Time -> Grace Period -> Base Points -> Speed Bonus */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-time" className="text-xs font-bold">Čas (s, prázdné = výchozí)</label>
                    <input
                      id="q-time"
                      type="number"
                      min={5}
                      max={300}
                      placeholder={String(quiz.settings.defaultTimeLimitSeconds)}
                      value={activeQuestion.timeLimitSeconds ?? ''}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          timeLimitSeconds: e.target.value ? Number(e.target.value) : null
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-grace" className="text-xs font-bold">Ochranná doba (s)</label>
                    <input
                      id="q-grace"
                      type="number"
                      min={0}
                      max={60}
                      placeholder={String(quiz.settings.gracePeriodSeconds)}
                      value={activeQuestion.gracePeriodSeconds ?? ''}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          gracePeriodSeconds: e.target.value ? Number(e.target.value) : null
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-pts" className="text-xs font-bold">Body (prázdné = výchozí)</label>
                    <input
                      id="q-pts"
                      type="number"
                      min={0}
                      step={100}
                      placeholder={String(Math.round(quiz.settings.basePoints * activeRound.pointMultiplier))}
                      value={activeQuestion.basePoints ?? ''}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          basePoints: e.target.value ? Number(e.target.value) : null
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="q-speed" className="text-xs font-bold">Bonusové body za čas</label>
                    <input
                      id="q-speed"
                      type="number"
                      min={0}
                      step={50}
                      placeholder={String(quiz.settings.speedBonusMax)}
                      value={activeQuestion.speedBonusMax ?? ''}
                      onChange={(e) =>
                        updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                          ...q,
                          speedBonusMax: e.target.value ? Number(e.target.value) : null
                        }))
                      }
                    />
                  </div>
                </div>

                {/* MULTIMEDIA STUDIO */}
                <div className="elevated-card p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                      Multimediální příloha (lokální soubor nebo externí odkaz URL)
                    </span>
                    {activeQuestion.media ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({ ...q, media: null }))
                        }
                        className="btn-secondary !py-1 !px-2.5 !min-h-[34px] text-xs text-[var(--danger)]"
                      >
                        Odebrat médium
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setMediaInputMode(mediaFiles.length > 0 ? 'local' : 'url');
                          updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                            ...q,
                            media: {
                              type: 'image',
                              src: mediaFiles[0] ?? '',
                              playbackMode: 'duringQuestion',
                              startSeconds: 0,
                              endSeconds: null,
                              altText: '',
                              transcript: ''
                            }
                          }));
                        }}
                        className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Připojit médium
                      </button>
                    )}
                  </div>

                  {activeQuestion.media && (() => {
                    const isExternalSrc = /^https?:\/\//i.test(activeQuestion.media.src.trim());
                    const effectiveMode: 'local' | 'url' =
                      activeQuestion.media.type === 'youtube'
                        ? 'url'
                        : isExternalSrc
                          ? 'url'
                          : activeQuestion.media.src.startsWith('media/')
                            ? 'local'
                            : mediaInputMode;

                    const previewUrl =
                      activeQuestion.media.type === 'youtube' || isExternalSrc
                        ? activeQuestion.media.src.trim()
                        : `/api/quizzes/${encodeURIComponent(quiz.id)}/media/${activeQuestion.media.src.replace(/^media\//, '')}`;

                    return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="m-type" className="text-xs font-bold">Typ média</label>
                          <select
                            id="m-type"
                            value={activeQuestion.media.type}
                            onChange={(e) =>
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                media: { ...q.media!, type: e.target.value as DesignerMediaAttachment['type'] }
                              }))
                            }
                          >
                            <option value="image">Obrázek (soubor / URL)</option>
                            <option value="audio">Audio ukázka (soubor / URL)</option>
                            <option value="video">Video (soubor / URL)</option>
                            <option value="youtube">YouTube odkaz / ID</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label htmlFor="m-mode" className="text-xs font-bold">Kdy přehrát / zobrazit</label>
                          <select
                            id="m-mode"
                            value={activeQuestion.media.playbackMode}
                            onChange={(e) =>
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                media: { ...q.media!, playbackMode: e.target.value as 'duringQuestion' | 'onReveal' }
                              }))
                            }
                          >
                            <option value="duringQuestion">Během otázky</option>
                            <option value="onReveal">Až při odhalení odpovědi</option>
                          </select>
                        </div>

                        {activeQuestion.media.type !== 'youtube' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold">Zdroj média</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                aria-pressed={effectiveMode === 'local'}
                                onClick={() => {
                                  setMediaInputMode('local');
                                  if (isExternalSrc) {
                                    updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                      ...q,
                                      media: { ...q.media!, src: mediaFiles[0] ?? '' }
                                    }));
                                  }
                                }}
                                className={`py-2 px-2 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                                  effectiveMode === 'local'
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                }`}
                              >
                                Lokální soubor
                              </button>
                              <button
                                type="button"
                                aria-pressed={effectiveMode === 'url'}
                                onClick={() => {
                                  setMediaInputMode('url');
                                  if (activeQuestion.media!.src.startsWith('media/')) {
                                    updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                      ...q,
                                      media: { ...q.media!, src: '' }
                                    }));
                                  }
                                }}
                                className={`py-2 px-2 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                                  effectiveMode === 'url'
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                }`}
                              >
                                Odkaz (URL)
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 justify-end text-xs text-[var(--text-muted)] pb-2">
                            Vyžaduje připojení k internetu.
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className={activeQuestion.media.type === 'image' ? 'sm:col-span-12 flex flex-col gap-1' : 'sm:col-span-6 flex flex-col gap-1'}>
                          <label htmlFor="m-src" className="text-xs font-bold">
                            {activeQuestion.media.type === 'youtube'
                              ? 'YouTube URL nebo ID videa'
                              : effectiveMode === 'url'
                                ? 'Externí URL adresa média (https://…)'
                                : 'Lokální soubor z media/ (nebo nahrajte nový)'}
                          </label>

                          {effectiveMode === 'local' && activeQuestion.media.type !== 'youtube' ? (
                            <div className="flex flex-wrap sm:flex-nowrap gap-2">
                              {mediaFiles.length > 0 ? (
                                <select
                                  id="m-src"
                                  value={activeQuestion.media.src}
                                  onChange={(e) =>
                                    updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                      ...q,
                                      media: { ...q.media!, src: e.target.value }
                                    }))
                                  }
                                  className="flex-1 min-w-0"
                                >
                                  <option value="">-- Vyberte nahraný soubor --</option>
                                  {mediaFiles.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  id="m-src"
                                  type="text"
                                  value={activeQuestion.media.src}
                                  onChange={(e) =>
                                    updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                      ...q,
                                      media: { ...q.media!, src: e.target.value }
                                    }))
                                  }
                                  placeholder="media/ukazka.mp3"
                                  className="flex-1 min-w-0"
                                />
                              )}
                              <label className="btn-secondary !py-2 !px-3 text-xs cursor-pointer shrink-0">
                                <Upload className="w-4 h-4" aria-hidden="true" />
                                <span>{uploading ? 'Nahrávám…' : 'Nahrát'}</span>
                                <input
                                  type="file"
                                  disabled={uploading}
                                  accept="image/*,audio/*,video/*,.vtt"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                      setMediaInputMode('local');
                                      void handleUploadMedia(f, true);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                          ) : (
                            <input
                              id="m-src"
                              type={activeQuestion.media.type === 'youtube' ? 'text' : 'url'}
                              value={activeQuestion.media.src}
                              onChange={(e) =>
                                updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                  ...q,
                                  media: { ...q.media!, src: e.target.value }
                                }))
                              }
                              placeholder={
                                activeQuestion.media.type === 'youtube'
                                  ? 'např. dQw4w9WgXcQ nebo https://youtu.be/...'
                                  : activeQuestion.media.type === 'image'
                                    ? 'https://example.com/obrazek.jpg'
                                    : activeQuestion.media.type === 'audio'
                                      ? 'https://example.com/ukazka.mp3'
                                      : 'https://example.com/video.mp4'
                              }
                            />
                          )}
                        </div>

                        {activeQuestion.media.type !== 'image' && (
                          <>
                            <div className="sm:col-span-3 flex flex-col gap-1">
                              <label htmlFor="m-start" className="text-xs font-bold">Start (s)</label>
                              <input
                                id="m-start"
                                type="number"
                                min={0}
                                step={1}
                                value={activeQuestion.media.startSeconds ?? 0}
                                onChange={(e) =>
                                  updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                    ...q,
                                    media: { ...q.media!, startSeconds: Number(e.target.value) }
                                  }))
                                }
                              />
                            </div>
                            <div className="sm:col-span-3 flex flex-col gap-1">
                              <label htmlFor="m-end" className="text-xs font-bold">Konec (s, volitelné)</label>
                              <input
                                id="m-end"
                                type="number"
                                min={0}
                                step={1}
                                value={activeQuestion.media.endSeconds ?? ''}
                                onChange={(e) =>
                                  updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                    ...q,
                                    media: {
                                      ...q.media!,
                                      endSeconds: e.target.value ? Number(e.target.value) : null
                                    }
                                  }))
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="m-alt" className="text-xs font-bold">Alternativní popis (WCAG alt)</label>
                          <input
                            id="m-alt"
                            type="text"
                            value={activeQuestion.media.altText ?? ''}
                            onChange={(e) =>
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                media: { ...q.media!, altText: e.target.value }
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor="m-tr" className="text-xs font-bold">Textový přepis audia/videa (WCAG)</label>
                          <input
                            id="m-tr"
                            type="text"
                            value={activeQuestion.media.transcript ?? ''}
                            onChange={(e) =>
                              updateQuestion(selection.roundIndex, selection.questionIndex, (q) => ({
                                ...q,
                                media: { ...q.media!, transcript: e.target.value }
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* Live Media Preview */}
                      {activeQuestion.media.src.trim() && (
                        <div className="pt-2">
                          <MediaPlayer
                            media={{
                              type: activeQuestion.media.type,
                              url: previewUrl,
                              rawSrc: activeQuestion.media.src.trim(),
                              startSeconds: activeQuestion.media.startSeconds,
                              endSeconds: activeQuestion.media.endSeconds,
                              playbackMode: activeQuestion.media.playbackMode,
                              altText: activeQuestion.media.altText,
                              transcript: activeQuestion.media.transcript
                            }}
                            token={token}
                            autoPlay={false}
                            isPaused={false}
                            showControls
                          />
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* 1B. BONUS TASKS EDITOR */}
            {selection.kind === 'tasks' && (() => {
              const tasks: BonusTask[] = quiz.bonusTasks ?? [];
              const addBonusTask = (preset?: Partial<BonusTask>) => {
                const nextIdx = tasks.length + 1;
                const created: BonusTask = {
                  id: preset?.id
                    ? `${preset.id}-${Math.random().toString(36).slice(2, 5)}`
                    : `task-${nextIdx}-${Math.random().toString(36).slice(2, 5)}`,
                  title: preset?.title ?? `Bonusový úkol ${nextIdx}`,
                  description: preset?.description ?? '',
                  points: preset?.points ?? 300,
                  maxCompletionsPerTeam: preset?.maxCompletionsPerTeam ?? 1
                };
                mutateQuiz((p) => ({ ...p, bonusTasks: [...(p.bonusTasks ?? []), created] }));
              };
              const updateTask = (idx: number, updater: (t: BonusTask) => BonusTask) => {
                mutateQuiz((p) => ({
                  ...p,
                  bonusTasks: (p.bonusTasks ?? []).map((item, i) => (i === idx ? updater(item) : item))
                }));
              };
              const moveTask = (idx: number, delta: -1 | 1) => {
                const target = idx + delta;
                if (target < 0 || target >= tasks.length) return;
                mutateQuiz((p) => {
                  const copy = [...(p.bonusTasks ?? [])];
                  [copy[idx], copy[target]] = [copy[target], copy[idx]];
                  return { ...p, bonusTasks: copy };
                });
              };
              const removeTask = (idx: number) => {
                mutateQuiz((p) => ({
                  ...p,
                  bonusTasks: (p.bonusTasks ?? []).filter((_, i) => i !== idx)
                }));
              };

              return (
                <section className="surface-card p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black m-0 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
                        <span>Bonusové úkoly ({tasks.length})</span>
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 mb-0">
                        Vedoucí týmu nahlásí splnění úkolu přes telefon moderátorovi, který zhodnotí splnění a jedním kliknutím připíše body.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          addBonusTask({
                            id: 'task-panak',
                            title: 'Runda panáků pro celý tým',
                            description: 'Vedoucí týmu objedná všem členům týmu panáka (nebo nealko shot) a ukáže moderátorovi.',
                            points: 300,
                            maxCompletionsPerTeam: 2
                          })
                        }
                        className="btn-secondary !py-1.5 !px-3 text-xs"
                      >
                        <Sparkles className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                        Vzor: Panák pro tým
                      </button>
                      <button type="button" onClick={() => addBonusTask()} className="btn-primary !py-1.5 !px-3.5 text-sm">
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        Přidat úkol
                      </button>
                    </div>
                  </div>

                  {tasks.length === 0 ? (
                    <div className="elevated-card p-6 text-center space-y-2">
                      <p className="m-0 font-bold text-sm">Tento kvíz zatím nemá žádné bonusové úkoly.</p>
                      <p className="m-0 text-xs text-[var(--text-secondary)]">
                        Přidejte libovolné hospodské výzvy (např. runda panáků, týmový přípitek, fotka u baru) s počtem bodů a limitem splnění za hru.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tasks.map((task, idx) => (
                        <div key={task.id + idx} className="elevated-card p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold uppercase text-[var(--text-muted)]">
                              Úkol #{idx + 1} • <code className="font-mono">{task.id}</code>
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveTask(idx, -1)}
                                aria-label="Posunout úkol nahoru"
                                className="btn-secondary !p-1.5 !min-h-[34px] disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === tasks.length - 1}
                                onClick={() => moveTask(idx, 1)}
                                aria-label="Posunout úkol dolů"
                                className="btn-secondary !p-1.5 !min-h-[34px] disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTask(idx)}
                                aria-label="Smazat úkol"
                                className="btn-secondary !p-1.5 !min-h-[34px] text-[var(--danger)]"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-6 flex flex-col gap-1">
                              <label htmlFor={`task-title-${idx}`} className="text-xs font-bold">
                                Název úkolu
                              </label>
                              <input
                                id={`task-title-${idx}`}
                                type="text"
                                value={task.title}
                                onChange={(e) => updateTask(idx, (t) => ({ ...t, title: e.target.value }))}
                                placeholder="Např. Runda panáků pro celý tým"
                              />
                            </div>
                            <div className="md:col-span-3 flex flex-col gap-1">
                              <label htmlFor={`task-pts-${idx}`} className="text-xs font-bold">
                                Body za splnění
                              </label>
                              <input
                                id={`task-pts-${idx}`}
                                type="number"
                                min={0}
                                max={100000}
                                step={50}
                                value={task.points}
                                onChange={(e) =>
                                  updateTask(idx, (t) => ({ ...t, points: Math.max(0, Number(e.target.value)) }))
                                }
                              />
                            </div>
                            <div className="md:col-span-3 flex flex-col gap-1">
                              <label htmlFor={`task-max-${idx}`} className="text-xs font-bold">
                                Max. splnění / tým
                              </label>
                              <input
                                id={`task-max-${idx}`}
                                type="number"
                                min={1}
                                max={50}
                                value={task.maxCompletionsPerTeam}
                                onChange={(e) =>
                                  updateTask(idx, (t) => ({
                                    ...t,
                                    maxCompletionsPerTeam: Math.max(1, Number(e.target.value))
                                  }))
                                }
                              />
                            </div>
                            <div className="md:col-span-12 flex flex-col gap-1">
                              <label htmlFor={`task-desc-${idx}`} className="text-xs font-bold">
                                Podrobnější popis / pravidla úkolu (volitelné)
                              </label>
                              <textarea
                                id={`task-desc-${idx}`}
                                rows={2}
                                value={task.description ?? ''}
                                onChange={(e) => updateTask(idx, (t) => ({ ...t, description: e.target.value }))}
                                placeholder="Např. Vedoucí týmu objedná všem členům týmu panáka a ukáže moderátorovi…"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })()}

            {/* 4. MEDIA LIBRARY */}
            {selection.kind === 'media' && (
              <section className="surface-card p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black m-0">Knihovna lokálních médií ({quiz.id})</h2>
                    <p className="text-xs text-[var(--text-secondary)] m-0">
                      Soubory nahrané sem se ukládají do <code>quizzes/{quiz.id}/media/</code> a fungují 100 % offline.
                    </p>
                  </div>
                  <label className="btn-primary cursor-pointer">
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    <span>{uploading ? 'Nahrávám…' : 'Nahrát soubor'}</span>
                    <input
                      type="file"
                      disabled={uploading || isNewUnsaved}
                      accept="image/*,audio/*,video/*,.vtt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadMedia(f, false);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {mediaFiles.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Zatím nejsou nahrané žádné soubory.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mediaFiles.map((file) => {
                      const isImg = /\.(png|jpe?g|webp|svg|gif)$/i.test(file);
                      const cleanName = file.replace(/^media\//, '');
                      const mediaUrl = withMediaToken(
                        `/api/quizzes/${encodeURIComponent(quiz.id)}/media/${encodeURIComponent(cleanName)}`,
                        token
                      );
                      return (
                        <div key={file} className="elevated-card p-3 space-y-2.5 flex flex-col justify-between">
                          {isImg ? (
                            <img src={mediaUrl} alt={cleanName} className="w-full h-32 object-contain rounded-lg bg-black/10" />
                          ) : (
                            <div className="w-full h-32 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center">
                              <Music className="w-10 h-10 text-[var(--accent)]" aria-hidden="true" />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs truncate font-bold">{file}</span>
                            <button
                              type="button"
                              aria-label={`Smazat ${cleanName}`}
                              onClick={async () => {
                                const res = await api.designer.deleteMedia(token, quiz.id, cleanName);
                                setMediaFiles(res.mediaFiles);
                              }}
                              className="btn-secondary !p-1.5 !min-h-[34px] text-[var(--danger)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 5. TRANSLATIONS EDITOR */}
            {selection.kind === 'translations' && (
              <section className="surface-card p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black m-0">Jazykové mutace kvízu</h2>
                    <p className="text-xs text-[var(--text-secondary)] m-0">
                      Ukládají se jako <code>quizzes/{quiz.id}/translations/&lt;jazyk&gt;.json</code>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label="Kód nového jazyka (např. en, sk, de)"
                      maxLength={8}
                      value={newTrLang}
                      onChange={(e) => setNewTrLang(e.target.value.toLowerCase())}
                      placeholder="např. en / sk / de"
                      className="w-36 !min-h-[40px]"
                    />
                    <button
                      type="button"
                      disabled={!newTrLang.trim()}
                      onClick={() => {
                        const code = newTrLang.trim().toLowerCase();
                        setTranslations((prev) => ({
                          ...prev,
                          [code]: prev[code] ?? { language: code, title: quiz.title, rounds: {}, questions: {} }
                        }));
                        setActiveTrLang(code);
                        setNewTrLang('');
                      }}
                      className="btn-secondary !py-1.5 !px-3 !min-h-[40px] text-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Přidat jazyk
                    </button>
                  </div>
                </div>

                {Object.keys(translations).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Tento kvíz zatím nemá žádný překlad. Zadejte kód jazyka výše (např. <code>en</code>) a klikněte na Přidat jazyk.
                  </p>
                ) : (
                  activeTranslation && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-2">
                          {Object.keys(translations).map((langCode) => (
                            <button
                              key={langCode}
                              type="button"
                              onClick={() => setActiveTrLang(langCode)}
                              className={`px-3 py-1.5 rounded-lg font-extrabold text-sm uppercase border-2 cursor-pointer ${
                                activeTrLang === langCode
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                              }`}
                            >
                              {langCode}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          disabled={isNewUnsaved}
                          onClick={async () => {
                            await api.designer.saveTranslation(token, quiz.id, activeTrLang, activeTranslation);
                            setStatusBanner({ kind: 'success', text: `Překlad (${activeTrLang.toUpperCase()}) uložen.` });
                          }}
                          className="btn-primary !py-1.5 !px-4 !min-h-[40px] text-sm"
                        >
                          <Save className="w-4 h-4" aria-hidden="true" />
                          Uložit překlad ({activeTrLang.toUpperCase()})
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold">Přeložený název kvízu (orig: {quiz.title})</label>
                          <input
                            type="text"
                            value={activeTranslation.title ?? ''}
                            onChange={(e) =>
                              setTranslations((p) => ({
                                ...p,
                                [activeTrLang]: { ...activeTranslation, title: e.target.value }
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold">Přeložený popis</label>
                          <input
                            type="text"
                            value={activeTranslation.description ?? ''}
                            onChange={(e) =>
                              setTranslations((p) => ({
                                ...p,
                                [activeTrLang]: { ...activeTranslation, description: e.target.value }
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                        {(quiz.bonusTasks ?? []).length > 0 && (
                          <div className="elevated-card p-3 space-y-2.5">
                            <div className="font-extrabold text-sm">
                              Bonusové úkoly ({(quiz.bonusTasks ?? []).length})
                            </div>
                            {(quiz.bonusTasks ?? []).map((bt) => {
                              const btTr = activeTranslation.bonusTasks?.[bt.id] ?? {};
                              return (
                                <div key={bt.id} className="p-2.5 rounded-lg bg-[var(--bg-surface)] space-y-1.5">
                                  <div className="text-xs text-[var(--text-muted)] font-semibold">
                                    [{bt.id}] {bt.title}
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Překlad názvu úkolu…"
                                    value={btTr.title ?? ''}
                                    onChange={(e) =>
                                      setTranslations((p) => ({
                                        ...p,
                                        [activeTrLang]: {
                                          ...activeTranslation,
                                          bonusTasks: {
                                            ...(activeTranslation.bonusTasks ?? {}),
                                            [bt.id]: { ...btTr, title: e.target.value }
                                          }
                                        }
                                      }))
                                    }
                                    className="w-full !min-h-[38px] text-sm"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Překlad popisu úkolu…"
                                    value={btTr.description ?? ''}
                                    onChange={(e) =>
                                      setTranslations((p) => ({
                                        ...p,
                                        [activeTrLang]: {
                                          ...activeTranslation,
                                          bonusTasks: {
                                            ...(activeTranslation.bonusTasks ?? {}),
                                            [bt.id]: { ...btTr, description: e.target.value }
                                          }
                                        }
                                      }))
                                    }
                                    className="w-full !min-h-[38px] text-sm"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {quiz.rounds.map((r) => (
                          <div key={r.roundNumber} className="elevated-card p-3 space-y-2.5">
                            <div className="font-extrabold text-sm">
                              Kolo {r.roundNumber}: {r.title}
                            </div>
                            <input
                              type="text"
                              placeholder={`Překlad názvu kola (${r.title})`}
                              value={activeTranslation.rounds?.[String(r.roundNumber)]?.title ?? ''}
                              onChange={(e) =>
                                setTranslations((p) => ({
                                  ...p,
                                  [activeTrLang]: {
                                    ...activeTranslation,
                                    rounds: {
                                      ...(activeTranslation.rounds ?? {}),
                                      [String(r.roundNumber)]: {
                                        ...(activeTranslation.rounds?.[String(r.roundNumber)] ?? {}),
                                        title: e.target.value
                                      }
                                    }
                                  }
                                }))
                              }
                              className="w-full !min-h-[40px]"
                            />

                            {r.questions.map((q) => {
                              const qTr = activeTranslation.questions?.[q.id] ?? {};
                              return (
                                <div key={q.id} className="p-2.5 rounded-lg bg-[var(--bg-surface)] space-y-1.5">
                                  <div className="text-xs text-[var(--text-muted)] font-semibold">
                                    [{q.id}] {q.text}
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Překlad znění otázky…"
                                    value={qTr.text ?? ''}
                                    onChange={(e) =>
                                      setTranslations((p) => ({
                                        ...p,
                                        [activeTrLang]: {
                                          ...activeTranslation,
                                          questions: {
                                            ...(activeTranslation.questions ?? {}),
                                            [q.id]: { ...qTr, text: e.target.value }
                                          }
                                        }
                                      }))
                                    }
                                    className="w-full !min-h-[38px] text-sm"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </section>
            )}
          </main>
        </div>
      ) : (
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="surface-card p-8 text-center space-y-4">
            <p className="m-0 font-bold">Zatím není vybrán žádný kvíz.</p>
            <button type="button" onClick={() => setNewModalOpen(true)} className="btn-primary">
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              Vytvořit první kvíz
            </button>
          </div>
        </main>
      )}

      {/* MODAL: New Quiz */}
      <ModalDialog open={newModalOpen} onClose={() => setNewModalOpen(false)} title="Vytvořit nový kvíz">
        <form onSubmit={handleCreateNew} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-qz-title" className="text-xs font-bold">Název kvízu</label>
            <input
              id="new-qz-title"
              type="text"
              required
              value={newQuizTitle}
              onChange={(e) => setNewQuizTitle(e.target.value)}
              placeholder="Např. Vánoční hospodský speciál"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-qz-id" className="text-xs font-bold">ID složky (volitelné, jinak se vytvoří automaticky)</label>
            <input
              id="new-qz-id"
              type="text"
              value={newQuizId}
              onChange={(e) => setNewQuizId(e.target.value)}
              placeholder="vanocni-special-2026"
              className="font-mono"
            />
          </div>
          <fieldset className="border-0 p-0 m-0 space-y-2">
            <legend className="text-xs font-bold mb-1">Výchozí šablona</legend>
            <label className="elevated-card p-3 flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="quiz-template"
                checked={newTemplate === 'blank'}
                onChange={() => setNewTemplate('blank')}
                className="w-4 h-4"
              />
              <div>
                <div className="font-bold text-sm">Čistý start (1 kolo, 1 otázka)</div>
                <div className="text-xs text-[var(--text-secondary)]">Přidávejte kola a otázky postupně.</div>
              </div>
            </label>
            <label className="elevated-card p-3 flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="quiz-template"
                checked={newTemplate === 'full70'}
                onChange={() => setNewTemplate('full70')}
                className="w-4 h-4"
              />
              <div>
                <div className="font-bold text-sm">Standardní hospodský kvíz (5×12 + 10 = 70 otázek)</div>
                <div className="text-xs text-[var(--text-secondary)]">Předpřipravená kostra 5 základních kol + finále.</div>
              </div>
            </label>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewModalOpen(false)} className="btn-secondary">Zrušit</button>
            <button type="submit" className="btn-primary">Vytvořit</button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL: Duplicate Quiz */}
      <ModalDialog open={dupModalOpen} onClose={() => setDupModalOpen(false)} title="Duplikovat kvíz (včetně médií)">
        <form onSubmit={handleDuplicate} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="dup-title" className="text-xs font-bold">Název nové kopie</label>
            <input id="dup-title" type="text" required value={dupTitle} onChange={(e) => setDupTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dup-id" className="text-xs font-bold">ID nové kopie (slug)</label>
            <input id="dup-id" type="text" required value={dupId} onChange={(e) => setDupId(e.target.value)} className="font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDupModalOpen(false)} className="btn-secondary">Zrušit</button>
            <button type="submit" className="btn-primary">Duplikovat</button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL: Confirm Delete Quiz */}
      <ModalDialog open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Smazat kvíz?" lightDismiss={false}>
        <div className="space-y-4">
          <p className="m-0 text-sm text-[var(--text-secondary)]">
            Opravdu chcete trvale odstranit kvíz <strong>{quiz?.title}</strong> včetně jeho nahraných médií?
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setDeleteModalOpen(false)} className="btn-secondary">
              Zrušit
            </button>
            <button type="button" onClick={() => void handleDeleteQuiz()} className="btn-danger">
              Trvale smazat
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
