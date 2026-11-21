'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getRelationshipActions, runRelationshipAction } from '../../lib/relationship-action-flow.mjs';
import { createRelationshipHistoryClient, presentRelationshipHistoryEvent } from '../../lib/relationship-history-client.mjs';
import './personal.css';

async function api(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Operação indisponível.'); return body; }
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const statusLabel = { ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', TERMINATED: 'Encerrado', PENDING: 'Pendente', ACCEPTED: 'Aceito', CANCELLED: 'Cancelado', EXPIRED: 'Expirado', BLOCKED: 'Bloqueado' };
const labelStatus = (value) => statusLabel[value] || value;

export default function PersonalPage() {
  const drawerRef = useRef(null);
  const confirmationRef = useRef(null);
  const relationshipHistoryClient = useRef(null);
  if (!relationshipHistoryClient.current) relationshipHistoryClient.current = createRelationshipHistoryClient(api);
  const [data, setData] = useState(null), [invites, setInvites] = useState([]), [page, setPage] = useState(1);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [view, setView] = useState('alunos'), [showInvite, setShowInvite] = useState(false);
  const [statusFilter, setStatusFilter] = useState(''), [sort, setSort] = useState('newest'), [layout, setLayout] = useState('table');
  const [inviteEmail, setInviteEmail] = useState(''), [issued, setIssued] = useState(null), [qr, setQr] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRelationshipAction, setPendingRelationshipAction] = useState(null);
  const [history, setHistory] = useState({ events: [], page: 0, pageSize: 20, total: 0, hasMore: false, loaded: false });
  const [historyLoading, setHistoryLoading] = useState(false), [historyLoadingMore, setHistoryLoadingMore] = useState(false), [historyError, setHistoryError] = useState('');

  const load = useCallback(async () => {
    try {
      const [relationships, pending] = await Promise.all([api(`/api/identity/relationships?page=${page}&q=${encodeURIComponent(query)}&scope=${view === 'historico' ? 'all' : 'current'}&status=${statusFilter}&sort=${sort}`), api('/api/identity/invites')]);
      setData(relationships); setInvites(pending.invites || []); setPendingCount(pending.pending || 0); setError('');
    } catch (failure) { setError(failure.message); }
  }, [page, query, view, statusFilter, sort]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const onEscape = (event) => { if (event.key === 'Escape' && !busy) { setPendingRelationshipAction(null); setSelected(null); setShowInvite(false); } }; window.addEventListener('keydown', onEscape); return () => window.removeEventListener('keydown', onEscape); }, [busy]);
  useEffect(() => { if (!selected && !showInvite) return undefined; const previous = document.activeElement; drawerRef.current?.focus(); return () => previous?.focus?.(); }, [selected, showInvite]);
  useEffect(() => { if (pendingRelationshipAction) confirmationRef.current?.focus(); }, [pendingRelationshipAction]);
  useEffect(() => {
    if (!selected?.id) {
      setHistory({ events: [], page: 0, pageSize: 20, total: 0, hasMore: false, loaded: false });
      setHistoryError(''); setHistoryLoading(false); return undefined;
    }
    let active = true;
    setHistory(relationshipHistoryClient.current.getState(selected.id));
    setHistoryError(''); setHistoryLoading(true);
    relationshipHistoryClient.current.refresh(selected.id)
      .then((result) => { if (active) setHistory(result); })
      .catch((failure) => { if (active) setHistoryError(failure.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selected?.id]);

  async function createInvite() {
    setBusy(true); setError('');
    try {
      const result = await api('/api/identity/invites', json('POST', { email: inviteEmail || undefined }));
      const link = `${window.location.origin}/convite?credential=${encodeURIComponent(result.token)}`;
      setIssued({ ...result, link }); setQr(await QRCode.toDataURL(link, { width: 280, margin: 2, color: { dark: '#171717', light: '#ffffff' } }));
      setMessage(result.delivery?.status === 'SENT' ? 'Convite enviado por e-mail. O código e o link também estão disponíveis.' : result.delivery?.status === 'NOT_REQUESTED' ? 'Convite criado. Compartilhe o código ou o link com o aluno.' : 'Convite criado. E-mail não enviado; compartilhe o código ou o link.'); await load();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function requestRelationshipAction(action) {
    if (!selected || busy || !getRelationshipActions(selected.status).includes(action)) return;
    setError(''); setMessage(''); setPendingRelationshipAction(action);
  }
  async function refreshRelationshipHistory(relationshipId) {
    setHistoryLoading(true); setHistoryError('');
    try { setHistory(await relationshipHistoryClient.current.refresh(relationshipId)); }
    catch (failure) { setHistoryError(failure.message); }
    finally { setHistoryLoading(false); }
  }
  async function loadMoreRelationshipHistory() {
    if (!selected?.id || historyLoadingMore || !history.hasMore) return;
    setHistoryLoadingMore(true); setHistoryError('');
    try { setHistory(await relationshipHistoryClient.current.loadMore(selected.id)); }
    catch (failure) { setHistoryError(failure.message); }
    finally { setHistoryLoadingMore(false); }
  }
  async function confirmRelationshipAction() {
    if (!selected || !pendingRelationshipAction || busy) return;
    const action = pendingRelationshipAction;
    setError(''); setMessage('');
    try {
      const updated = await runRelationshipAction({
        relationship: selected,
        action,
        request: api,
        refresh: load,
        onUpdate: (result) => setSelected((current) => current?.id === result.id ? { ...current, status: result.status } : current),
        onBusy: setBusy,
      });
      await refreshRelationshipHistory(selected.id);
      setPendingRelationshipAction(null);
      setMessage(updated.requiresConsent ? 'Solicitação enviada ao aluno. O vínculo continua suspenso até o consentimento.' : `Vínculo ${labelStatus(updated.status).toLowerCase()}.`);
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function resend(id) { setBusy(true); setError(''); setMessage(''); try { await api('/api/identity/invites/resend', json('POST', { id })); setMessage('Convite reenviado por e-mail.'); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function cancel(id) {
    setBusy(true); setError('');
    try { await api(`/api/identity/invites?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); setMessage('Convite cancelado.'); await load(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const rows = data?.relationships || [];
  const capacity = data?.capacity;

  return <main className="personal-shell">
    <header className="personal-top"><a href="/" className="personal-brand"><span className="personal-mark">A</span><span>AtlasFit <small>PROFESSIONAL</small></span></a><nav aria-label="Navegação da central"><button className={view === 'alunos' ? 'active' : ''} onClick={() => { setPage(1); setStatusFilter(''); setView('alunos'); }}>Alunos</button><button className={view === 'convites' ? 'active' : ''} onClick={() => { setPage(1); setStatusFilter(''); setView('convites'); }}>Convites</button><button className={view === 'historico' ? 'active' : ''} onClick={() => { setPage(1); setStatusFilter(''); setView('historico'); }}>Histórico</button><a href="/">Fichas de treino ↗</a></nav><span className="personal-top-meta">CENTRAL DO PERSONAL</span></header>
    <div className="personal-main"><div className="personal-heading"><div><p className="personal-kicker">OPERAÇÃO / RELACIONAMENTOS</p><h1>Seu time, em movimento.</h1><p>Gerencie vínculos e convites com precisão. Cada aluno confirma o acesso à própria conta.</p></div><button className="personal-primary" onClick={() => { setIssued(null); setQr(''); setShowInvite(true); }}>+ Adicionar aluno</button></div>
      {error && <p className="personal-alert" role="alert">{error}</p>}{message && <p className="personal-success" role="status">{message}</p>}
      <div className="personal-metrics"><div><small>ALUNOS ATIVOS</small><strong>{data?.active ?? '—'}</strong><span>Vínculos em operação</span></div><div><small>SEM FICHA</small><strong>{data?.withoutPlan ?? '—'}</strong><span>Próximos à prescrição</span></div><div><small>FICHAS ATIVAS</small><strong>{data?.activePlans ?? '—'}</strong><span>Treinos em acompanhamento</span></div><div><small>CONVITES ABERTOS</small><strong>{pendingCount}</strong><span>Aguardando confirmação</span></div><div><small>CAPACIDADE</small><strong>{capacity == null ? '—' : `${data?.occupied ?? 0} / ${capacity}`}</strong><span>{capacity == null ? 'Plano ativo necessário' : `${Math.max(0, capacity - (data?.occupied || 0))} vagas disponíveis`}</span></div></div>
      <section className="personal-ledger"><div className="personal-ledger-head"><div><p className="personal-kicker">CENTRAL OPERACIONAL</p><h2>{view === 'convites' ? 'Convites emitidos' : view === 'historico' ? 'Histórico de vínculos' : 'Alunos vinculados'}</h2></div>{view !== 'convites' && <div className="personal-tools"><label className="personal-search"><span>⌕</span><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar alunos..." aria-label="Buscar alunos" /></label><select aria-label="Filtrar vínculo" value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">Todos os vínculos</option><option value="ACTIVE">Ativos</option><option value="SUSPENDED">Suspensos</option>{view === 'historico' && <option value="TERMINATED">Encerrados</option>}</select><select aria-label="Ordenar alunos" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="name">Nome A–Z</option></select><div className="personal-layout"><button aria-label="Visualização em tabela" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}>☷</button><button aria-label="Visualização em grade" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>▦</button></div></div>}</div>
        {view !== 'convites' ? <><div className={layout === 'table' ? 'personal-table-head' : 'personal-table-head is-hidden'}><span>ALUNO</span><span>CONTA</span><span>VÍNCULO</span><span>DATA</span><span></span></div>{!data ? <div className="personal-empty">Carregando vínculos…</div> : rows.length ? <div className={layout === 'grid' ? 'personal-grid' : 'personal-list'}>{rows.map((row) => <button className={layout === 'grid' ? 'personal-row is-grid' : 'personal-row'} key={row.id} onClick={() => setSelected(row)}><span className="personal-person"><b>{row.full_name?.slice(0, 2).toUpperCase()}</b><span><strong>{row.full_name}</strong><small>@{row.username}</small></span></span><span>{labelStatus(row.account_status)}</span><span><i className={row.status === 'ACTIVE' ? 'live' : ''} />{labelStatus(row.status)}</span><span>{new Date(row.created_at).toLocaleDateString('pt-BR')}</span><span className="personal-arrow">↗</span></button>)}</div> : <div className="personal-empty">Nenhum aluno nesta página. Crie um convite para começar.</div>}<footer className="personal-pagination"><span>{data?.total || 0} vínculo(s)</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{page}</span><button disabled={rows.length < 25} onClick={() => setPage(page + 1)}>Próxima</button></div></footer></> : <><div className="personal-table-head"><span>CONVITE</span><span>ESTADO</span><span>CRIADO</span><span>EXPIRA</span><span></span></div>{invites.length ? invites.map((item) => <div className="personal-row" key={item.id}><span className="personal-person"><b>↗</b><span><strong>{item.id.slice(0, 8)}</strong><small>Uso único</small></span></span><span>{labelStatus(item.status)}</span><span>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span><span>{new Date(item.expiresAt).toLocaleDateString('pt-BR')}</span>{item.status === 'PENDING' && <><button disabled={busy} onClick={() => resend(item.id)}>{busy ? 'Enviando…' : 'Reenviar convite'}</button><button disabled={busy} onClick={() => cancel(item.id)}>Cancelar</button></>}</div>) : <div className="personal-empty">Nenhum convite emitido.</div>}</>}
      </section></div>
    {selected && <div className="personal-overlay" onClick={() => setSelected(null)}><aside ref={drawerRef} tabIndex={-1} className="personal-drawer" role="dialog" aria-modal="true" aria-label={`Aluno ${selected.full_name}`} onClick={(event) => event.stopPropagation()}><button className="personal-close" onClick={() => setSelected(null)} aria-label="Fechar">×</button><p className="personal-kicker">PERFIL / VÍNCULO</p><h2>{selected.full_name}</h2><p>@{selected.username}</p><dl><dt>Conta</dt><dd>{labelStatus(selected.account_status)}</dd><dt>Vínculo</dt><dd>{labelStatus(selected.status)}</dd><dt>Desde</dt><dd>{new Date(selected.created_at).toLocaleDateString('pt-BR')}</dd></dl><div className="personal-drawer-actions">{selected.status === 'ACTIVE' && <a href={`/personal/fichas?studentId=${encodeURIComponent(selected.student_id)}`}>Abrir fichas ↗</a>}{selected.status === 'ACTIVE' && <button disabled={busy} onClick={() => requestRelationshipAction('SUSPEND')}>Suspender vínculo</button>}{selected.status === 'SUSPENDED' && <button disabled={busy} onClick={() => requestRelationshipAction('REACTIVATE')}>Reativar vínculo</button>}{['ACTIVE', 'SUSPENDED'].includes(selected.status) && <button className="danger" disabled={busy} onClick={() => requestRelationshipAction('TERMINATE')}>Encerrar vínculo</button>}</div><section className="relationship-history" aria-labelledby="relationship-history-title"><div className="relationship-history-heading"><div><p className="personal-kicker">AUDITORIA DO RELACIONAMENTO</p><h3 id="relationship-history-title">Histórico do vínculo</h3></div>{history.loaded && <span>{history.total} {history.total === 1 ? 'evento' : 'eventos'}</span>}</div>{historyError && <p className="relationship-history-error" role="alert">{historyError}</p>}{historyLoading && history.events.length === 0 && <div className="relationship-history-skeleton" role="status" aria-label="Carregando histórico"><i /><i /><i /></div>}{historyLoading && history.events.length > 0 && <p className="relationship-history-updating" role="status">Atualizando histórico…</p>}{history.loaded && !historyLoading && !historyError && history.events.length === 0 && <div className="relationship-history-empty" role="status"><span aria-hidden="true">◷</span><strong>Nenhum evento registrado</strong><small>As alterações deste vínculo aparecerão aqui.</small></div>}{history.events.length > 0 && <ol className="relationship-history-timeline">{history.events.map((item) => { const entry = presentRelationshipHistoryEvent(item); const date = new Date(entry.createdAt); const validDate = !Number.isNaN(date.getTime()); return <li key={item.id} className={`relationship-history-event event-${String(item.event_type || 'change').toLowerCase()}`}><span className="relationship-history-marker" aria-hidden="true">{item.event_type === 'ACCEPTED' ? '✓' : item.event_type === 'REJECTED' ? '×' : item.event_type === 'TERMINATE' ? '!' : '↻'}</span><article className="relationship-history-card"><div className="relationship-history-event-head"><strong>{entry.title}</strong><time dateTime={entry.createdAt}>{validDate ? date.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : entry.createdAt}</time></div>{entry.previousStatus && entry.nextStatus && <p className="relationship-history-transition"><span>{labelStatus(entry.previousStatus)}</span><b aria-hidden="true">→</b><span>{labelStatus(entry.nextStatus)}</span></p>}{entry.actorId && <small className="relationship-history-actor">Responsável · {entry.actorId}</small>}{entry.reason && <p className="relationship-history-reason">{entry.reason}</p>}</article></li>; })}</ol>}{history.hasMore && <button type="button" className="relationship-history-more" disabled={historyLoadingMore || historyLoading} aria-busy={historyLoadingMore} onClick={loadMoreRelationshipHistory}>{historyLoadingMore ? 'Carregando eventos…' : 'Carregar eventos anteriores'}</button>}</section></aside></div>}
    {pendingRelationshipAction && selected && <div className="personal-confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && setPendingRelationshipAction(null)}><section className={`personal-confirm-dialog ${pendingRelationshipAction === 'TERMINATE' ? 'is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="relationship-confirm-title" aria-describedby="relationship-confirm-description"><span className="personal-confirm-mark" aria-hidden="true">{pendingRelationshipAction === 'TERMINATE' ? '!' : '↗'}</span><p className="personal-kicker">CONFIRMAR AÇÃO / VÍNCULO</p><h2 id="relationship-confirm-title">{pendingRelationshipAction === 'SUSPEND' ? 'Suspender vínculo?' : pendingRelationshipAction === 'REACTIVATE' ? 'Reativar vínculo?' : 'Encerrar vínculo?'}</h2><p id="relationship-confirm-description">{pendingRelationshipAction === 'SUSPEND' ? `O acesso de ${selected.full_name} às fichas desta unidade será pausado. Você poderá reativar o vínculo depois.` : pendingRelationshipAction === 'REACTIVATE' ? `O acesso de ${selected.full_name} será restaurado se a conta e a capacidade do plano continuarem válidas.` : `Esta ação é irreversível. O vínculo com ${selected.full_name} será encerrado, mas os dados e o cadastro do aluno serão preservados.`}</p>{error && <p className="personal-alert" role="alert">{error}</p>}<div className="personal-confirm-actions"><button type="button" className="personal-confirm-cancel" disabled={busy} onClick={() => setPendingRelationshipAction(null)}>Voltar</button><button type="button" ref={confirmationRef} className="personal-confirm-submit" disabled={busy} aria-busy={busy} onClick={confirmRelationshipAction}>{busy ? 'Processando…' : pendingRelationshipAction === 'SUSPEND' ? 'Suspender vínculo' : pendingRelationshipAction === 'REACTIVATE' ? 'Reativar vínculo' : 'Encerrar vínculo'}</button></div></section></div>}    {showInvite && <div className="personal-overlay" onClick={() => setShowInvite(false)}><aside ref={drawerRef} tabIndex={-1} className="personal-drawer invite-drawer" role="dialog" aria-modal="true" aria-label="Criar convite" onClick={(event) => event.stopPropagation()}><button className="personal-close" onClick={() => setShowInvite(false)} aria-label="Fechar">×</button><p className="personal-kicker">NOVO ALUNO / ACESSO SEGURO</p><h2>Envie o primeiro passo.</h2><p>O aluno conclui o próprio cadastro e confirma o vínculo antes de aparecer na sua equipe.</p>{!issued ? <><label className="personal-field">E-mail do aluno (opcional)<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="aluno@exemplo.com" /></label><p className="personal-small">O código e o QR funcionam sem envio por e-mail.</p><button className="personal-primary" disabled={busy} onClick={createInvite}>{busy ? 'Criando…' : 'Gerar convite'}</button></> : <><div className="personal-code"><small>CÓDIGO TEMPORÁRIO</small><strong>{issued.code}</strong><button onClick={() => navigator.clipboard.writeText(issued.code)}>Copiar código</button></div>{qr && <img className="personal-qr" src={qr} alt="QR Code do link de convite" />}<button className="personal-copy" onClick={() => navigator.clipboard.writeText(issued.link)}>Copiar link seguro</button><button className="personal-copy" onClick={async () => { if (navigator.share) await navigator.share({ title: 'Convite AtlasFit', url: issued.link }).catch(() => {}); else { await navigator.clipboard.writeText(issued.link); setMessage('Link copiado para compartilhar.'); } }}>Compartilhar convite</button><p className="personal-small">Válido até {new Date(issued.expiresAt).toLocaleString('pt-BR')}. O código e o link só aparecem agora.</p></>}</aside></div>}
  </main>;
}



