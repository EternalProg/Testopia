import { useState } from 'react';
import type { LoginInput, RegisterInput } from '@testopia/shared';
import { loginSchema, registerSchema } from '@testopia/shared';

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

  function describedBy(field: keyof FormValues): string | undefined {
    const ids = [];
    if (errors[field]) ids.push(`${field}-error`);
    if (serverError) ids.push('form-error');
    return ids.length > 0 ? ids.join(' ') : undefined;
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
            aria-describedby={describedBy('username')}
          />
          {errors.username && (
            <span id="username-error" role="alert">
              {errors.username}
            </span>
          )}
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
          aria-describedby={describedBy('email')}
        />
        {errors.email && (
          <span id="email-error" role="alert">
            {errors.email}
          </span>
        )}
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy('password')}
        />
        {errors.password && (
          <span id="password-error" role="alert">
            {errors.password}
          </span>
        )}
      </label>
      {serverError && (
        <p id="form-error" role="alert">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
