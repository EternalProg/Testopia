import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';
import { AuthShell } from '../components/ui.js';

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <AuthShell
      eyebrow="Початок роботи"
      title="Створіть акаунт Testopia"
      sub="Створюйте тести, проходьте спроби та відстежуйте результати в одному місці."
      switchText={
        <>
          Вже зареєстровані?{' '}
          <Link to="/login" className="font-bold text-ink underline-offset-[3px] hover:underline">
            Увійти
          </Link>
        </>
      }
    >
      <AuthForm mode="register" onSuccess={() => navigate('/dashboard', { replace: true })} />
    </AuthShell>
  );
}
