'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import atlasfitLogo from '../public/brand/atlasfit-logo-horizontal.jpeg';
import atlasfitSymbol from '../public/brand/atlasfit-symbol.jpeg';
import webplusLogo from '../public/brand/webplus-logo.jpeg';
import { getVisualLoadingProgress } from '../lib/loading-progress.mjs';

const LOADING_TICK_MS = 420;
const SLOW_CONNECTION_MS = 7000;

/**
 * A lightweight CSS-3D barbell built from individual elements.
 * Visual progress is intentionally capped before completion: there is no
 * trustworthy byte-level progress value for the page's API requests.
 * The caller unmounts this component only when the required data is ready.
 */
function BarbellScene({ paused }) {
  return (
    <div className={'atlas-barbell' + (paused ? ' atlas-barbell--paused' : '')} aria-hidden="true">
      <span className="atlas-barbell__backlight" />
      <span className="atlas-barbell__floor" />
      <span className="atlas-barbell__rear-weight">
        <span className="atlas-barbell__rear-hub" />
      </span>
      <span className="atlas-barbell__shaft-back" />
      <span className="atlas-barbell__stack">
        {[0, 1, 2, 3].map((index) => (
          <span className={'atlas-barbell__stack-plate atlas-barbell__stack-plate--' + index} key={index}>
            <span />
          </span>
        ))}
      </span>
      <div className="atlas-barbell__front">
        <div className="atlas-barbell__rotor">
          <div className="atlas-barbell__rubber" />
          <div className="atlas-barbell__ring" />
          <div className="atlas-barbell__inner-ring" />
          <span className="atlas-barbell__groove atlas-barbell__groove--left" />
          <span className="atlas-barbell__groove atlas-barbell__groove--right" />
          <span className="atlas-barbell__groove atlas-barbell__groove--bottom" />
          <div className="atlas-barbell__cutaway" />
          <div className="atlas-barbell__cutline" />
          <div className="atlas-barbell__atlas-logo">
            <Image src={atlasfitLogo} alt="" unoptimized />
          </div>
          <span className="atlas-barbell__weight-label atlas-barbell__weight-label--left">20<small>KG</small></span>
          <span className="atlas-barbell__weight-label atlas-barbell__weight-label--right">20<small>KG</small></span>
          <div className="atlas-barbell__webplus-logo">
            <Image src={webplusLogo} alt="" unoptimized />
          </div>
          <div className="atlas-barbell__socket"><span /></div>
        </div>
      </div>
      <span className="atlas-barbell__shaft-front" />
      <span className="atlas-barbell__collar">
        <span className="atlas-barbell__collar-screw" />
      </span>
      <span className="atlas-barbell__cap">
        <Image src={atlasfitSymbol} alt="" unoptimized />
      </span>
      <span className="atlas-barbell__glow-ring" />
    </div>
  );
}

export default function AtlasLoading({
  label = 'Preparando sua experiência',
  detail = 'Conectando ao Atlas Fit e organizando seus dados.',
  variant = 'fullscreen',
  error = '',
  onRetry,
}) {
  const [elapsed, setElapsed] = useState(0);
  const failed = Boolean(error);

  useEffect(() => {
    setElapsed(0);
    if (failed) return undefined;

    const began = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - began), LOADING_TICK_MS);
    return () => window.clearInterval(timer);
  }, [failed, label]);

  // Only a visual waiting indicator, never an invented completion percentage.
  const visualProgress = getVisualLoadingProgress(elapsed);
  const slow = elapsed >= SLOW_CONNECTION_MS;
  const rootClasses = [
    'atlas-loading',
    variant === 'inline' && 'atlas-loading--inline',
    failed && 'atlas-loading--error',
  ].filter(Boolean).join(' ');

  return (
    <section className={rootClasses} role={failed ? 'alert' : 'status'} aria-live="polite" aria-busy={!failed}>
      <div className="atlas-loading__atmosphere" aria-hidden="true">
        <span className="atlas-loading__beam atlas-loading__beam--a" />
        <span className="atlas-loading__beam atlas-loading__beam--b" />
        <span className="atlas-loading__beam atlas-loading__beam--c" />
        <span className="atlas-loading__rack atlas-loading__rack--left" />
        <span className="atlas-loading__rack atlas-loading__rack--right" />
      </div>
      <div className="atlas-loading__content">
        <BarbellScene paused={failed} />
        <div className="atlas-loading__readout">
          {!failed && (
            <div className="atlas-loading__track" aria-hidden="true">
              <span style={{ width: visualProgress + '%' }} />
            </div>
          )}
          <p className="atlas-loading__kicker">ATLASFIT <span>·</span> WEBPLUS</p>
          <h2 className="atlas-loading__title">
            {failed ? 'Não foi possível carregar' : label}
          </h2>
          <p className="atlas-loading__detail">
            {failed ? error : slow ? 'A conexão está demorando mais que o normal. Continuamos tentando.' : detail}
          </p>
          {failed && onRetry && (
            <button type="button" className="atlas-loading__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          )}
          <div className="atlas-loading__footer" aria-hidden="true">
            <span />
            <span className="atlas-loading__dumbbell">▰━▰</span>
            <span />
          </div>
          <p className="atlas-loading__signature">MONTE <span>·</span> ACOMPANHE <span>·</span> EVOLUA</p>
        </div>
      </div>
    </section>
  );
}
