import Image from 'next/image';
import mascot from '../public/brand/atlasfit-mascot.jpeg';
import atlasfitLogo from '../public/brand/atlasfit-logo-horizontal.jpeg';
import webplusLogo from '../public/brand/webplus-logo.jpeg';

export default function AuthShell({ children }) {
  return (
    <main className="login-page auth-layout">
      <aside className="auth-showcase" aria-label="AtlasFit">
        <Image src={mascot} alt="Mascote AtlasFit na academia" fill priority sizes="(max-width: 760px) 100vw, 58vw" className="auth-showcase-image" />
        <span className="auth-showcase-vignette" aria-hidden="true" />
      </aside>
      <section className="auth-content">
        <Image className="auth-logo" src={atlasfitLogo} alt="AtlasFit" priority />
        {children}
        <footer className="auth-credit">
          <span>Desenvolvido por</span>
          <Image src={webplusLogo} alt="WebPlus" width={72} height={72} sizes="72px" />
        </footer>
      </section>
    </main>
  );
}
