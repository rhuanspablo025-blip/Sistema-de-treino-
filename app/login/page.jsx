'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

const Icon = ({ children }) => <span className="simple-icon">{children}</span>;
const Activity = () => <Icon>⌁</Icon>;
const ArrowRight = () => <Icon>›</Icon>;
const LockKeyhole = () => <Icon>◆</Icon>;
const Mail = () => <Icon>□</Icon>;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    if (!configured) {
      setError('Autenticação indisponível: configure as variáveis do Supabase.');
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const username = String(form.get('username')).trim().toLowerCase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: username.includes('@') ? username : `${username}@atlas.training`,
      password: form.get('password'),
    });
    if (signInError) {
      setError('E-mail ou senha inválidos, ou usuário desativado.');
      setLoading(false);
      return;
    }
    window.location.href = '/';
  }

  return <main className="login-page"><div className="login-brand"><span className="brand-mark"><Activity size={20} /></span><span>atlas<span className="brand-dot">.</span></span></div><section className="login-card"><p className="eyebrow">ÁREA RESTRITA</p><h1>Bem-vindo de volta</h1><p className="login-copy">Entre para acessar as fichas de treino da sua academia.</p><form onSubmit={handleSubmit}><label><span>Usuário ou e-mail</span><div className="login-input"><Mail size={16} /><input name="username" type="text" required autoComplete="username" placeholder="seu e-mail" /></div></label><label><span>Senha</span><div className="login-input"><LockKeyhole size={16} /><input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha" /></div></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" disabled={loading || !configured}>{loading ? 'Entrando...' : 'Entrar'}<ArrowRight size={16} /></button></form>{!configured && <p className="demo-hint">Configure o Supabase para habilitar o acesso.</p>}</section><p className="login-footer">Atlas Training · Gestão inteligente de treinos</p></main>;
}