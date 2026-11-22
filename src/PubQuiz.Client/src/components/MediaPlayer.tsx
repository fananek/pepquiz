import { useEffect, useRef, useState } from 'react';
import { Volume2, Play, Pause, Youtube } from 'lucide-react';
import type { PublicMedia } from '../types/quiz';
import { withMediaToken } from '../services/api';
import { useI18n } from '../i18n/I18nContext';

interface MediaPlayerProps {
  media: PublicMedia;
  token: string;
  autoPlay: boolean;
  isPaused: boolean;
  showControls?: boolean;
  large?: boolean;
}

export function MediaPlayer({
  media,
  token,
  autoPlay,
  isPaused,
  showControls = false,
  large = false
}: MediaPlayerProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const startSec = media.startSeconds ?? 0;
  const endSec = media.endSeconds ?? null;
  const safeMediaUrl = isSafeMediaUrl(media.url) ? media.url : '';
  const safeCaptionsUrl = media.captionsUrl && isSafeMediaUrl(media.captionsUrl) ? media.captionsUrl : null;
  const mediaSrc = safeMediaUrl ? withMediaToken(safeMediaUrl, token) : '';
  const captionsSrc = safeCaptionsUrl ? withMediaToken(safeCaptionsUrl, token) : null;

  // Manage HTML5 audio/video clip window (startSeconds -> endSeconds) and pause sync
  useEffect(() => {
    const el = media.type === 'audio' ? audioRef.current : media.type === 'video' ? videoRef.current : null;
    if (!el) return;

    let clipEnded = false;

    const seekToStart = () => {
      if (startSec > 0 && Math.abs(el.currentTime - startSec) > 0.4) {
        try {
          el.currentTime = startSec;
        } catch {
          // Ignore seek errors before metadata
        }
      }
    };

    const tryPlay = () => {
      if (!autoPlay || isPaused || clipEnded) return;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.then(() => {
          setAutoplayBlocked(false);
          setIsPlaying(true);
        }).catch(() => {
          setAutoplayBlocked(true);
          setIsPlaying(false);
        });
      }
    };

    const onLoadedMetadata = () => {
      seekToStart();
      tryPlay();
    };

    const onTimeUpdate = () => {
      const duration = endSec !== null ? Math.max(0.5, endSec - startSec) : Math.max(1, el.duration || 1);
      const elapsed = Math.max(0, el.currentTime - startSec);
      setProgress(Math.min(100, (elapsed / duration) * 100));

      if (endSec !== null && el.currentTime >= endSec) {
        el.pause();
        clipEnded = true;
        setIsPlaying(false);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    if (el.readyState >= 1) {
      seekToStart();
      if (isPaused) {
        el.pause();
      } else {
        tryPlay();
      }
    }

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [mediaSrc, media.type, startSec, endSec, autoPlay]);

  // React to pause/resume changes
  useEffect(() => {
    const el = media.type === 'audio' ? audioRef.current : media.type === 'video' ? videoRef.current : null;
    if (el) {
      if (isPaused) {
        el.pause();
      } else if (autoPlay) {
        el.play().catch(() => setAutoplayBlocked(true));
      }
    }
    // YouTube iframe postMessage pause/play (strict targetOrigin — never wildcard '*')
    if (media.type === 'youtube' && iframeRef.current?.contentWindow) {
      const cmd = isPaused ? 'pauseVideo' : 'playVideo';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: cmd, args: [] }),
        'https://www.youtube-nocookie.com'
      );
    }
  }, [isPaused, autoPlay, media.type]);

  const handleManualToggle = () => {
    const el = media.type === 'audio' ? audioRef.current : videoRef.current;
    if (!el) return;
    if (el.paused) {
      if (endSec !== null && el.currentTime >= endSec - 0.1) {
        el.currentTime = startSec;
      }
      el.play().then(() => setAutoplayBlocked(false)).catch(() => {});
    } else {
      el.pause();
    }
  };

  if (media.type === 'image') {
    if (!mediaSrc) return null;
    return (
      <figure className="m-0 flex flex-col items-center">
        <img
          src={mediaSrc}
          alt={media.altText || 'Obrázek k otázce'}
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          className={`rounded-2xl object-contain border border-[var(--border-subtle)] bg-black/5 ${
            large ? 'max-h-[42vh] max-w-full' : 'max-h-60 max-w-full'
          }`}
        />
      </figure>
    );
  }

  if (media.type === 'audio') {
    return (
      <div className="elevated-card p-4 sm:p-5 w-full max-w-2xl mx-auto">
        <audio ref={audioRef} src={mediaSrc} preload="metadata" controls={showControls} className={showControls ? 'w-full mb-3' : 'hidden'} />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <Volume2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm font-semibold mb-1.5">
              <span>{isPlaying ? 'Přehrává se zvuková ukázka…' : 'Zvuková ukázka'}</span>
              {endSec !== null && (
                <span className="text-[var(--text-muted)] tabular-nums">
                  {startSec}s – {endSec}s
                </span>
              )}
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {(showControls || autoplayBlocked) && (
            <button
              type="button"
              onClick={handleManualToggle}
              className="btn-primary !px-3.5 !py-2 shrink-0"
              aria-label={isPlaying ? 'Pozastavit ukázku' : 'Přehrát ukázku'}
            >
              {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>

        {media.transcript && (
          <details className="mt-3 text-sm text-[var(--text-secondary)]">
            <summary className="cursor-pointer font-medium">{t.screen.transcriptSummary}</summary>
            <p className="mt-2 p-3 rounded-lg bg-[var(--bg-surface)] m-0">{media.transcript}</p>
          </details>
        )}
      </div>
    );
  }

  if (media.type === 'video') {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <video
          ref={videoRef}
          src={mediaSrc}
          controls={showControls || autoplayBlocked}
          playsInline
          preload="metadata"
          className={`w-full rounded-2xl border border-[var(--border-subtle)] bg-black ${
            large ? 'max-h-[42vh]' : 'max-h-64'
          }`}
        >
          {captionsSrc && <track kind="captions" src={captionsSrc} srcLang="cs" label="Čeština" default />}
        </video>
        {media.transcript && (
          <details className="mt-2 text-sm text-[var(--text-secondary)]">
            <summary className="cursor-pointer font-medium">{t.screen.transcriptSummary}</summary>
            <p className="mt-2 p-3 rounded-lg bg-[var(--bg-surface)] m-0">{media.transcript}</p>
          </details>
        )}
      </div>
    );
  }

  if (media.type === 'youtube') {
    const cleanId = extractYouTubeId(media.rawSrc);
    if (!cleanId) {
      return (
        <div className="elevated-card p-4 text-sm text-[var(--text-secondary)] text-center">
          Neplatný identifikátor YouTube videa.
        </div>
      );
    }
    const params = new URLSearchParams({
      rel: '0',
      modestbranding: '1',
      enablejsapi: '1',
      autoplay: autoPlay && !isPaused ? '1' : '0'
    });
    if (startSec > 0) params.set('start', String(Math.floor(startSec)));
    if (endSec !== null && endSec > startSec) params.set('end', String(Math.floor(endSec)));
    const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}?${params.toString()}`;

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-black">
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={media.altText || 'YouTube video ukázka ke kvízové otázce'}
            className="w-full h-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mt-1.5">
          <span className="inline-flex items-center gap-1">
            <Youtube className="w-3.5 h-3.5" aria-hidden="true" />
            YouTube ukázka {startSec > 0 || endSec ? `(${startSec}s – ${endSec ?? 'konec'}s)` : ''}
          </span>
        </div>
        {media.transcript && (
          <details className="mt-2 text-sm text-[var(--text-secondary)]">
            <summary className="cursor-pointer font-medium">{t.screen.transcriptSummary}</summary>
            <p className="mt-2 p-3 rounded-lg bg-[var(--bg-surface)] m-0">{media.transcript}</p>
          </details>
        )}
      </div>
    );
  }

  return null;
}

function isSafeMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/quizzes/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function extractYouTubeId(src: string): string | null {
  const trimmed = src.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}
