import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm.js';

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <main className="page-content">
      <h1>Create your Testopia account</h1>
      <AuthForm mode="register" onSuccess={() => navigate('/dashboard', { replace: true })} />
      <p>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
