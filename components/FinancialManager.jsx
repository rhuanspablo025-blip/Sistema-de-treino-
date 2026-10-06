'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  ['dashboard', 'Dashboard'], ['plans', 'Planos'], ['subscriptions', 'Assinaturas'],
  ['invoices', 'Cobranças'], ['payments', 'Pagamentos'], ['payouts', 'Repasses'], ['delinquency', 'Inadimplência'],
  ['blocks', 'Bloqueios'], ['rules', 'Regras de cobrança'], ['provider', 'Provedor'],
  ['ledger', 'Histórico'], ['settings', 'Configurações'],
];
const MONEY_FIELDS = [
  ['monthlyPrice', 'Mensalidade do administrador'], ['annualPrice', 'Anuidade do administrador'],
  ['extraStudentPrice', 'Aluno excedente'], ['extraTeacherPrice', 'Professor excedente'],
  ['studentMonthlyPrice', 'Mensalidade por aluno'], ['studentAnnualPrice', 'Anuidade por aluno'],
  ['discountAmount', 'Desconto do plano'],
  ['discountPercent', 'Desconto percentual'],
];
const DEFAULT_PLAN = {
  name: '', description: '', billingPeriod: 'both', billingModel: 'HYBRID', discountPercent: '0', discountAmount: '0', monthlyPrice: '0', annualPrice: '0',
  includedStudents: '10', extraStudentPrice: '0', includedTeachers: '1', extraTeacherPrice: '0',
  studentMonthlyPrice: '0', studentAnnualPrice: '0', platformFeePercent: '0',
  dueDay: '10', noticeDays: '5', graceDays: '3', restrictAfterDays: '1', blockAfterDays: '7',
  allowStudentRevenueOffset: false, offsetPercent: '0', offsetCap: '', active: true,
};

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

function money(cents = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function decimalToCents(value) {
  const amount = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function date(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR');
}

function centsToDecimal(value) { return (Number(value || 0) / 100).toFixed(2); }

export default function FinancialManager() {
  const [section, setSection] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [rules, setRules] = useState(null);
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingPlan, setEditingPlan] = useState(null);
  const [subscriptionDraft, setSubscriptionDraft] = useState({ accountUserId: '', planId: '', billingPeriod: 'monthly' });
  const [invoiceDraft, setInvoiceDraft] = useState({ subscriptionId: '', periodKey: new Date().toISOString().slice(0, 7) });
  const [blockDraft, setBlockDraft] = useState({ userId: '', level: 'RESTRICTION', reason: '', durationDays: '7' });
  const [rulesDraft, setRulesDraft] = useState(null);

  async function loadSection(selected = section) {
    setLoading(true);
    setError('');
    try {
      if (selected === 'dashboard') {
        const result = await requestJson('/api/finance/dashboard');
        setDashboard(result.dashboard);
        setPlans(result.plans || []);
        setSubscriptions(result.subscriptions || []);
        setInvoices(result.upcomingInvoices || []);
        setBlocks(result.blocks || []);
      } else {
        const resource = selected === 'delinquency' ? 'invoices' : selected;
        const result = await requestJson(`/api/finance/${resource}`);
        if (selected === 'plans') setPlans(result.plans || []);
        if (selected === 'subscriptions') { setSubscriptions(result.subscriptions || []); setUsers(result.users || []); setPlans(result.plans || []); }
        if (selected === 'invoices' || selected === 'delinquency') { setInvoices(result.invoices || []); setSubscriptions(result.subscriptions || []); }
        if (selected === 'payments') setPayments(result.payments || []);
        if (selected === 'payouts') setPayouts(result.payouts || []);
        if (selected === 'blocks') { setBlocks(result.blocks || []); setUsers(result.users || []); }
        if (selected === 'rules') { setRules(result.rules); setRulesDraft(result.rules); }
        if (selected === 'provider') setProvider(result.provider);
        if (selected === 'ledger') setLedger(result.entries || []);
      }
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os dados financeiros.');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadSection(section); }, [section]);

  async function mutate(url, method, body, success) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setNotice(result.message || success);
      setEditingPlan(null);
      await loadSection(section);
      return result;
    } catch (mutationError) {
      setError(mutationError.message || 'A operação não foi concluída.');
      return null;
    } finally { setBusy(false); }
  }

  function editPlan(plan = null) {
    setEditingPlan(plan ? {
      id: plan.id,
      name: plan.name,
      description: plan.description || '',
      billingPeriod: plan.billingPeriod || 'monthly',
      billingModel: plan.billingModel || 'HYBRID',
      discountPercent: String(plan.discountPercent ?? 0),
      monthlyPrice: centsToDecimal(plan.monthlyPriceCents),
      annualPrice: centsToDecimal(plan.annualPriceCents),
      includedStudents: String(plan.includedStudents ?? 10),
      extraStudentPrice: centsToDecimal(plan.extraStudentPriceCents),
      includedTeachers: String(plan.includedTeachers ?? 1),
      extraTeacherPrice: centsToDecimal(plan.extraTeacherPriceCents),
      studentMonthlyPrice: centsToDecimal(plan.studentMonthlyPriceCents),
      studentAnnualPrice: centsToDecimal(plan.studentAnnualPriceCents),
      discountAmount: centsToDecimal(plan.discountCents),
      platformFeePercent: String(plan.platformFeePercent ?? 0),
      dueDay: String(plan.dueDay ?? 10),
      noticeDays: String(plan.noticeDays ?? 5),
      graceDays: String(plan.graceDays ?? 3),
      restrictAfterDays: String(plan.restrictAfterDays ?? 1),
      blockAfterDays: String(plan.blockAfterDays ?? 7),
      allowStudentRevenueOffset: plan.allowStudentRevenueOffset === true,
      offsetPercent: String(plan.offsetPercent ?? 0),
      offsetCap: plan.offsetCapCents == null ? '' : centsToDecimal(plan.offsetCapCents),
      active: plan.active !== false,
    } : { ...DEFAULT_PLAN });
  }

  function planPayload(form) {
    const value = new FormData(form);
    const monthlyPriceCents = decimalToCents(value.get('monthlyPrice'));
    const annualPriceCents = decimalToCents(value.get('annualPrice'));
    const studentMonthlyPriceCents = decimalToCents(value.get('studentMonthlyPrice'));
    const studentAnnualPriceCents = decimalToCents(value.get('studentAnnualPrice'));
    const platformFeePercent = Number(value.get('platformFeePercent'));
    const hasAdminPrice = monthlyPriceCents > 0 || annualPriceCents > 0;
    const hasStudentRevenue = studentMonthlyPriceCents > 0 || studentAnnualPriceCents > 0 || platformFeePercent > 0;
    return {
      id: editingPlan?.id,
      name: value.get('name'), description: value.get('description'), billingPeriod: value.get('billingPeriod'),
      billingModel: hasAdminPrice && hasStudentRevenue ? 'HYBRID' : hasStudentRevenue ? 'STUDENT_FEE' : 'ADMIN_SUBSCRIPTION',
      discountPercent: Number(value.get('discountPercent')) || 0,
      monthlyPriceCents,
      annualPriceCents,
      includedStudents: Number(value.get('includedStudents')),
      extraStudentPriceCents: decimalToCents(value.get('extraStudentPrice')),
      includedTeachers: Number(value.get('includedTeachers')),
      extraTeacherPriceCents: decimalToCents(value.get('extraTeacherPrice')),
      studentMonthlyPriceCents,
      studentAnnualPriceCents,
      discountCents: decimalToCents(value.get('discountAmount')),
      platformFeePercent,
      dueDay: Number(value.get('dueDay')), noticeDays: Number(value.get('noticeDays')),
      graceDays: Number(value.get('graceDays')), restrictAfterDays: Number(value.get('restrictAfterDays')),
      blockAfterDays: Number(value.get('blockAfterDays')),
      allowStudentRevenueOffset: value.get('allowStudentRevenueOffset') === 'on',
      offsetPercent: Number(value.get('offsetPercent')),
      offsetCapCents: value.get('offsetCap') ? decimalToCents(value.get('offsetCap')) : null,
      active: true,
    };
  }

  function submitPlan(event) {
    event.preventDefault();
    const payload = planPayload(event.currentTarget);
    void mutate('/api/finance/plans', editingPlan?.id ? 'PATCH' : 'POST', payload, 'Plano salvo.');
  }

  function saveRules(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget);
    void mutate('/api/finance/rules', 'PUT', {
      dueDay: Number(value.get('dueDay')), noticeDays: Number(value.get('noticeDays')),
      graceDays: Number(value.get('graceDays')), restrictAfterDays: Number(value.get('restrictAfterDays')),
      blockAfterDays: Number(value.get('blockAfterDays')), lateFeePercent: Number(value.get('lateFeePercent')),
      dailyInterestPercent: Number(value.get('dailyInterestPercent')), platformFeePercent: Number(value.get('platformFeePercent')),
      allowStudentRevenueOffset: value.get('allowStudentRevenueOffset') === 'on',
      offsetPercent: Number(value.get('offsetPercent')),
      offsetCapCents: value.get('offsetCap') ? decimalToCents(value.get('offsetCap')) : null,
      creditCarryover: value.get('creditCarryover') === 'on',
    }, 'Regras de cobrança salvas.');
  }

  function updateField(setter, field, value) { setter((current) => ({ ...current, [field]: value })); }

  const viewTitle = SECTIONS.find(([key]) => key === section)?.[1] || 'Financeiro';
  const customerOptions = users.filter((user) => ['admin', 'trainer'].includes(user.role));
  const delinquentInvoices = invoices.filter((invoice) => ['OVERDUE', 'VENCIDO'].includes(invoice.status));
  const upcoming = dashboard?.upcomingInvoices || [];

  return <div className="page-content finance-page">
    <div className="page-heading finance-heading"><div><p className="eyebrow">PROPRIETÁRIO DO SISTEMA</p><h1>Financeiro</h1><p className="heading-copy">Planos, assinaturas, faturamento e acesso da plataforma.</p></div><span className="finance-owner-badge">SUPER ADMIN</span></div>
    <nav className="finance-tabs" aria-label="Seções financeiras">{SECTIONS.map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => { setSection(key); setError(''); setNotice(''); }}>{label}</button>)}</nav>
    {error && <div className="finance-error" role="alert">{error}</div>}
    {notice && <div className="finance-notice" role="status">{notice}</div>}
    {loading ? <div className="finance-loading" role="status">Carregando {viewTitle.toLowerCase()}...</div> : <>
      {section === 'dashboard' && <>
        <div className="finance-metrics">
          <Metric label="Receita mensal" value={money(dashboard?.monthlyRevenueCents)} />
          <Metric label="Prevista" value={money(dashboard?.expectedRevenueCents)} />
          <Metric label="Em atraso" value={money(dashboard?.overdueCents)} tone="warning" />
          <Metric label="Assinaturas ativas" value={dashboard?.activeSubscriptions || 0} />
          <Metric label="Vencendo em 7 dias" value={dashboard?.dueSoonCount || 0} />
          <Metric label="Acessos restritos" value={dashboard?.blockedUsers || 0} tone="warning" />
          <Metric label="Alunos ativos" value={dashboard?.activeStudents || 0} />
          <Metric label="Taxas/descontos" value={money(dashboard?.feesAndDiscountsCents)} />
          <Metric label="Líquido estimado" value={money(dashboard?.netEstimatedCents)} />
        </div>
        <div className="finance-overview-grid">
          <section className="finance-panel"><div className="finance-panel-heading"><div><h2>Receita por mês</h2><p>Valores de cobranças liquidadas</p></div></div><div className="finance-chart">{(dashboard?.monthlySeries || []).map((item) => <div className="finance-bar-group" key={item.month}><div className="finance-bar-track"><span style={{ height: `${Math.max(3, item.valueCents / Math.max(1, dashboard?.monthlyMaxCents || 1) * 100)}%` }} title={money(item.valueCents)} /></div><small>{item.label}</small></div>)}</div></section>
          <section className="finance-panel"><div className="finance-panel-heading"><div><h2>Próximos vencimentos</h2><p>Contas dos próximos sete dias</p></div><button className="finance-link" onClick={() => setSection('invoices')}>Ver cobranças</button></div>{upcoming.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Usuário</th><th>Plano</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>{upcoming.map((invoice) => <tr key={invoice.id}><td>{invoice.customerName}</td><td>{invoice.planName}</td><td>{money(invoice.finalAmountCents)}</td><td>{date(invoice.dueAt)}</td><td><Status value={invoice.status} /></td></tr>)}</tbody></table></div> : <Empty>No upcoming due dates.</Empty>}</section>
        </div>
      </>}
      {section === 'plans' && <section className="finance-panel"><PanelHeading title="Planos comerciais" detail="Valores e regras configuráveis sem alterar código." action={<button className="primary-button" onClick={() => editPlan()}>+ Novo plano</button>} />{plans.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Plano</th><th>Mensal</th><th>Anual</th><th>Alunos incluídos</th><th>Excedente</th><th>Estado</th><th></th></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><small>{plan.description}</small></td><td>{money(plan.monthlyPriceCents)}</td><td>{money(plan.annualPriceCents)}</td><td>{plan.includedStudents}</td><td>{money(plan.extraStudentPriceCents)}</td><td><Status value={plan.active ? 'ACTIVE' : 'INACTIVE'} /></td><td className="finance-actions"><button onClick={() => editPlan(plan)}>Editar</button><button onClick={() => void mutate('/api/finance/plans', 'PATCH', { id: plan.id, active: !plan.active }, 'Status do plano atualizado.')}>{plan.active ? 'Desativar' : 'Ativar'}</button><button onClick={() => void mutate('/api/finance/plans', 'POST', { ...plan, id: undefined, name: `${plan.name} (cópia)` }, 'Plano duplicado.')}>Duplicar</button><button className="danger" onClick={() => window.confirm(`Excluir ${plan.name}?`) && void mutate(`/api/finance/plans?id=${encodeURIComponent(plan.id)}`, 'DELETE', undefined, 'Plano excluído.')}>Excluir</button></td></tr>)}</tbody></table></div> : <Empty>Nenhum plano criado.</Empty>}</section>}
      {section === 'subscriptions' && <section className="finance-panel"><PanelHeading title="Assinaturas" detail="Vincule plano e conta; preços e total são calculados no servidor." /><form className="finance-inline-form" onSubmit={(event) => { event.preventDefault(); const draft = { ...subscriptionDraft }; void mutate('/api/finance/subscriptions', 'POST', draft, 'Assinatura criada.'); }}><label>Conta<select required value={subscriptionDraft.accountUserId} onChange={(event) => updateField(setSubscriptionDraft, 'accountUserId', event.target.value)}><option value="">Selecione administrador/professor</option>{customerOptions.map((user) => <option key={user.id} value={user.id}>{user.name} (@{user.username})</option>)}</select></label><label>Plano<select required value={subscriptionDraft.planId} onChange={(event) => updateField(setSubscriptionDraft, 'planId', event.target.value)}><option value="">Selecione</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>Período<select value={subscriptionDraft.billingPeriod} onChange={(event) => updateField(setSubscriptionDraft, 'billingPeriod', event.target.value)}><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label><button className="primary-button" disabled={busy}>Criar assinatura</button></form>{subscriptions.length ? <Rows rows={subscriptions} columns={['accountName', 'planName', 'billingPeriod', 'status', 'nextDueAt']} labels={['Conta', 'Plano', 'Período', 'Status', 'Próximo vencimento']} render={{ billingPeriod: (value) => value === 'annual' ? 'Anual' : 'Mensal', nextDueAt: date, status: (value) => <Status value={value} /> }} /> : <Empty>Nenhuma assinatura cadastrada.</Empty>}</section>}
      {section === 'invoices' && <section className="finance-panel"><PanelHeading title="Cobranças" detail="Gere faturas por competência; valores calculados no backend." /><form className="finance-inline-form" onSubmit={(event) => { event.preventDefault(); void mutate('/api/finance/invoices', 'POST', invoiceDraft, 'Cobrança gerada.'); }}><label>Assinatura<select required value={invoiceDraft.subscriptionId} onChange={(event) => updateField(setInvoiceDraft, 'subscriptionId', event.target.value)}><option value="">Selecione assinatura</option>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.accountName} · {subscription.planName}</option>)}</select></label><label>Competência<input type="month" required value={invoiceDraft.periodKey} onChange={(event) => updateField(setInvoiceDraft, 'periodKey', event.target.value)} /></label><button className="primary-button" disabled={busy}>Gerar cobrança</button></form>{invoices.length ? <Rows rows={invoices} columns={['customerName', 'planName', 'periodKey', 'finalAmountCents', 'dueAt', 'status', 'actions']} labels={['Usuário', 'Plano', 'Competência', 'Valor final', 'Vencimento', 'Status', 'Ações']} render={{ finalAmountCents: money, dueAt: date, status: (value) => <Status value={value} />, actions: (_, invoice) => ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'BLOCKED'].includes(invoice.status) ? <button className="finance-action-danger" onClick={() => window.confirm('Cancelar esta cobrança?') && void mutate('/api/finance/invoices', 'PATCH', { id: invoice.id, status: 'CANCELLED' }, 'Cobrança cancelada.')}>Cancelar</button> : '—' }} /> : <Empty>Nenhuma cobrança encontrada.</Empty>}</section>}
      {section === 'delinquency' && <section className="finance-panel"><PanelHeading title="Inadimplência" detail="Cobranças vencidas e ações de acesso." />{delinquentInvoices.length ? <Rows rows={delinquentInvoices} columns={['customerName', 'planName', 'finalAmountCents', 'dueAt', 'daysOverdue', 'status']} labels={['Usuário', 'Plano', 'Valor', 'Vencimento', 'Dias em atraso', 'Status']} render={{ finalAmountCents: money, dueAt: date, status: (value) => <Status value={value} /> }} /> : <Empty>Nenhuma cobrança em atraso.</Empty>}</section>}
      {section === 'payments' && <section className="finance-panel"><PanelHeading title="Pagamentos" detail="Liquidações confirmadas por webhook verificado." />{payments.length ? <Rows rows={payments} columns={['customerName', 'invoiceId', 'method', 'amountCents', 'status', 'paidAt']} labels={['Usuário', 'Cobrança', 'Método', 'Valor', 'Status', 'Pago em']} render={{ amountCents: money, paidAt: date, status: (value) => <Status value={value} /> }} /> : <Empty>Nenhum pagamento confirmado.</Empty>}<p className="finance-provider-note">Ações de Pix, boleto e cartão permanecem desabilitadas até configurar um gateway real. Nenhum pagamento é marcado como pago pelo frontend.</p></section>}
      {section === 'payouts' && <section className="finance-panel"><PanelHeading title="Repasses ao Bradesco" detail="Acompanhe valor solicitado, crédito informado pelo Asaas, tarifa e estado do repasse." />{payouts.length ? <Rows rows={payouts} columns={['customerName', 'paymentId', 'amountCents', 'creditedAmountCents', 'transferFeeCents', 'status', 'externalTransferId', 'createdAt']} labels={['Pagador', 'Pagamento', 'Valor solicitado', 'Crédito no destino', 'Tarifa', 'Estado', 'ID Asaas', 'Criado em']} render={{ amountCents: money, creditedAmountCents: (value) => value == null ? '—' : money(value), transferFeeCents: (value) => value == null ? '—' : money(value), createdAt: date, status: (value) => <Status value={value} /> }} /> : <Empty>Nenhum repasse registrado.</Empty>}<p className="finance-provider-note">Dados da conta de destino não são exibidos nem armazenados nesta aplicação.</p></section>}
      {section === 'blocks' && <section className="finance-panel"><PanelHeading title="Bloqueios de acesso" detail="Bloqueios manuais e automáticos ficam auditados." /><form className="finance-inline-form" onSubmit={(event) => { event.preventDefault(); void mutate('/api/finance/blocks', 'POST', blockDraft, 'Bloqueio registrado.'); }}><label>Usuário<select required value={blockDraft.userId} onChange={(event) => updateField(setBlockDraft, 'userId', event.target.value)}><option value="">Selecione conta</option>{users.filter((user) => user.role !== 'SUPER_ADMIN').map((user) => <option key={user.id} value={user.id}>{user.name} (@{user.username})</option>)}</select></label><label>Nível<select value={blockDraft.level} onChange={(event) => updateField(setBlockDraft, 'level', event.target.value)}><option value="WARNING">Aviso</option><option value="RESTRICTION">Restrição</option><option value="PARTIAL">Bloqueio parcial</option><option value="TOTAL">Bloqueio total</option></select></label><label>Duração (dias)<input type="number" min="1" max="3650" required value={blockDraft.durationDays} onChange={(event) => updateField(setBlockDraft, 'durationDays', event.target.value)} /></label><label>Motivo<input required maxLength="240" value={blockDraft.reason} onChange={(event) => updateField(setBlockDraft, 'reason', event.target.value)} /></label><button className="primary-button" disabled={busy}>Bloquear</button></form>{blocks.length ? <Rows rows={blocks} columns={['username', 'level', 'reason', 'startsAt', 'endsAt', 'status', 'actions']} labels={['Usuário', 'Nível', 'Motivo', 'Início', 'Fim', 'Status', 'Ações']} render={{ startsAt: date, endsAt: date, status: (value) => <Status value={value} />, actions: (_, block) => block.source === 'MANUAL' && block.status === 'ACTIVE' ? <button className="finance-action-danger" onClick={() => void mutate('/api/finance/blocks', 'PATCH', { id: block.id, action: 'release' }, 'Acesso desbloqueado.')}>Desbloquear</button> : 'Automático' }} /> : <Empty>Nenhum bloqueio ativo.</Empty>}</section>}
      {section === 'rules' && rulesDraft && <section className="finance-panel"><PanelHeading title="Regras de cobrança" detail="Todos os prazos e taxas são persistidos no banco." /><form className="finance-rule-grid" onSubmit={saveRules}><RuleNumber name="dueDay" label="Dia de vencimento" value={rulesDraft.dueDay} min="1" max="28" /><RuleNumber name="noticeDays" label="Aviso antes (dias)" value={rulesDraft.noticeDays} min="0" max="90" /><RuleNumber name="graceDays" label="Tolerância (dias)" value={rulesDraft.graceDays} min="0" max="90" /><RuleNumber name="restrictAfterDays" label="Restringir após (dias)" value={rulesDraft.restrictAfterDays} min="0" max="365" /><RuleNumber name="blockAfterDays" label="Bloquear após (dias)" value={rulesDraft.blockAfterDays} min="0" max="365" /><RuleNumber name="lateFeePercent" label="Multa (%)" value={rulesDraft.lateFeePercent} step="0.01" min="0" max="100" /><RuleNumber name="dailyInterestPercent" label="Juros ao dia (%)" value={rulesDraft.dailyInterestPercent} step="0.001" min="0" max="10" /><RuleNumber name="platformFeePercent" label="Taxa plataforma (%)" value={rulesDraft.platformFeePercent} step="0.01" min="0" max="100" /><label className="finance-checkbox"><input name="allowStudentRevenueOffset" type="checkbox" defaultChecked={rulesDraft.allowStudentRevenueOffset} /> Permitir abatimento de receita dos alunos</label><RuleNumber name="offsetPercent" label="Percentual elegível (%)" value={rulesDraft.offsetPercent} step="0.01" min="0" max="100" /><label className="finance-field">Limite de abatimento<input name="offsetCap" type="number" min="0" step="0.01" defaultValue={rulesDraft.offsetCapCents == null ? '' : centsToDecimal(rulesDraft.offsetCapCents)} placeholder="Sem limite adicional" /></label><label className="finance-checkbox"><input name="creditCarryover" type="checkbox" defaultChecked={rulesDraft.creditCarryover} /> Permitir crédito excedente</label><button className="primary-button" disabled={busy}>Salvar regras</button></form></section>}
      {section === 'provider' && <section className="finance-panel"><PanelHeading title="Configuração de pagamentos" detail="Nenhum dado bancário ou segredo é armazenado nesta tela." /><div className="finance-provider-card"><span className="finance-provider-state">{provider?.available ? 'Gateway configurado' : 'Gateway não configurado'}</span><strong>Provider: {provider?.provider || 'unconfigured'} · Ambiente: {provider?.environment || 'sandbox'}</strong><p>{provider?.available ? 'O provider informa que está pronto para criar pagamentos.' : 'Pix, boleto e cartão permanecem indisponíveis até configurar credenciais oficiais no secret manager.'}</p><div className="finance-provider-methods"><span>Pix: {provider?.methods?.pix ? 'Ativo' : 'Indisponível'}</span><span>Boleto: {provider?.methods?.boleto ? 'Ativo' : 'Indisponível'}</span><span>Cartão: {provider?.methods?.card ? 'Ativo' : 'Indisponível'}</span><span>Repasse automático: {provider?.automaticPayoutEnabled && provider?.payoutDestinationConfigured ? 'Ativo' : 'Aguardando configuração segura'}</span></div><p className="finance-provider-note">O repasse transfere o valor líquido após PAYMENT_RECEIVED. A conta bancária só é mantida no secret manager e configurada na conta Asaas.</p></div></section>}
      {section === 'ledger' && <section className="finance-panel"><PanelHeading title="Histórico financeiro" detail="Eventos de cobrança, pagamento, bloqueio e alterações de regras." />{ledger.length ? <Rows rows={ledger} columns={['createdAt', 'action', 'entityType', 'entityId', 'amountCents', 'actorName']} labels={['Data', 'Evento', 'Tipo', 'Referência', 'Valor', 'Autor']} render={{ createdAt: date, amountCents: (value) => value == null ? '—' : money(value) }} /> : <Empty>Nenhuma movimentação registrada.</Empty>}</section>}
      {section === 'settings' && <section className="finance-panel"><PanelHeading title="Configurações globais" detail="Segredos ficam somente em variáveis de ambiente/secret manager." /><div className="finance-settings-list"><span>Moeda operacional<strong>{rules?.currency || 'BRL'}</strong></span><span>Conta recebedora<strong>Pendente no onboarding do gateway</strong></span><span>Confirmação de pagamento<strong>Webhook assinado e idempotente</strong></span><span>Job de cobrança<strong>Endpoint diário protegido por CRON_SECRET</strong></span></div></section>}
    </>}

    {editingPlan && <div className="finance-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="finance-plan-title" onMouseDown={(event) => event.target === event.currentTarget && setEditingPlan(null)}><section className="finance-modal"><header><div><p className="eyebrow">CONFIGURAÇÃO COMERCIAL</p><h2 id="finance-plan-title">{editingPlan.id ? 'Editar plano' : 'Novo plano'}</h2></div><button type="button" className="finance-icon-button" onClick={() => setEditingPlan(null)} aria-label="Fechar">×</button></header><form onSubmit={submitPlan}><div className="finance-modal-grid"><label className="finance-field">Nome<input required maxLength="100" name="name" defaultValue={editingPlan.name} /></label><label className="finance-field">Período<select name="billingPeriod" defaultValue={editingPlan.billingPeriod}><option value="monthly">Mensal</option><option value="annual">Anual</option><option value="both">Mensal e anual</option></select></label><label className="finance-field finance-field-wide">Descrição<textarea name="description" maxLength="500" rows="2" defaultValue={editingPlan.description} /></label>{MONEY_FIELDS.map(([name, label]) => <label className="finance-field" key={name}>{label} {name === 'discountPercent' ? '(%)' : '(R$)'}<input name={name} type="number" min="0" max={name === 'discountPercent' ? '100' : undefined} step="0.01" required defaultValue={editingPlan[name]} /></label>)}<RuleNumber name="includedStudents" label="Alunos incluídos" value={editingPlan.includedStudents} min="0" max="100000" /><RuleNumber name="includedTeachers" label="Professores incluídos" value={editingPlan.includedTeachers} min="0" max="10000" /><RuleNumber name="platformFeePercent" label="Taxa plataforma (%)" value={editingPlan.platformFeePercent} min="0" max="100" step="0.01" /><RuleNumber name="dueDay" label="Dia de vencimento" value={editingPlan.dueDay} min="1" max="28" /><RuleNumber name="noticeDays" label="Aviso (dias)" value={editingPlan.noticeDays} min="0" max="90" /><RuleNumber name="graceDays" label="Tolerância (dias)" value={editingPlan.graceDays} min="0" max="90" /><RuleNumber name="restrictAfterDays" label="Restrição após (dias)" value={editingPlan.restrictAfterDays} min="0" max="365" /><RuleNumber name="blockAfterDays" label="Bloqueio após (dias)" value={editingPlan.blockAfterDays} min="0" max="365" /><label className="finance-checkbox"><input name="allowStudentRevenueOffset" type="checkbox" defaultChecked={editingPlan.allowStudentRevenueOffset} /> Abater receita elegível dos alunos</label><RuleNumber name="offsetPercent" label="Abatimento (%)" value={editingPlan.offsetPercent} min="0" max="100" step="0.01" /><label className="finance-field">Teto de abatimento (R$)<input name="offsetCap" type="number" min="0" step="0.01" defaultValue={editingPlan.offsetCap} /></label></div><footer><button type="button" className="outline-button" onClick={() => setEditingPlan(null)}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar plano'}</button></footer></form></section></div>}
  </div>;
}

function Metric({ label, value, tone }) { return <article className={`finance-metric ${tone || ''}`}><span>{label}</span><strong>{value}</strong></article>; }
function Empty({ children }) { return <div className="finance-empty">{children}</div>; }
function PanelHeading({ title, detail, action }) { return <header className="finance-panel-heading"><div><h2>{title}</h2><p>{detail}</p></div>{action}</header>; }
function Status({ value }) { return <span className={`finance-status ${String(value).toLowerCase()}`}>{String(value).replaceAll('_', ' ')}</span>; }
function RuleNumber({ name, label, value, min, max, step = '1' }) { return <label className="finance-field">{label}<input name={name} type="number" min={min} max={max} step={step} required defaultValue={value ?? 0} /></label>; }
function Rows({ rows, columns, labels, render = {} }) { return <div className="finance-table-wrap"><table className="finance-table"><thead><tr>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{columns.map((column) => <td key={column}>{render[column] ? render[column](row[column], row) : row[column] ?? '—'}</td>)}</tr>)}</tbody></table></div>; }