'use client';

import AuthShell from '../../components/AuthShell';

export default function ForgotPasswordPage() {
  return <AuthShell>
    <section className="login-card">
      <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
      <h1>Redefinir senha</h1>
      <p className="login-copy">Peça a um administrador da academia para redefinir sua senha.</p>
      <div className="login-links"><a href="/login">Voltar ao login</a></div>
    </section>
  </AuthShell>;
}
