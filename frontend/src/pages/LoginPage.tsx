import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <main className="page-content">
      <h1>Log in to Practice Works</h1>
      <AuthForm mode="login" onSuccess={() => navigate('/dashboard', { replace: true })} />
      <p>
        Need an account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
