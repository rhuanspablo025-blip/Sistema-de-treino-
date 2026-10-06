'use client';

import { useEffect, useState } from 'react';
import './billing.css';

function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function date(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

export default function BillingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [checkouts, setCheckouts] = useState({});
  const [copiedInvoiceId, setCopiedInvoiceId] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/finance/my-account').then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar suas cobranças.');
      if (active) {
        setData(body);
        setCheckouts(Object.fromEntries((body.invoices || []).filter((invoice) => invoice.activeCheckout).map((invoice) => [invoice.id, invoice.activeCheckout])));
      }
    }).catch((loadError) => {
      if (active) setError(loadError.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function startPayment(invoice, method) {
    setAction(`${invoice.id}:${method}`);
    setError('');
    try {
      const response = await fetch('/api/finance/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, method, cpfCnpj }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Pagamento não disponível.');
      setCheckouts((current) => ({ ...current, [invoice.id]: body.checkout }));
    } catch (paymentError) { setError(paymentError.message); }
    finally { setAction(''); }
  }

  async function copyPix(invoiceId, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedInvoiceId(invoiceId);
      window.setTimeout(() => setCopiedInvoiceId(''), 1500);
    } catch { setError('Não foi possível copiar o Pix neste navegador.'); }
  }

  const access = data?.access;
  const methods = data?.provider?.available ? data.provider.methods || {} : {};
  const onlineAvailable = Object.values(methods).some(Boolean);
  const taxDigits = cpfCnpj.replace(/\D/g, '').length;
  const canStartPayment = !data?.customerSetup?.requiresTaxId || taxDigits === 11 || taxDigits === 14;
  const invoices = data?.invoices || [];

  return <main className="billing-page">
    <header className="billing-topbar"><a href="/" className="billing-brand">atlas<span>.</span></a><a href="/" className="outline-button">Voltar ao sistema</a></header>
    <section className="billing-content">
      <p className="eyebrow">FINANCEIRO DA CONTA</p>
      <h1>{access?.blocked ? 'Seu acesso está temporariamente restrito' : 'Pagamentos e cobranças'}</h1>
      <p className="billing-intro">{access?.reason || 'Consulte suas cobranças e o status da assinatura.'}</p>
      {error && <div className="billing-error" role="alert">{error}</div>}
      {loading ? <div className="billing-state">Carregando cobranças...</div> : invoices.length === 0 ? <div className="billing-state"><strong>Nenhuma cobrança disponível</strong><span>O proprietário do sistema ainda não emitiu uma fatura para sua conta.</span></div> : <div className="billing-invoices">
        {invoices.map((invoice) => <article className="billing-invoice" key={invoice.id}>
          <header><div><small>{invoice.planName} · {invoice.periodKey}</small><h2>{money(invoice.finalAmountCents)}</h2></div><span className={`billing-status ${String(invoice.status).toLowerCase()}`}>{invoice.status.replaceAll('_', ' ')}</span></header>
          <div className="billing-invoice-meta"><span>Vencimento<strong>{date(invoice.dueAt)}</strong></span><span>Aluno excedente<strong>{money(invoice.extraStudentCents)}</strong></span><span>Taxas e juros<strong>{money((invoice.platformFeeCents || 0) + (invoice.lateFeeCents || 0) + (invoice.interestCents || 0))}</strong></span><span>Abatimento<strong>{money(invoice.appliedOffsetCents)}</strong></span></div>
          {data?.customerSetup?.requiresTaxId && ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'].includes(invoice.status) && <label className="billing-tax-id">CPF ou CNPJ<input autoComplete="off" inputMode="numeric" maxLength="18" value={cpfCnpj} onChange={(event) => setCpfCnpj(event.target.value)} placeholder="Documento do pagador" /></label>}
          {['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'].includes(invoice.status) && <div className="billing-methods"><button disabled={!methods.pix || !canStartPayment || action === `${invoice.id}:PIX`} onClick={() => startPayment(invoice, 'PIX')}>Pix</button><button disabled={!methods.card || !canStartPayment || action === `${invoice.id}:CARD`} onClick={() => startPayment(invoice, 'CARD')}>Cartão</button><button disabled={!methods.boleto || !canStartPayment || action === `${invoice.id}:BOLETO`} onClick={() => startPayment(invoice, 'BOLETO')}>Boleto</button></div>}
          {checkouts[invoice.id] && <PaymentCheckout checkout={checkouts[invoice.id]} invoiceId={invoice.id} copied={copiedInvoiceId === invoice.id} onCopy={copyPix} />}
        </article>)}
      </div>}
      {!onlineAvailable && <p className="billing-provider-note">Pagamento online ainda não configurado. Entre em contato com o proprietário; nenhum boleto ou QR Code fictício será exibido.</p>}
      <section className="billing-history"><h2>Histórico</h2>{invoices.length ? invoices.map((invoice) => <div key={`history-${invoice.id}`}><span>{invoice.planName} · {invoice.periodKey}</span><strong>{money(invoice.finalAmountCents)}</strong><small>{invoice.status} · vencimento {date(invoice.dueAt)}</small></div>) : <p>Sem pagamentos anteriores.</p>}</section>
    </section>
  </main>;
}

function PaymentCheckout({ checkout, invoiceId, copied, onCopy }) {
  const details = checkout.checkout || {};
  return <section className="billing-checkout" aria-live="polite">
    <strong>{checkout.method === 'PIX' ? 'Pix' : checkout.method === 'BOLETO' ? 'Boleto' : 'Checkout seguro'} · {checkout.status}</strong>
    {details.expiresAt && <span>Válido até {date(details.expiresAt)}</span>}
    {checkout.method === 'PIX' && details.pixQrCodeDataUrl && <img className="billing-pix-qr" src={details.pixQrCodeDataUrl} alt="QR Code Pix" />}
    {checkout.method === 'PIX' && details.pixCopyPaste && <><textarea readOnly value={details.pixCopyPaste} aria-label="Pix Copia e Cola" /><button onClick={() => onCopy(invoiceId, details.pixCopyPaste)}>{copied ? 'Copiado' : 'Copiar Pix'}</button></>}
    {checkout.method === 'BOLETO' && details.boletoLine && <p className="billing-boleto-line">{details.boletoLine}</p>}
    {checkout.method === 'BOLETO' && details.boletoUrl && <a href={details.boletoUrl} target="_blank" rel="noreferrer">Baixar / visualizar boleto</a>}
    {checkout.method === 'CARD' && details.redirectUrl && <a href={details.redirectUrl} target="_blank" rel="noreferrer">Continuar no checkout seguro</a>}
  </section>;
}