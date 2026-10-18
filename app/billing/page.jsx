'use client';

import { useEffect, useState } from 'react';
import './billing.css';

function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function date(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

const statusLabels = { PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando pagamento', OVERDUE: 'Em atraso', PAID: 'Pago', CANCELLED: 'Cancelado', BLOCKED: 'Bloqueado', REFUNDED: 'Estornado' };

export default function BillingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/finance/my-account').then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar suas cobranças.');
      if (active) setData(body);
    }).catch((loadError) => {
      if (active) setError(loadError.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const invoices = data?.invoices || [];
  const accessBlocked = data?.access?.blocked || data?.access?.restricted;

  return <main className="billing-page">
    <header className="billing-topbar"><a href="/" className="billing-brand">atlas<span>.</span></a>{!accessBlocked && <a href="/" className="outline-button">Voltar ao sistema</a>}</header>
    <section className="billing-content">
      <p className="eyebrow">FINANCEIRO DA CONTA</p>
      <h1>{accessBlocked ? 'Acesso suspenso' : 'Plano e pagamentos'}</h1>
      <p className="billing-intro">Os pagamentos são confirmados manualmente pela administração. Após pagar, fale com o responsável para confirmar a baixa e liberar o acesso.</p>
      {error && <div className="billing-error" role="alert">{error}</div>}
      {accessBlocked && <div className="billing-provider-note">{data?.access?.reason || 'O acesso foi suspenso por inadimplência.'} Entre em contato com a administração da academia para regularizar.</div>}
      {loading ? <div className="billing-state">Carregando dados da conta...</div> : invoices.length === 0 ? <div className="billing-state"><strong>Nenhuma cobrança disponível</strong><span>A administração ainda não registrou cobranças para esta conta.</span></div> : <div className="billing-invoices">
        {invoices.map((invoice) => <article className="billing-invoice" key={invoice.id}>
          <header><div><small>{invoice.planName} · {invoice.periodKey}</small><h2>{money(invoice.finalAmountCents)}</h2></div><span className={`billing-status ${String(invoice.status).toLowerCase()}`}>{statusLabels[invoice.status] || invoice.status}</span></header>
          <div className="billing-invoice-meta"><span>Vencimento<strong>{date(invoice.dueAt)}</strong></span><span>Status<strong>{statusLabels[invoice.status] || invoice.status}</strong></span><span>Pagamento<strong>{date(invoice.paidAt)}</strong></span><span>Plano<strong>{invoice.planName}</strong></span></div>
        </article>)}
      </div>}
      <section className="billing-history"><h2>Histórico de cobranças</h2>{invoices.length ? invoices.map((invoice) => <div key={`history-${invoice.id}`}><span>{invoice.planName} · {invoice.periodKey}</span><strong>{money(invoice.finalAmountCents)}</strong><small>{statusLabels[invoice.status] || invoice.status} · vencimento {date(invoice.dueAt)}</small></div>) : <p>Sem cobranças registradas.</p>}</section>
    </section>
  </main>;
}
