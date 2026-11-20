'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './personal.css';

async function api(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Operação indisponível.'); return body; }
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const statusLabel = { ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', TERMINATED: 'Encerrado', PENDING: 'Pendente', ACCEPTED: 'Aceito', CANCELLED: 'Cancelado', EXPIRED: 'Expirado', BLOCKED: 'Bloqueado' };
const labelStatus = (value) => statusLabel[value] || value;

export default function PersonalPage() {
  const drawerRef = useRef(null);
  const [data, setData] = useState(null), [invites, setInvites] = useState([]), [page, setPage] = useState(1);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [view, setView] = useState('alunos'), [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(''), [issued, setIssued] = useState(null), [qr, setQr] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [relationships, pending] = await Promise.all([api(`/api/identity/relationships?page=${page}&q=${encodeURIComponent(query)}&scope=${view === 'historico' ? 'all' : 'current'}`), api('/api/identity/invites')]);
      setData(relationships); setInvites(pending.invites || []); setPendingCount(pending.pending || 0); setError('');
    } catch (failure) { setError(failure.message); }
  }, [page, query, view]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const onEscape = (event) => { if (event.key === 'Escape') { setSelected(null); setShowInvite(false); } }; window.addEventListener('keydown', onEscape); return () => window.removeEventListener('keydown', onEscape); }, []);
  useEffect(() => { if (!selected && !showInvite) return undefined; const previous = document.activeElement; drawerRef.current?.focus(); return () => previous?.focus?.(); }, [selected, showInvite]);

  async function createInvite() {
    setBusy(true); setError('');
    try {
      const result = await api('/api/identity/invites', json('POST', { email: inviteEmail || undefined }));
      const link = `${window.location.origin}/convite?credential=${encodeURIComponent(result.token)}`;
      setIssued({ ...result, link }); setQr(await QRCode.toDataURL(link, { width: 280, margin: 2, color: { dark: '#171717', light: '#ffffff' } }));
      setMessage(result.delivery?.status === 'SENT' ? 'Convite enviado por e-mail. O código e o link também estão disponíveis.' : result.delivery?.status === 'NOT_REQUESTED' ? 'Convite criado. Compartilhe o código ou o link com o aluno.' : 'Convite criado. E-mail não enviado; compartilhe o código ou o link.'); await load();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function change(id, action) {
    setBusy(true); setError('');
    try { await api('/api/identity/relationships', json('PATCH', { id, action })); setSelected(null); setMessage('Vínculo atualizado.'); await load(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function cancel(id) {
    setBusy(true); setError('');
    try { await api(`/api/identity/invites?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); setMessage('Convite cancelado.'); await load(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const rows = data?.relationships || [];
  const capacity = data?.capacity;

  return <main className="personal-shell">
    <header className="personal-top"><a href="/" className="personal-brand"><span className="personal-mark">A</span><span>AtlasFit <small>PROFESSIONAL</small></span></a><nav aria-label="Navegação da central"><button className={view === 'alunos' ? 'active' : ''} onClick={() => setView('alunos')}>Alunos</button><button className={view === 'convites' ? 'active' : ''} onClick={() => setView('convites')}>Convites</button><button className={view === 'historico' ? 'active' : ''} onClick={() => { setPage(1); setView('historico'); }}>Histórico</button><a href="/">Fichas de treino ↗</a></nav><span className="personal-top-meta">CENTRAL DO PERSONAL</span></header>
    <div className="personal-main"><div className="personal-heading"><div><p className="personal-kicker">OPERAÇÃO / RELACIONAMENTOS</p><h1>Seu time, em movimento.</h1><p>Gerencie vínculos e convites com precisão. Cada aluno confirma o acesso à própria conta.</p></div><button className="personal-primary" onClick={() => { setIssued(null); setQr(''); setShowInvite(true); }}>+ Adicionar aluno</button></div>
      {error && <p className="personal-alert" role="alert">{error}</p>}{message && <p className="personal-success" role="status">{message}</p>}
      <div className="personal-metrics"><div><small>ALUNOS ATIVOS</small><strong>{data?.active ?? '—'}</strong><span>Vínculos em operação</span></div><div><small>CONVITES ABERTOS</small><strong>{pendingCount}</strong><span>Aguardando confirmação</span></div><div><small>CAPACIDADE</small><strong>{capacity == null ? '—' : `${data?.occupied ?? 0} / ${capacity}`}</strong><span>{capacity == null ? 'Plano ativo necessário' : `${Math.max(0, capacity - (data?.occupied || 0))} vagas disponíveis`}</span></div></div>
      <section className="personal-ledger"><div className="personal-ledger-head"><div><p className="personal-kicker">CENTRAL OPERACIONAL</p><h2>{view === 'convites' ? 'Convites emitidos' : view === 'historico' ? 'Histórico de vínculos' : 'Alunos vinculados'}</h2></div>{view !== 'convites' && <label className="personal-search"><span>⌕</span><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar alunos..." aria-label="Buscar alunos" /></label>}</div>
        {view !== 'convites' ? <><div className="personal-table-head"><span>ALUNO</span><span>CONTA</span><span>VÍNCULO</span><span>DATA</span><span></span></div>{!data ? <div className="personal-empty">Carregando vínculos…</div> : rows.length ? rows.map((row) => <button className="personal-row" key={row.id} onClick={() => setSelected(row)}><span className="personal-person"><b>{row.full_name?.slice(0, 2).toUpperCase()}</b><span><strong>{row.full_name}</strong><small>@{row.username}</small></span></span><span>{labelStatus(row.account_status)}</span><span><i className={row.status === 'ACTIVE' ? 'live' : ''} />{labelStatus(row.status)}</span><span>{new Date(row.created_at).toLocaleDateString('pt-BR')}</span><span className="personal-arrow">↗</span></button>) : <div className="personal-empty">Nenhum aluno nesta página. Crie um convite para começar.</div>}<footer className="personal-pagination"><span>{data?.total || 0} vínculo(s)</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{page}</span><button disabled={rows.length < 25} onClick={() => setPage(page + 1)}>Próxima</button></div></footer></> : <><div className="personal-table-head"><span>CONVITE</span><span>ESTADO</span><span>CRIADO</span><span>EXPIRA</span><span></span></div>{invites.length ? invites.map((item) => <div className="personal-row" key={item.id}><span className="personal-person"><b>↗</b><span><strong>{item.id.slice(0, 8)}</strong><small>Uso único</small></span></span><span>{labelStatus(item.status)}</span><span>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span><span>{new Date(item.expiresAt).toLocaleDateString('pt-BR')}</span><button disabled={busy || item.status !== 'PENDING'} onClick={() => cancel(item.id)}>Cancelar</button></div>) : <div className="personal-empty">Nenhum convite emitido.</div>}</>}
      </section></div>
    {selected && <div className="personal-overlay" onClick={() => setSelected(null)}><aside ref={drawerRef} tabIndex={-1} className="personal-drawer" role="dialog" aria-modal="true" aria-label={`Aluno ${selected.full_name}`} onClick={(event) => event.stopPropagation()}><button className="personal-close" onClick={() => setSelected(null)} aria-label="Fechar">×</button><p className="personal-kicker">PERFIL / VÍNCULO</p><h2>{selected.full_name}</h2><p>@{selected.username}</p><dl><dt>Conta</dt><dd>{labelStatus(selected.account_status)}</dd><dt>Vínculo</dt><dd>{labelStatus(selected.status)}</dd><dt>Desde</dt><dd>{new Date(selected.created_at).toLocaleDateString('pt-BR')}</dd></dl><div className="personal-drawer-actions">{selected.status === 'ACTIVE' && <a href={`/personal/fichas?studentId=${encodeURIComponent(selected.student_id)}`}>Abrir fichas ↗</a>}{selected.status === 'ACTIVE' && <button disabled={busy} onClick={() => change(selected.id, 'SUSPEND')}>Suspender vínculo</button>}{selected.status === 'SUSPENDED' && <button disabled={busy} onClick={() => change(selected.id, 'REACTIVATE')}>Reativar vínculo</button>}{['ACTIVE', 'SUSPENDED'].includes(selected.status) && <button className="danger" disabled={busy} onClick={() => change(selected.id, 'TERMINATE')}>Encerrar vínculo</button>}</div></aside></div>}
    {showInvite && <div className="personal-overlay" onClick={() => setShowInvite(false)}><aside ref={drawerRef} tabIndex={-1} className="personal-drawer invite-drawer" role="dialog" aria-modal="true" aria-label="Criar convite" onClick={(event) => event.stopPropagation()}><button className="personal-close" onClick={() => setShowInvite(false)} aria-label="Fechar">×</button><p className="personal-kicker">NOVO ALUNO / ACESSO SEGURO</p><h2>Envie o primeiro passo.</h2><p>O aluno conclui o próprio cadastro e confirma o vínculo antes de aparecer na sua equipe.</p>{!issued ? <><label className="personal-field">E-mail do aluno (opcional)<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="aluno@exemplo.com" /></label><p className="personal-small">O código e o QR funcionam sem envio por e-mail.</p><button className="personal-primary" disabled={busy} onClick={createInvite}>{busy ? 'Criando…' : 'Gerar convite'}</button></> : <><div className="personal-code"><small>CÓDIGO TEMPORÁRIO</small><strong>{issued.code}</strong><button onClick={() => navigator.clipboard.writeText(issued.code)}>Copiar código</button></div>{qr && <img className="personal-qr" src={qr} alt="QR Code do link de convite" />}<button className="personal-copy" onClick={() => navigator.clipboard.writeText(issued.link)}>Copiar link seguro</button><button className="personal-copy" onClick={async () => { if (navigator.share) await navigator.share({ title: 'Convite AtlasFit', url: issued.link }).catch(() => {}); else { await navigator.clipboard.writeText(issued.link); setMessage('Link copiado para compartilhar.'); } }}>Compartilhar convite</button><p className="personal-small">Válido até {new Date(issued.expiresAt).toLocaleString('pt-BR')}. O código e o link só aparecem agora.</p></>}</aside></div>}
  </main>;
}



