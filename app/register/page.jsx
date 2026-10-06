'use client';

import { useState } from 'react';

export default function RegisterPage() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível enviar o cadastro.');
      setMessage(body.message || 'Cadastro concluído. Entre usando seu username e senha.');
      formElement.reset();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark"><span className="simple-icon">⌁</span></span><span>atlas<span className="brand-dot">.</span></span></div>
    <section className="login-card">
      <p className="eyebrow">NOVO ALUNO</p>
      <h1>Criar conta</h1>
      <p className="login-copy">Crie sua conta para acessar as fichas da academia.</p>
      <form onSubmit={handleSubmit}>
        <label>Nome completo<input name="name" required minLength="2" maxLength="120" autoComplete="name" /></label>
        <label>Nome de usuário<input name="username" required minLength="3" maxLength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]" title="Use de 3 a 30 letras, números, hífens ou sublinhados, sem espaços." autoComplete="username" /></label>
        <label>Tipo de usuário<select name="role" defaultValue="student"><option value="student">Aluno</option></select></label>
        <label>Telefone (opcional)<input name="phone" type="tel" maxLength="40" autoComplete="tel" /></label>
        <label>Objetivo (opcional)<input name="goal" maxLength="240" /></label>
        <label>Senha<input name="password" type="password" required minLength="12" maxLength="72" autoComplete="new-password" /></label>
        <label>Confirmar senha<input name="confirmPassword" type="password" required minLength="12" maxLength="72" autoComplete="new-password" /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        {message && <p className="profile-status" role="status">{message}</p>}
        <button className="primary-button" disabled={loading}>{loading ? 'Enviando...' : 'Solicitar cadastro'}</button>
      </form>
      <div className="login-links"><a href="/login">Voltar ao login</a></div>
    </section>
    <p className="login-footer">Atlas Training · Gestão inteligente de treinos</p>
  </main>;
}
