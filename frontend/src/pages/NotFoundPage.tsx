import { Link } from 'react-router-dom';

import { TestLayout } from '../components/TestLayout.js';

export function NotFoundPage() {
  return (
    <TestLayout>
      <p className="eyebrow">Not found</p>
      <h1>Page not found</h1>
      <p className="lede">The page you are looking for does not exist.</p>
      <div className="attempt-actions">
        <Link to="/tests" className="button">
          Back to browse
        </Link>
        <Link to="/login" className="text-link">
          Log in
        </Link>
      </div>
    </TestLayout>
  );
}
