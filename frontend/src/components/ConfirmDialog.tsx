import { useEffect, useRef } from 'react';

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
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
        <div className="dialog-actions">
          <button
            ref={confirmRef}
            className="button"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
