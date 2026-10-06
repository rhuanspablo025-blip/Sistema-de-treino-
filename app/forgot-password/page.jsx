'use client';

export default function ForgotPasswordPage() {
  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark"><span className="simple-icon">⌁</span></span><span>atlas<span className="brand-dot">.</span></span></div>
    <section className="login-card">
      <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
      <h1>Redefinir senha</h1>
      <p className="login-copy">Peça a um administrador da academia para redefinir sua senha.</p>
      <div className="login-links"><a href="/login">Voltar ao login</a></div>
    </section>
    <p className="login-footer">Atlas Training · Gestão inteligente de treinos</p>
  </main>;
}
