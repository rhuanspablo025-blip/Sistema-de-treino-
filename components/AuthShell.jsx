import Image from 'next/image';
import mascot from '../public/brand/atlas-coach.webp';
import wordmark from '../public/forge/atlasfit.webp';
import styles from './auth/mascot.module.css';
import atlasfitLogo from '../public/brand/atlasfit-logo-horizontal.jpeg';
import webplusLogo from '../public/brand/webplus-logo.jpeg';

export default function AuthShell({ children, showcase }) {
  return (
    <main className="login-page auth-layout">
      <aside className={`auth-showcase ${styles.showcase}`} aria-label="AtlasFit">
        <Image src={mascot} alt="Gorila mascote do AtlasFit sorrindo e acenando" fill priority sizes="(max-width: 760px) 100vw, 58vw" className={`auth-showcase-image ${styles.poster}`} />
        <span className="auth-showcase-vignette" aria-hidden="true" />
        {showcase}
        <img className={styles.mark} src={wordmark.src} alt="" />
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
