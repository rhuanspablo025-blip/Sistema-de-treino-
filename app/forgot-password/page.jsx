'use client';

import { useEffect, useState } from 'react';

export default function ForgotPasswordPage() {
  const [token, setToken] = useState('');
  const [modeLoaded, setModeLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
    setModeLoaded(true);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const endpoint = token ? '/api/auth/password-reset/complete' : '/api/auth/password-reset/request';
    const payload = token
      ? { token, password: form.get('password'), confirmPassword: form.get('confirmPassword') }
      : { email: form.get('email') };
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a solicitação.');
      setMessage(body.message || 'Solicitação concluída.');
      if (token) {
        setToken('');
        window.history.replaceState({}, '', '/forgot-password');
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  if (!modeLoaded) return <main className="login-page"><p className="login-copy">Carregando...</p></main>;

  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark"><span className="simple-icon">⌁</span></span><span>atlas<span className="brand-dot">.</span></span></div>
    <section className="login-card">
      <p className="eyebrow">{token ? 'NOVA SENHA' : 'RECUPERAÇÃO DE ACESSO'}</p>
      <h1>{token ? 'Redefinir senha' : 'Esqueceu a senha?'}</h1>
      <p className="login-copy">{token ? 'Escolha uma nova senha para sua conta.' : 'Enviaremos um link de redefinição se o e-mail estiver cadastrado.'}</p>
      <form onSubmit={handleSubmit}>
        {!token ? <label>E-mail<input name="email" type="email" required maxLength="254" autoComplete="email" /></label> : <>
          <label>Nova senha<input name="password" type="password" required minLength="12" maxLength="72" autoComplete="new-password" /></label>
          <label>Confirmar nova senha<input name="confirmPassword" type="password" required minLength="12" maxLength="72" autoComplete="new-password" /></label>
        </>}
        {error && <p className="login-error" role="alert">{error}</p>}
        {message && <p className="profile-status" role="status">{message}</p>}
        <button className="primary-button" disabled={loading}>{loading ? 'Aguarde...' : token ? 'Salvar nova senha' : 'Enviar link'}</button>
      </form>
      <div className="login-links"><a href="/login">Voltar ao login</a></div>
    </section>
    <p className="login-footer">Atlas Training · Gestão inteligente de treinos</p>
  </main>;
}
