import type { ReactNode } from 'react';

export function Alert({ variant, children }: { variant: 'error' | 'info'; children: ReactNode }) {
  if (variant === 'info') {
    return (
      <p
        role="status"
        className="rounded-[10px] border border-line bg-wash py-3 pl-3.5 pr-3.5 text-[0.9rem] text-ink [border-left:3px_solid_var(--color-ink)]"
      >
        {children}
      </p>
    );
  }
  // The `error-message` class is asserted by tests — keep it.
  return (
    <p className="error-message" role="alert">
      {children}
    </p>
  );
}
