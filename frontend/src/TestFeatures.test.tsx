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
    expect(screen.getByRole('status')).toHaveTextContent('Завантаження тестів');
    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
  });

  it('saves category and difficulty with the test details', async () => {
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
    await user.type(screen.getByLabelText('Назва'), 'C++ basics');
    await user.selectOptions(screen.getByLabelText('Категорія'), 'cpp');
    await user.selectOptions(screen.getByLabelText('Складність'), 'medium');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await waitFor(() =>
      expect(payload).toMatchObject({ title: 'C++ basics', category: 'cpp', difficulty: 'medium' }),
    );
    expect(await screen.findByRole('heading', { name: 'Питання' })).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Назва'), 'Algebra basics');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await waitFor(() => expect(payload).toMatchObject({ title: 'Algebra basics' }));
    expect(await screen.findByRole('heading', { name: 'Питання' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Зберегти питання' }));
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
    await screen.findByRole('heading', { name: 'Питання' });
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    const forms = screen.getAllByLabelText('Тип');
    await user.selectOptions(forms[forms.length - 1]!, 'true_false');
    const questionInputs = screen.getAllByLabelText('Текст питання');
    await user.type(questionInputs[questionInputs.length - 1]!, 'The statement is true.');
    const saveButtons = screen.getAllByRole('button', { name: 'Зберегти питання' });
    await user.click(saveButtons[saveButtons.length - 1]!);
    await waitFor(() =>
      expect(payload).toMatchObject({
        type: 'true_false',
        options: [
          { text: 'Правда', isCorrect: true },
          { text: 'Неправда', isCorrect: false },
        ],
      }),
    );
  });

  it('keeps radio choices isolated across new questions', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/tests', () => HttpResponse.json({ test, questions: [] }, { status: 201 })),
    );
    render(<TestEditorPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    await user.type(screen.getByLabelText('Назва'), 'Radio groups');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await screen.findByRole('heading', { name: 'Питання' });
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    await user.click(radios[3]!);
    expect(radios[0]).toBeChecked();
    expect(radios[3]).toBeChecked();
  });

  it('renumbers questions before assigning a new order index after deletion', async () => {
    const user = userEvent.setup();
    let renumberPayload: unknown;
    let newQuestionPayload: unknown;
    const questions = [0, 1, 2].map((orderIndex) => ({
      ...question,
      id: orderIndex + 2,
      orderIndex,
      text: `Question ${orderIndex + 1}`,
    }));
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions })),
      http.delete('/api/v1/tests/1/questions/3', () => new HttpResponse(null, { status: 204 })),
      http.patch('/api/v1/tests/1/questions/4', async ({ request }) => {
        renumberPayload = await request.json();
        return HttpResponse.json({ ...questions[2], orderIndex: 1 });
      }),
      http.post('/api/v1/tests/1/questions', async ({ request }) => {
        newQuestionPayload = await request.json();
        return HttpResponse.json({ ...questions[2], id: 5, orderIndex: 2 });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання 3' });
    await user.click(screen.getAllByRole('button', { name: 'Видалити' })[1]!);
    await waitFor(() => expect(renumberPayload).toMatchObject({ orderIndex: 1 }));

    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    const questionInputs = screen.getAllByLabelText('Текст питання');
    await user.type(questionInputs[questionInputs.length - 1]!, 'New question');
    const optionInputs = screen.getAllByRole('textbox', { name: /Варіант/ });
    await user.type(optionInputs[optionInputs.length - 2]!, 'A');
    await user.type(optionInputs[optionInputs.length - 1]!, 'B');
    const saveButtons = screen.getAllByRole('button', { name: 'Зберегти питання' });
    await user.click(saveButtons[saveButtons.length - 1]!);
    await waitFor(() => expect(newQuestionPayload).toMatchObject({ orderIndex: 2 }));
  });

  it('disables save while a question create is in flight', async () => {
    const user = userEvent.setup();
    let resolvePost!: (value: unknown) => void;
    let postCount = 0;
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [] })),
      http.post('/api/v1/tests/1/questions', async ({ request }) => {
        postCount += 1;
        const body = (await request.json()) as { text: string };
        await new Promise((resolve) => {
          resolvePost = resolve;
        });
        return HttpResponse.json({ ...question, id: 9, text: body.text }, { status: 201 });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання' });
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    const questionInputs = screen.getAllByLabelText('Текст питання');
    await user.type(questionInputs[questionInputs.length - 1]!, 'In-flight?');
    const optionInputs = screen.getAllByRole('textbox', { name: /Варіант/ });
    await user.type(optionInputs[optionInputs.length - 2]!, 'A');
    await user.type(optionInputs[optionInputs.length - 1]!, 'B');
    const saveButtons = screen.getAllByRole('button', { name: 'Зберегти питання' });
    await user.click(saveButtons[saveButtons.length - 1]!);
    expect(await screen.findByRole('button', { name: 'Збереження…' })).toBeDisabled();
    resolvePost(undefined);
    await waitFor(() => expect(postCount).toBe(1));
    expect(await screen.findByRole('heading', { name: 'Питання 1' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await waitFor(() =>
      expect(payload).toMatchObject({
        isPublished: true,
        shuffleQuestions: true,
        timeLimitMinutes: 30,
        showAnswersAfterCompletion: false,
      }),
    );
  });

  it('makes published questions read-only without blocking metadata edits', async () => {
    const user = userEvent.setup();
    let metadataPayload: unknown;
    const publishedQuestion = {
      ...question,
      options: question.options.map(({ id, questionId, text }) => ({ id, questionId, text })),
    };
    const publishedTest = { ...test, isPublished: true };
    server.use(
      http.get('/api/v1/tests/1', () =>
        HttpResponse.json({ test: publishedTest, questions: [publishedQuestion] }),
      ),
      http.patch('/api/v1/tests/1', async ({ request }) => {
        metadataPayload = await request.json();
        return HttpResponse.json({ test: publishedTest, questions: [publishedQuestion] });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання 1' });
    expect(screen.getByDisplayValue('4')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Зберегти питання' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати питання' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Зняти з публікації' })).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue('Algebra basics');
    await user.clear(titleInput);
    await user.type(titleInput, 'Published algebra');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await waitFor(() => expect(metadataPayload).toMatchObject({ title: 'Published algebra' }));
  });

  it('creates new questions of the type chosen in the add panel', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/tests', () => HttpResponse.json({ test, questions: [] }, { status: 201 })),
    );
    render(<TestEditorPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    await user.type(screen.getByLabelText('Назва'), 'Typed questions');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));
    await screen.findByRole('heading', { name: 'Питання' });
    await user.selectOptions(screen.getByLabelText('Додати нове питання'), 'true_false');
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    expect(await screen.findByDisplayValue('Правда')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Неправда')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Нове питання' })).toBeInTheDocument();
  });

  it('moves a saved question up with a collision-free reorder sequence', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    const first = { ...question, id: 2, orderIndex: 0, text: 'First question' };
    const second = { ...question, id: 3, orderIndex: 1, text: 'Second question' };
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [first, second] })),
      http.patch('/api/v1/tests/1/questions/:questionId', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(first);
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання 2' });
    await user.click(screen.getByRole('button', { name: 'Перемістити питання 2 вгору' }));
    await waitFor(() =>
      expect(patches).toEqual([{ orderIndex: 2 }, { orderIndex: 1 }, { orderIndex: 0 }]),
    );
    // The moved question now leads the list.
    const inputs = screen.getAllByLabelText('Текст питання');
    expect(inputs[0]).toHaveDisplayValue('Second question');
    expect(inputs[1]).toHaveDisplayValue('First question');
  });

  it('disables reordering while the test uses random order', async () => {
    server.use(
      http.get('/api/v1/tests/1', () =>
        HttpResponse.json({
          test: { ...test, shuffleQuestions: true },
          questions: [
            { ...question, id: 2, orderIndex: 0 },
            { ...question, id: 3, orderIndex: 1 },
          ],
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання 2' });
    expect(screen.getByRole('button', { name: 'Перемістити питання 1 вниз' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Перемістити питання 2 вгору' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('перемішується для кожної спроби');
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити тест.');
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
    await screen.findByRole('heading', { name: 'Питання 1' });
    await user.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Question delete failed');
    window.confirm = () => true;
    await user.click(screen.getByRole('button', { name: 'Видалити тест' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Test delete failed');
    expect(screen.getByRole('heading', { name: 'Редагувати тест' })).toBeInTheDocument();
  });

  it('discards an unsaved draft without calling the API', async () => {
    const user = userEvent.setup();
    let postCount = 0;
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [] })),
      http.post('/api/v1/tests/1/questions', () => {
        postCount += 1;
        return HttpResponse.json(question, { status: 201 });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання' });
    await user.click(screen.getByRole('button', { name: 'Додати питання' }));
    expect(await screen.findByRole('heading', { name: 'Нове питання' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('heading', { name: 'Нове питання' })).not.toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it('disables save while the question matches the saved version', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [question] })),
      http.patch('/api/v1/tests/1/questions/2', async ({ request }) => {
        const body = (await request.json()) as { text: string };
        return HttpResponse.json({ ...question, text: body.text });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Питання 1' });
    const savedButton = await screen.findByRole('button', { name: 'Збережено ✓' });
    expect(savedButton).toBeDisabled();

    const input = screen.getByDisplayValue('What is 2 + 2?');
    await user.clear(input);
    await user.type(input, 'What is 2 + 2 (edited)?');
    const saveButton = await screen.findByRole('button', { name: 'Зберегти питання' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    expect(await screen.findByRole('button', { name: 'Збережено ✓' })).toBeDisabled();
  });
});
