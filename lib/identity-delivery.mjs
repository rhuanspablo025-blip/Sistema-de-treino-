import { normalizeEmail, normalizeBrazilPhone } from './identity-service.mjs';

async function sendResend({ destination, code, purpose }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.IDENTITY_EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Entrega de e-mail indisponível: configure RESEND_API_KEY e IDENTITY_EMAIL_FROM.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [normalizeEmail(destination)],
      subject: purpose === 'PASSWORD_RECOVERY' ? 'Redefinição de senha AtlasFit' : 'Confirme seu e-mail AtlasFit',
      text: `Seu código AtlasFit é ${code}. Ele expira em 10 minutos. Se você não solicitou este código, ignore esta mensagem.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Provedor de e-mail recusou o envio (${response.status}).`);
}

async function sendTwilioSms({ destination, code }) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } = process.env;
  const phone = normalizeBrazilPhone(destination);
  if (!sid || !token || !from || !phone) throw new Error('Entrega de SMS indisponível: configure as credenciais Twilio e o número remetente.');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: from, Body: `Seu código AtlasFit é ${code}. Ele expira em 5 minutos.` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Provedor SMS recusou o envio (${response.status}).`);
}

export function getChallengeDelivery(purpose) {
  if (purpose === 'EMAIL' || purpose === 'PASSWORD_RECOVERY') return sendResend;
  if (purpose === 'PHONE' || purpose === 'DEVICE' || purpose === 'MFA') return sendTwilioSms;
  throw new Error('Finalidade de verificação não suportada.');
}

export async function sendRelationshipInvite({ destination, personalName, link, code, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.IDENTITY_EMAIL_FROM;
  if (!apiKey || !from) return { status: 'UNAVAILABLE' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [normalizeEmail(destination)], subject: `${personalName} convidou você para o AtlasFit`, text: `Seu Personal ${personalName} enviou um convite. Acesse ${link} ou use o código ${code}. Válido até ${new Date(expiresAt).toLocaleString('pt-BR')}. O vínculo depende da sua confirmação.` }),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.ok ? 'SENT' : 'FAILED' };
}

export async function verifyCpfWithProvider({ cpf, fullName }) {
  const endpoint = process.env.CPF_VERIFICATION_URL;
  const token = process.env.CPF_VERIFICATION_TOKEN;
  if (!endpoint || !token) return { status: 'unavailable', verified: false };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, fullName }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Provedor cadastral indisponível (${response.status}).`);
  const result = await response.json();
  if (typeof result.verified !== 'boolean') throw new Error('Resposta inválida do provedor cadastral.');
  return { status: result.verified ? 'verified' : 'rejected', verified: result.verified };
}
