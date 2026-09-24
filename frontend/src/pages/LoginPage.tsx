import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';
import { AuthShell } from '../components/ui.js';

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in to Testopia"
      sub="Pick up where you left off — your tests are waiting."
      switchText={
        <>
          Need an account?{' '}
          <Link
            to="/register"
            className="font-bold text-ink underline-offset-[3px] hover:underline"
          >
            Register
          </Link>
        </>
      }
    >
      <AuthForm mode="login" onSuccess={() => navigate('/dashboard', { replace: true })} />
    </AuthShell>
  );
}
