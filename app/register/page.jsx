'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthShell from '../../components/AuthShell';
import './register.css';

const steps = ['Perfil', 'Identidade', 'E-mail', 'Celular', 'Senha', 'Configuração', 'Concluir'];
const initial = { role: '', fullName: '', username: '', cpf: '', email: '', phone: '', password: '', confirmPassword: '', studentMode: '', specialty: '', professionalRegistration: '', studentGoal: '' };

async function requestJson(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta etapa.');
  return result;
}

function cpfLooksComplete(value) { return value.replace(/\D/g, '').length === 11; }

export default function RegisterPage() {
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState(1);
  const [challengeId, setChallengeId] = useState({ EMAIL: '', PHONE: '' });
  const [code, setCode] = useState({ EMAIL: '', PHONE: '' });
  const [verified, setVerified] = useState({ EMAIL: false, PHONE: false });
  const [cpfProof, setCpfProof] = useState('');
  const [cpfStatus, setCpfStatus] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('atlasfit.identity-draft') || '{}');
      setForm((current) => ({ ...current, role: saved.role || '', fullName: saved.fullName || '', username: saved.username || '', studentMode: saved.studentMode || '' }));
      if (Number.isInteger(saved.step) && saved.step > 0 && saved.step < 8) setStep(saved.step);
    } catch { /* Ignore an invalid or unavailable draft. */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('atlasfit.identity-draft', JSON.stringify({ role: form.role, fullName: form.fullName, username: form.username, studentMode: form.studentMode, step })); } catch { /* Storage is optional. */ }
  }, [form.role, form.fullName, form.username, form.studentMode, step]);

  const strength = useMemo(() => {
    const password = form.password;
    return [password.length >= 12, /[a-z]/i.test(password), /\d/.test(password), /[^a-z\d]/i.test(password)].filter(Boolean).length;
  }, [form.password]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (name === 'cpf' || name === 'fullName') { setCpfProof(''); setCpfStatus(''); }
    if (name === 'email') { setVerified((v) => ({ ...v, EMAIL: false })); setChallengeId((v) => ({ ...v, EMAIL: '' })); setCode((v) => ({ ...v, EMAIL: '' })); }
    if (name === 'phone') { setVerified((v) => ({ ...v, PHONE: false })); setChallengeId((v) => ({ ...v, PHONE: '' })); setCode((v) => ({ ...v, PHONE: '' })); }
  }

  function validateStep() {
    if (step === 1 && !form.role) return 'Escolha Personal ou Aluno.';
    if (step === 2) {
      if (form.fullName.trim().length < 2) return 'Informe seu nome completo.';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]$/.test(form.username.trim())) return 'Use um usuário de 3 a 30 caracteres, sem espaços.';
      if (!cpfLooksComplete(form.cpf)) return 'Informe os 11 dígitos do CPF.';
      if (!cpfProof) return 'Confirme o CPF no provedor de identidade.';
    }
    if (step === 3 && !verified.EMAIL) return 'Confirme o e-mail com o código enviado.';
    if (step === 4 && !verified.PHONE) return 'Confirme o celular com o código enviado.';
    if (step === 5) {
      if (strength < 4) return 'A senha precisa ter 12 caracteres, letra, número e símbolo.';
      if (form.password !== form.confirmPassword) return 'As senhas não conferem.';
    }
    if (step === 6 && form.role === 'ALUNO' && !form.studentMode) return 'Escolha como deseja treinar.';
    if (step === 7 && (!accepted || !deviceAuthorized)) return 'Aceite os termos e confirme este dispositivo.';
    return '';
  }

  function next() {
    const message = validateStep();
    if (message) { setError(message); return; }
    setError(''); setNotice(''); setStep((current) => Math.min(7, current + 1));
  }

  async function sendCode(purpose) {
    const destination = purpose === 'EMAIL' ? form.email : form.phone;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestJson('/api/identity/challenges', { purpose, destination });
      setChallengeId((value) => ({ ...value, [purpose]: result.id }));
      setVerified((value) => ({ ...value, [purpose]: false }));
      setNotice(`Código enviado. Expira em ${purpose === 'EMAIL' ? '10' : '5'} minutos.`);
    } catch (sendError) { setError(sendError.message); }
    finally { setBusy(false); }
  }

  async function verifyCpf() {
    setBusy(true); setError(''); setNotice(''); setCpfStatus('Verificando…'); setCpfProof('');
    try {
      const result = await requestJson('/api/identity/cpf/verify', { cpf: form.cpf, fullName: form.fullName });
      setCpfProof(result.verificationId); setCpfStatus('Identidade confirmada pelo provedor.');
    } catch (verifyError) { setCpfStatus(''); setError(verifyError.message); }
    finally { setBusy(false); }
  }

  async function verifyCode(purpose) {
    setBusy(true); setError(''); setNotice('');
    try {
      await requestJson('/api/identity/challenges/verify', { purpose, destination: purpose === 'EMAIL' ? form.email : form.phone, challengeId: challengeId[purpose], code: code[purpose] });
      setVerified((value) => ({ ...value, [purpose]: true }));
      setNotice(purpose === 'EMAIL' ? 'E-mail confirmado.' : 'Celular confirmado.');
    } catch (verifyError) { setError(verifyError.message); }
    finally { setBusy(false); }
  }

  async function finish() {
    const message = validateStep();
    if (message) { setError(message); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestJson('/api/identity/register', {
        ...form,
        cpfVerificationId: cpfProof,
        emailChallengeId: challengeId.EMAIL,
        phoneChallengeId: challengeId.PHONE,
        termsAccepted: accepted,
        initialDeviceAuthorized: deviceAuthorized,
        profile: { specialty: form.specialty, professionalRegistration: form.professionalRegistration, studentGoal: form.studentGoal },
      });
      setComplete(true); setNotice(result.message || 'Conta criada.');
      sessionStorage.removeItem('atlasfit.identity-draft');
    } catch (finishError) { setError(finishError.message); }
    finally { setBusy(false); }
  }

  const field = (label, name, props = {}) => <label className="identity-field" key={name}>{label}<input value={form[name]} onChange={(event) => update(name, event.target.value)} {...props} /></label>;
  const verification = (purpose) => <div className="identity-verify" key={purpose}>
    <button type="button" className="identity-secondary" disabled={busy || (purpose === 'EMAIL' ? !form.email : !form.phone)} onClick={() => sendCode(purpose)}>{challengeId[purpose] ? 'Reenviar código' : 'Enviar código'}</button>
    {challengeId[purpose] && <div className="identity-code-row"><input aria-label="Código de confirmação" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code[purpose]} onChange={(event) => setCode((value) => ({ ...value, [purpose]: event.target.value.replace(/\D/g, '').slice(0, 6) }))} /><button type="button" className="identity-secondary" disabled={busy || code[purpose].length !== 6} onClick={() => verifyCode(purpose)}>{verified[purpose] ? 'Confirmado ✓' : 'Validar código'}</button></div>}
  </div>;

  return <AuthShell><section className="identity-register">
    <header className="identity-heading"><span className="identity-kicker">ATLASFIT · NOVA CONTA</span><h1>{complete ? 'Sua jornada começa agora.' : 'Treino com identidade.'}</h1><p>{complete ? 'Cadastro concluído com contatos verificados.' : 'Um cadastro seguro, em etapas claras e no seu ritmo.'}</p></header>
    {!complete && <>
      <nav className="identity-progress" aria-label="Etapas do cadastro">{steps.map((label, index) => <button type="button" key={label} className={index + 1 === step ? 'is-current' : index + 1 < step ? 'is-done' : ''} onClick={() => { if (index + 1 < step) setStep(index + 1); }} aria-current={index + 1 === step ? 'step' : undefined}><span>{index + 1 < step ? '✓' : `0${index + 1}`}</span><small>{label}</small></button>)}</nav>
      <div className="identity-panel" key={step}>
        <div className="identity-panel-top"><span>ETAPA 0{step} / 07</span><span>{steps[step - 1]}</span></div>
        {step === 1 && <div className="identity-choice"><button type="button" className={form.role === 'PERSONAL' ? 'selected' : ''} onClick={() => update('role', 'PERSONAL')}><span className="identity-choice-icon">↗</span><strong>Sou Personal</strong><small>Gerencie alunos e prescreva treinos.</small></button><button type="button" className={form.role === 'ALUNO' ? 'selected' : ''} onClick={() => update('role', 'ALUNO')}><span className="identity-choice-icon">◎</span><strong>Sou Aluno</strong><small>Acompanhe sua evolução e seus treinos.</small></button></div>}
        {step === 2 && <div className="identity-fields">{field('Nome completo', 'fullName', { autoComplete: 'name', maxLength: 120, placeholder: 'Como devemos chamar você?' })}{field('Nome de usuário', 'username', { autoComplete: 'username', maxLength: 30, placeholder: 'seu_usuario' })}{field('CPF', 'cpf', { inputMode: 'numeric', autoComplete: 'off', maxLength: 14, placeholder: '000.000.000-00', onChange: (event) => update('cpf', event.target.value.replace(/[^\d.-]/g, '').slice(0, 14)) })}<small className="identity-hint">Seu CPF é criptografado e usado apenas para proteger sua identidade.</small><button type="button" className="identity-secondary" disabled={busy || !cpfLooksComplete(form.cpf) || form.fullName.trim().length < 2} onClick={verifyCpf}>{cpfProof ? 'CPF confirmado ✓' : 'Validar dados do CPF'}</button>{cpfStatus && <small className="identity-hint" role="status">{cpfStatus}</small>}</div>}
        {step === 3 && <div className="identity-fields">{field('E-mail', 'email', { type: 'email', autoComplete: 'email', placeholder: 'voce@exemplo.com' })}{verification('EMAIL')}</div>}
        {step === 4 && <div className="identity-fields">{field('Celular com DDD', 'phone', { type: 'tel', autoComplete: 'tel', placeholder: '(11) 98765-4321' })}{verification('PHONE')}</div>}
        {step === 5 && <div className="identity-fields">{field('Crie sua senha', 'password', { type: 'password', autoComplete: 'new-password', maxLength: 128 })}<div className="identity-strength" aria-label={`Força da senha: ${strength} de 4`}><span style={{ '--strength': strength }} /><small>{['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength]}</small></div>{field('Confirme sua senha', 'confirmPassword', { type: 'password', autoComplete: 'new-password', maxLength: 128 })}<small className="identity-hint">Mínimo de 12 caracteres, com letras, números e símbolos.</small></div>}
        {step === 6 && <div className="identity-fields">{form.role === 'PERSONAL' ? <>{field('Especialidade', 'specialty', { placeholder: 'Ex.: musculação, funcional', maxLength: 120 })}{field('Registro profissional (opcional)', 'professionalRegistration', { placeholder: 'CREF', maxLength: 80 })}<small className="identity-hint">Você poderá completar os dados profissionais depois.</small></> : <><label className="identity-field">Como deseja treinar?<select value={form.studentMode} onChange={(event) => update('studentMode', event.target.value)}><option value="">Selecione uma modalidade</option><option value="INDEPENDENT">Aluno independente</option><option value="LINKED">Com um Personal</option></select></label>{field('Seu objetivo (opcional)', 'studentGoal', { placeholder: 'O que deseja alcançar?', maxLength: 240 })}</>}</div>}
        {step === 7 && <div className="identity-consents"><p>Revise e confirme para proteger sua conta desde o primeiro acesso.</p><label><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Li e aceito os termos de uso e a política de privacidade.</label><label><input type="checkbox" checked={deviceAuthorized} onChange={(event) => setDeviceAuthorized(event.target.checked)} /> Reconheço este navegador como o dispositivo usado no meu cadastro.</label><small>Novos dispositivos poderão exigir uma confirmação adicional. Seus dados de identidade são protegidos por criptografia.</small></div>}
        {error && <p className="identity-error" role="alert">{error}</p>}{notice && <p className="identity-notice" role="status">{notice}</p>}
        <footer className="identity-actions">{step > 1 && <button type="button" className="identity-back" onClick={() => { setError(''); setNotice(''); setStep((current) => current - 1); }}>Voltar</button>}{step < 7 ? <button type="button" className="identity-next" onClick={next}>Continuar <span>→</span></button> : <button type="button" className="identity-next" disabled={busy} onClick={finish}>{busy ? 'Criando conta…' : 'Criar minha conta'} <span>→</span></button>}</footer>
      </div>
    </>}
    {complete && <div className="identity-panel identity-success"><span className="identity-success-mark">✓</span><p>{notice}</p><a className="identity-next identity-login-link" href="/login">Ir para o login <span>→</span></a></div>}
    <div className="identity-login-foot">Já tem uma conta? <a href="/login">Entrar</a></div>
  </section></AuthShell>;
}
