import { Link } from 'react-router-dom';

import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, btnPrimaryClass, h1Class, ledeClass, textLinkClass } from '../components/ui.js';

export function NotFoundPage() {
  return (
    <TestLayout>
      <Eyebrow>Не знайдено</Eyebrow>
      <h1 className={h1Class}>Сторінку не знайдено</h1>
      <p className={ledeClass}>Сторінка, яку ви шукаєте, не існує.</p>
      <div className="my-7 flex flex-wrap items-center gap-3">
        <Link to="/tests" className={btnPrimaryClass}>
          Назад до огляду
        </Link>
        <Link to="/login" className={`${textLinkClass} mt-0`}>
          Увійти
        </Link>
      </div>
    </TestLayout>
  );
}
