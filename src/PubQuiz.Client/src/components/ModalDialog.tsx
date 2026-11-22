import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  lightDismiss?: boolean;
  children: React.ReactNode;
}

/**
 * Native <dialog> modal following modern-web-guidance:
 * - Opened via showModal() (no redundant role="dialog", aria-modal, or manual focus trap)
 * - Uses closedby="any" for light dismiss + Safari pointerdown/pointerup outside-rect fallback
 * - Resets dialog.returnValue = '' on close
 */
export function ModalDialog({
  open,
  onClose,
  title,
  lightDismiss = true,
  children
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);

    // Safari fallback for closedby="any" (checks pointer coordinates, never event.target alone)
    const needsLightDismissFallback =
      lightDismiss && typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype);

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    if (needsLightDismissFallback) {
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (needsLightDismissFallback) {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      }
    };
  }, [lightDismiss, onClose]);

  const dialogProps = lightDismiss ? ({ closedby: 'any' } as Record<string, string>) : {};

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} {...dialogProps}>
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <h2 id={titleId} className="text-lg sm:text-xl font-bold m-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t.app.close}
            className="btn-secondary !p-2 !min-h-[40px] !min-w-[40px]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </dialog>
  );
}
