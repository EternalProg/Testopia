import type { ReactNode } from 'react';

/*
 * Single design language for the whole app (Tailwind v4 utilities).
 * Every page and shared component composes these primitives so spacing,
 * type, and the black-and-white theme stay consistent in one place.
 */

export const eyebrowClass =
  "mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']";

export const h1Class =
  'mb-2.5 max-w-full text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink';

export const h2Class =
  'mb-2 text-balance break-words text-[1.15rem] font-bold leading-snug tracking-[-0.015em] text-ink';

export const ledeClass = 'mb-0 max-w-[62ch] text-[1.02rem] leading-relaxed text-muted';

export const pageWrapClass =
  'mx-auto w-full max-w-[1080px] flex-1 px-7 pb-[72px] pt-11 max-sm:px-[18px] max-sm:pt-8';

export const pageHeadingClass = 'mb-7 flex items-start justify-between gap-5 max-sm:flex-col';

export const cardClass =
  'rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export const btnPrimaryClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)] active:translate-y-0 disabled:cursor-wait disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none';

export const btnSecondaryClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-dark bg-white px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-px hover:border-ink hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';

export const btnQuietClass =
  'rounded-[10px] border border-line-dark bg-white px-4 py-2.5 text-[0.92rem] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50';

export const textLinkClass =
  'mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2';

export const dangerLinkClass =
  'border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2 disabled:cursor-not-allowed disabled:opacity-50';

export const fieldClass = 'grid gap-[7px] text-[0.87rem] font-semibold text-ink';

export const inputClass =
  'w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 aria-invalid:border-error aria-invalid:focus:ring-error/15 disabled:cursor-not-allowed disabled:opacity-60';

export const fieldErrorClass = 'text-[0.83rem] font-medium text-error';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={eyebrowClass}>{children}</p>;
}

export function AuthShell({
  eyebrow,
  title,
  sub,
  children,
  switchText,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children: ReactNode;
  switchText: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(var(--color-line-dark)_1px,transparent_1px)] bg-[size:22px_22px] bg-center px-5 py-10">
      <div className="w-full max-w-[440px] rounded-[18px] border border-line bg-white px-8 pb-7 pt-8 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_16px_40px_rgba(0,0,0,0.09)] max-sm:px-[22px] max-sm:py-[26px]">
        <span className="mb-[22px] inline-flex items-center gap-2.5 text-[0.95rem] font-extrabold tracking-[-0.02em] text-ink">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-[9px] bg-ink text-[0.95rem] font-extrabold text-white"
          >
            T
          </span>
          Testopia
        </span>
        <p className={eyebrowClass}>{eyebrow}</p>
        <h1 className="mb-1.5 text-balance text-[1.55rem] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
          {title}
        </h1>
        <p className="mb-0 text-[0.94rem] text-muted">{sub}</p>
        {children}
        <p className="mb-0 mt-[22px] border-t border-line bg-transparent pt-[18px] text-center text-[0.9rem] text-muted">
          {switchText}
        </p>
      </div>
    </main>
  );
}
