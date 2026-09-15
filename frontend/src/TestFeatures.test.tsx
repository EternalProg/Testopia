import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TestEditorPage } from './pages/TestEditorPage.js';
import { TestListPage } from './pages/TestListPage.js';
import { server } from './test/server.js';

const test = {
  id: 1,
  title: 'Algebra basics',
  description: 'A short test',
  authorId: 1,
  isPublished: false,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const question = {
  id: 2,
  testId: 1,
  text: 'What is 2 + 2?',
  type: 'single_choice' as const,
  orderIndex: 0,
  options: [
    { id: 3, questionId: 2, text: '4', isCorrect: true },
    { id: 4, questionId: 2, text: '5', isCorrect: false },
  ],
};

describe('test frontend', () => {
  it('loads the published test list', async () => {
    server.use(http.get('/api/v1/tests', () => HttpResponse.json([test])));
    render(<TestListPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading tests');
    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
  });

  it('creates a test from the authoring form', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    server.use(
      http.post('/api/v1/tests', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ test, questions: [] }, { status: 201 });
      }),
    );
    render(<TestEditorPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    await user.type(screen.getByLabelText('Title'), 'Algebra basics');
    await user.click(screen.getByRole('button', { name: 'Save test details' }));
    await waitFor(() => expect(payload).toMatchObject({ title: 'Algebra basics' }));
    expect(await screen.findByRole('heading', { name: 'Questions' })).toBeInTheDocument();
  });

  it('renders and edits an existing question', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [question] })),
      http.patch('/api/v1/tests/1/questions/2', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ ...question, text: 'Updated question' });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const input = await screen.findByDisplayValue('What is 2 + 2?');
    await user.clear(input);
    await user.type(input, 'Updated question');
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() => expect(payload).toMatchObject({ text: 'Updated question' }));
  });
});
