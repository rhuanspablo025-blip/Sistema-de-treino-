'use client';

import { useState } from 'react';

const Icon = ({ children }) => <span className="simple-icon">{children}</span>;
const Activity = () => <Icon>⌁</Icon>;
const ArrowRight = () => <Icon>›</Icon>;
const LockKeyhole = () => <Icon>◆</Icon>;
const UserIcon = () => <Icon>○</Icon>;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username')).trim();
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: form.get('password') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível entrar.');
      window.location.href = '/';
    } catch (loginError) {
      setError(loginError.message);
      setLoading(false);
    }
  }

  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark"><Activity /></span><span>atlas<span className="brand-dot">.</span></span></div>
    <section className="login-card">
      <p className="eyebrow">ÁREA RESTRITA</p>
      <h1>Bem-vindo de volta</h1>
      <p className="login-copy">Entre para acessar as fichas de treino da sua academia.</p>
      <form onSubmit={handleSubmit}>
        <label><span>Nome de usuário</span><div className="login-input"><UserIcon /><input name="username" type="text" required minLength="3" maxLength="32" autoComplete="username" placeholder="seu.usuario" /></div></label>
        <label><span>Senha</span><div className="login-input"><LockKeyhole /><input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha" /></div></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}<ArrowRight /></button>
      </form>
      <div className="login-links"><a href="/forgot-password">Preciso redefinir minha senha</a><a href="/register">Criar conta de aluno</a></div>
    </section>
    <p className="login-footer">Atlas Training · Gestão inteligente de treinos · <a href="/privacy">Privacidade</a></p>
  </main>;
}
