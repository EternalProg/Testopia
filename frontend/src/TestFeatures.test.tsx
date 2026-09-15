import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

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
  afterEach(() => cleanup());

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

  it('saves true/false questions with two labeled options', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [] })),
      http.post('/api/v1/tests/1/questions', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({
          ...question,
          type: 'true_false',
          text: 'The statement is true.',
          options: [
            { id: 5, questionId: 2, text: 'True', isCorrect: true },
            { id: 6, questionId: 2, text: 'False', isCorrect: false },
          ],
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Questions' });
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    const forms = screen.getAllByLabelText('Type');
    await user.selectOptions(forms[forms.length - 1]!, 'true_false');
    const questionInputs = screen.getAllByLabelText('Question text');
    await user.type(questionInputs[questionInputs.length - 1]!, 'The statement is true.');
    const saveButtons = screen.getAllByRole('button', { name: 'Save question' });
    await user.click(saveButtons[saveButtons.length - 1]!);
    await waitFor(() =>
      expect(payload).toMatchObject({
        type: 'true_false',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    );
  });

  it('preserves existing test metadata when saving details', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    const loadedTest = {
      ...test,
      isPublished: true,
      shuffleQuestions: true,
      timeLimitMinutes: 30,
      showAnswersAfterCompletion: false,
    };
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test: loadedTest, questions: [] })),
      http.patch('/api/v1/tests/1', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ test: loadedTest, questions: [] });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const titleInput = await screen.findByDisplayValue('Algebra basics');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated algebra basics');
    await user.click(screen.getByRole('button', { name: 'Save test details' }));
    await waitFor(() =>
      expect(payload).toMatchObject({
        isPublished: true,
        shuffleQuestions: true,
        timeLimitMinutes: 30,
        showAnswersAfterCompletion: false,
      }),
    );
  });

  it('shows load and deletion failures without leaving the editor', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/tests/1', () =>
        HttpResponse.json({ message: 'Unavailable' }, { status: 500 }),
      ),
    );
    const firstRender = render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Test could not be loaded.');
    firstRender.unmount();

    server.resetHandlers();
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [question] })),
      http.delete('/api/v1/tests/1/questions/2', () =>
        HttpResponse.json({ message: 'Question delete failed' }, { status: 500 }),
      ),
      http.delete('/api/v1/tests/1', () =>
        HttpResponse.json({ message: 'Test delete failed' }, { status: 500 }),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Question 1' });
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Question delete failed');
    window.confirm = () => true;
    await user.click(screen.getByRole('button', { name: 'Delete test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Test delete failed');
    expect(screen.getByRole('heading', { name: 'Edit test' })).toBeInTheDocument();
  });
});
