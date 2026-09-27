import { Link, NavLink, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../auth/store.js';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-[0.9rem] font-medium leading-tight no-underline transition-colors duration-150 ${
    isActive ? 'bg-ink text-white' : 'text-muted hover:bg-wash hover:text-ink hover:no-underline'
  }`;

export function TestLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logout();
    } catch {
      // The auth store clears local state even when the server is unavailable.
    } finally {
      navigate('/login', { replace: true });
    }
  }

  function skipToContent() {
    // Fragment navigation does not move focus in every browser (notably
    // Safari), so focus the target explicitly while keeping the hash.
    document.getElementById('main-content')?.focus();
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* When a modal dialog is open, the entire background (skip link,
          header, and main content) is inert so focus and assistive
          technology cannot escape the dialog behind its aria-modal claim. */}
      <div inert={modal !== undefined} className="flex min-h-screen flex-1 flex-col">
        <a
          className="absolute -left-[9999px] top-0 z-[100] rounded-br-[10px] bg-ink px-4 py-2.5 font-bold text-white focus:left-3 focus:top-3 focus:text-white"
          href="#main-content"
          onClick={skipToContent}
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-5 px-7 py-3.5 max-sm:flex-col max-sm:items-start max-sm:gap-2.5">
            <Link
              to={user ? '/dashboard' : '/tests'}
              className="inline-flex items-center gap-2.5 text-[1.05rem] font-extrabold tracking-[-0.02em] text-ink no-underline"
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[0.85rem] font-extrabold text-white"
              >
                T
              </span>
              Testopia
            </Link>
            <nav aria-label="Main navigation" className="flex items-center gap-1 max-sm:flex-wrap">
              {user ? (
                <NavLink to="/dashboard" className={navLinkClass}>
                  Dashboard
                </NavLink>
              ) : (
                <NavLink to="/tests" className={navLinkClass}>
                  Browse
                </NavLink>
              )}
              {user?.role === 'admin' && (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              )}
              {user ? (
                <>
                  <span className="inline-flex items-center gap-2 pl-1" title={user.username}>
                    <span
                      aria-hidden="true"
                      className="grid h-[30px] w-[30px] place-items-center rounded-full bg-ink text-[0.78rem] font-extrabold uppercase text-white"
                    >
                      {user.username.slice(0, 1)}
                    </span>
                    <span className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-[0.88rem] font-semibold text-ink">
                      {user.username}
                    </span>
                  </span>
                  <button
                    className="rounded-lg border-0 bg-transparent px-3 py-2 text-[0.9rem] font-medium text-muted underline underline-offset-[3px] transition-colors duration-150 hover:bg-wash hover:text-ink"
                    type="button"
                    onClick={() => void signOut()}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link to="/login" className={navLinkClass({ isActive: false })}>
                  Log in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1080px] flex-1 px-7 pb-[72px] pt-11 max-sm:px-[18px] max-sm:pt-8"
        >
          {children}
        </main>
        <footer className="mt-auto border-t border-line">
          <div className="mx-auto flex w-full max-w-[1080px] flex-wrap justify-between gap-3 px-7 py-5 text-[0.82rem] text-faint">
            <span>Testopia — minimal testing platform</span>
            <span>Black &amp; white by design</span>
          </div>
        </footer>
      </div>
      {modal}
    </div>
  );
}
