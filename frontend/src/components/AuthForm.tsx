import { useState } from 'react';
import type { LoginInput, RegisterInput } from '@practice-works/shared';
import { loginSchema, registerSchema } from '@practice-works/shared';

import { useAuthStore } from '../auth/store.js';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode: AuthMode;
  onSuccess: () => void;
}

type FormValues = LoginInput & Partial<Pick<RegisterInput, 'username'>>;

export function AuthForm({ mode, onSuccess }: AuthFormProps) {
  const authenticate = useAuthStore((state) => (mode === 'login' ? state.login : state.register));
  const status = useAuthStore((state) => state.status);
  const serverError = useAuthStore((state) => state.error);
  const [values, setValues] = useState<FormValues>({ email: '', password: '', username: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result =
      mode === 'login' ? loginSchema.safeParse(values) : registerSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    try {
      await authenticate(result.data as LoginInput & RegisterInput);
      onSuccess();
    } catch {
      // The store exposes the server error for the form; no token is rendered.
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {mode === 'register' && (
        <label>
          Username
          <input
            name="username"
            value={values.username}
            onChange={(event) => update('username', event.target.value)}
            aria-invalid={Boolean(errors.username)}
          />
          {errors.username && <span role="alert">{errors.username}</span>}
        </label>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email && <span role="alert">{errors.email}</span>}
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          aria-invalid={Boolean(errors.password)}
        />
        {errors.password && <span role="alert">{errors.password}</span>}
      </label>
      {serverError && <p role="alert">{serverError}</p>}
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
