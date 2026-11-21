'use client';

import { useEffect, useState } from 'react';
import '../personal/personal.css';

export default function ConvitePage() {
  const [credential, setCredential] = useState('');
  const [entry, setEntry] = useState(null);
  const [status, setStatus] = useState('Carregando convite…');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('credential') || '';
    setCredential(value);
    if (!value) { setStatus('Informe o código recebido do Personal.'); return; }
    fetch(`/api/identity/invites?credential=${encodeURIComponent(value)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setEntry(data); setStatus(''); })
      .catch((error) => setStatus(error.message || 'Convite indisponível.'));
  }, []);
  async function confirm() {
    setBusy(true); setStatus('');
    try {
      const response = await fetch('/api/identity/invites/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
      const data = await response.json();
      if (response.status === 401) { setStatus('Entre na sua conta de aluno para confirmar este vínculo.'); return; }
      if (!response.ok) throw new Error(data.error || 'Não foi possível confirmar o vínculo.');
      setEntry((current) => ({ ...current, status: 'ACCEPTED' }));
      setStatus('Vínculo confirmado. Seu Personal agora pode acompanhar suas fichas autorizadas.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  async function reject() {
    if (!window.confirm('Deseja realmente rejeitar este convite?')) return;
    setBusy(true); setStatus('');
    try {
      const response = await fetch('/api/identity/invites/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
      const data = await response.json();
      if (response.status === 401) { setStatus('Entre na sua conta de aluno para rejeitar este convite.'); return; }
      if (!response.ok) throw new Error(data.error || 'Não foi possível rejeitar o convite.');
      setEntry((current) => ({ ...current, status: 'REJECTED' }));
      setStatus(data.repeated ? 'Este convite já havia sido rejeitado.' : 'Convite rejeitado.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  const returnTo = `/convite?credential=${encodeURIComponent(credential)}`;
  const next = `?next=${encodeURIComponent(returnTo)}`;
  return <main className="personal-shell invite-page"><header className="personal-top"><a href="/" className="personal-brand"><span className="personal-mark">A</span><span>AtlasFit <small>CONVITES</small></span></a></header><section className="invite-landing"><p className="personal-kicker">CONEXÃO PROFISSIONAL / USO ÚNICO</p><h1>Seu treino começa com uma escolha.</h1><p>Confira quem enviou o convite. O relacionamento só é ativado após a sua confirmação.</p>{!credential && <form onSubmit={(event) => { event.preventDefault(); const code = event.currentTarget.elements.code.value.trim(); window.location.href = `/convite?credential=${encodeURIComponent(code)}`; }}><label className="personal-field">Código do convite<input name="code" required autoComplete="off" placeholder="Cole o código recebido" /></label><button className="personal-primary">Consultar convite</button></form>}{entry && <div className="invite-summary"><small>CONVITE DE</small><strong>{entry.personalName}</strong><span>Expira em {new Date(entry.expiresAt).toLocaleString('pt-BR')}</span><span>Estado: {entry.status === 'PENDING' ? 'Aguardando sua confirmação' : entry.status === 'REJECTED' ? 'Rejeitado' : entry.status}</span>{entry.status === 'PENDING' && <><button className="personal-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirmando…' : 'Confirmar vínculo com este Personal'}</button><button className="personal-copy" disabled={busy} onClick={reject}>{busy ? 'Processando…' : 'Rejeitar convite'}</button></>}</div>}{status && <p className="personal-alert" role="status">{status}</p>}{entry?.status === 'PENDING' && <div className="invite-auth-links"><a href={`/login${next}`}>Já tenho conta · Entrar</a><a href={`/register${next}`}>Sou novo · Criar conta</a></div>}{entry?.status === 'ACCEPTED' && <a className="personal-copy" href="/aluno/fichas">Ir para meus treinos →</a>}</section></main>;
}
