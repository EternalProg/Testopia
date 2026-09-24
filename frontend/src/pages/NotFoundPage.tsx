import { Link } from 'react-router-dom';

import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, btnPrimaryClass, h1Class, ledeClass, textLinkClass } from '../components/ui.js';

export function NotFoundPage() {
  return (
    <TestLayout>
      <Eyebrow>Not found</Eyebrow>
      <h1 className={h1Class}>Page not found</h1>
      <p className={ledeClass}>The page you are looking for does not exist.</p>
      <div className="my-7 flex flex-wrap items-center gap-3">
        <Link to="/tests" className={btnPrimaryClass}>
          Back to browse
        </Link>
        <Link to="/login" className={`${textLinkClass} mt-0`}>
          Log in
        </Link>
      </div>
    </TestLayout>
  );
}
