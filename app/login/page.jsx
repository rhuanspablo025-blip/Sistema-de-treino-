'use client';

import { useState } from 'react';

const Icon = ({ children }) => <span className="simple-icon">{children}</span>;
const Activity = () => <Icon>⌁</Icon>;
const ArrowRight = () => <Icon>›</Icon>;
const LockKeyhole = () => <Icon>◆</Icon>;
const Mail = () => <Icon>□</Icon>;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username')).trim().toLowerCase();
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

  return <main className="login-page"><div className="login-brand"><span className="brand-mark"><Activity size={20} /></span><span>atlas<span className="brand-dot">.</span></span></div><section className="login-card"><p className="eyebrow">ÁREA RESTRITA</p><h1>Bem-vindo de volta</h1><p className="login-copy">Entre para acessar as fichas de treino da sua academia.</p><form onSubmit={handleSubmit}><label><span>Usuário ou e-mail</span><div className="login-input"><Mail size={16} /><input name="username" type="text" required autoComplete="username" placeholder="seu e-mail" /></div></label><label><span>Senha</span><div className="login-input"><LockKeyhole size={16} /><input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha" /></div></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}<ArrowRight size={16} /></button></form></section><p className="login-footer">Atlas Training · Gestão inteligente de treinos · <a href="/privacy">Privacidade</a></p></main>;
}