import type { ReactNode } from 'react';

export function Alert({ variant, children }: { variant: 'error' | 'info'; children: ReactNode }) {
  if (variant === 'info') {
    return (
      <p className="info-message" role="status">
        {children}
      </p>
    );
  }
  return (
    <p className="error-message" role="alert">
      {children}
    </p>
  );
}
