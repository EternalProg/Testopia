import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';
import { AuthShell } from '../components/ui.js';

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <AuthShell
      eyebrow="З поверненням"
      title="Вхід до Testopia"
      sub="Продовжуйте з того місця, де зупинилися, — ваші тести чекають."
      switchText={
        <>
          Немає акаунту?{' '}
          <Link
            to="/register"
            className="font-bold text-ink underline-offset-[3px] hover:underline"
          >
            Зареєструватися
          </Link>
        </>
      }
    >
      <AuthForm mode="login" onSuccess={() => navigate('/dashboard', { replace: true })} />
    </AuthShell>
  );
}
