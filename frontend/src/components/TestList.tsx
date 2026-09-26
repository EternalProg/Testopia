import { Link } from 'react-router-dom';

import type { TestListItem } from '../tests/types.js';
import { categoryLabels, difficultyLabels } from '../tests/meta.js';
import { EmptyState } from './EmptyState.js';
import { btnSecondaryClass } from './ui.js';

export function TestList({ tests, mine = false }: { tests: TestListItem[]; mine?: boolean }) {
  if (!tests.length) {
    return (
      <EmptyState text={mine ? 'You have not created any tests yet.' : 'No published tests yet.'} />
    );
  }
  return (
    <div className="mt-7 grid gap-3.5">
      {tests.map((test) => {
        const closed =
          test.availableUntil !== null &&
          test.availableUntil !== undefined &&
          Date.now() > new Date(test.availableUntil).getTime();
        return (
          <article
            key={test.id}
            className="flex items-center justify-between gap-5 rounded-2xl border border-line bg-card px-[22px] py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-px hover:border-line-dark hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] max-sm:flex-col max-sm:items-start"
          >
            <div>
              <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.09em] text-muted before:inline-block before:h-[7px] before:w-[7px] before:rounded-full before:content-[''] ${
                    test.isPublished ? 'before:bg-ink' : 'before:bg-[#a3a3a3]'
                  }`}
                >
                  {test.isPublished ? 'Published' : 'Draft'}
                </span>
                {closed && (
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.09em] text-muted before:inline-block before:h-[7px] before:w-[7px] before:rounded-full before:bg-[#900] before:content-['']">
                    Closed
                  </span>
                )}
                {test.category !== null && test.category !== undefined && (
                  <span className="inline-flex items-center rounded-full border border-line-dark bg-wash px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.09em] text-ink">
                    {categoryLabels[test.category] ?? test.category}
                  </span>
                )}
                {test.difficulty !== null && test.difficulty !== undefined && (
                  <span className="inline-flex items-center rounded-full border border-line-dark bg-wash px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.09em] text-ink">
                    {difficultyLabels[test.difficulty] ?? test.difficulty}
                  </span>
                )}
              </p>
              <h2 className="mb-1 text-[1.08rem] font-bold leading-snug tracking-[-0.015em] text-ink">
                {test.title}
              </h2>
              {test.description && (
                <p className="mb-0 line-clamp-2 text-[0.92rem] text-muted">{test.description}</p>
              )}
            </div>
            <Link
              className={btnSecondaryClass}
              to={mine ? `/tests/${test.id}/edit` : `/tests/${test.id}`}
            >
              {mine ? 'Edit test' : 'View test'}
            </Link>
          </article>
        );
      })}
    </div>
  );
}
