import { useEffect, useRef } from 'react';

import { btnPrimaryClass, btnSecondaryClass } from './ui.js';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      // Ignore Escape while a submission is in flight so the dialog cannot
      // unmount mid-submit.
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  return (
    // The `dialog-backdrop` class is asserted by tests — keep it.
    <div className="dialog-backdrop">
      <div
        className="grid w-full max-w-[440px] gap-3.5 rounded-2xl border border-line bg-white p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <h2 id="confirm-dialog-title" className="m-0 text-[1.15rem] font-bold text-ink">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="m-0 text-[0.93rem] text-muted">
          {description}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          <button
            ref={confirmRef}
            className={btnPrimaryClass}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button className={btnSecondaryClass} type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
