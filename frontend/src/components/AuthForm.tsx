import { useState } from 'react';
import type { LoginInput, RegisterInput } from '@testopia/shared';
import { loginSchema, registerSchema } from '@testopia/shared';

import { useAuthStore } from '../auth/store.js';
import { btnPrimaryClass, fieldClass, fieldErrorClass, inputClass } from './ui.js';

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
    <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
      {mode === 'register' && (
        <label className={fieldClass}>
          Username
          <input
            name="username"
            autoComplete="username"
            placeholder="e.g. ada_lovelace"
            value={values.username}
            onChange={(event) => update('username', event.target.value)}
            aria-invalid={Boolean(errors.username)}
            aria-describedby={describedBy('username')}
            className={inputClass}
          />
          {errors.username && (
            <span className={fieldErrorClass} id="username-error" role="alert">
              {errors.username}
            </span>
          )}
        </label>
      )}
      <label className={fieldClass}>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy('email')}
          className={inputClass}
        />
        {errors.email && (
          <span className={fieldErrorClass} id="email-error" role="alert">
            {errors.email}
          </span>
        )}
      </label>
      <label className={fieldClass}>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="••••••••"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy('password')}
          className={inputClass}
        />
        {errors.password && (
          <span className={fieldErrorClass} id="password-error" role="alert">
            {errors.password}
          </span>
        )}
      </label>
      {serverError && (
        <p className="error-message m-0" id="form-error" role="alert">
          {serverError}
        </p>
      )}
      <button className={`${btnPrimaryClass} w-full`} type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
