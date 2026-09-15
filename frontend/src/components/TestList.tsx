import { Link } from 'react-router-dom';

import type { TestListItem } from '../tests/types.js';

export function TestList({ tests, mine = false }: { tests: TestListItem[]; mine?: boolean }) {
  if (!tests.length) {
    return (
      <p className="empty-state">
        {mine ? 'You have not created any tests yet.' : 'No published tests yet.'}
      </p>
    );
  }
  return (
    <div className="test-list">
      {tests.map((test) => (
        <article className="test-card" key={test.id}>
          <div>
            <p className="eyebrow">{test.isPublished ? 'Published' : 'Draft'}</p>
            <h2>{test.title}</h2>
            {test.description && <p>{test.description}</p>}
          </div>
          <Link
            className="button button-secondary"
            to={mine ? `/tests/${test.id}/edit` : `/tests/${test.id}`}
          >
            {mine ? 'Edit test' : 'View test'}
          </Link>
        </article>
      ))}
    </div>
  );
}
