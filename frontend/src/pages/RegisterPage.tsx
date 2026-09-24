import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';
import { AuthShell } from '../components/ui.js';

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your Testopia account"
      sub="Author tests, run attempts, and track results in one place."
      switchText={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-bold text-ink underline-offset-[3px] hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <AuthForm mode="register" onSuccess={() => navigate('/dashboard', { replace: true })} />
    </AuthShell>
  );
}
