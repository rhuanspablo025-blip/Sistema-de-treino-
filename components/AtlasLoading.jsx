'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import atlasfitSymbol from '../public/brand/atlasfit-symbol.jpeg';

/**
 * Shared loading state. It never invents progress percentages: it stays visible
 * while the calling screen waits for its own required data.
 */
export default function AtlasLoading({
  label = 'Preparando sua experiência',
  detail = 'Conectando ao Atlas Fit e organizando seus dados.',
  variant = 'fullscreen',
  error = '',
  onRetry,
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    if (error) return undefined;
    const timer = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(timer);
  }, [error, label]);

  const failed = Boolean(error);

  return (
    <section
      className={`atlas-loading ${variant === 'inline' ? 'atlas-loading--inline' : ''} ${failed ? 'atlas-loading--error' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={!failed}
    >
      <div className="atlas-loading__light" aria-hidden="true" />
      <div className="atlas-loading__content">
        <div className="atlas-loading__emblem">
          <Image src={atlasfitSymbol} alt="" width={80} height={80} sizes="80px" priority />
          {!failed && <span className="atlas-loading__orbit" aria-hidden="true" />}
        </div>
        <p className="atlas-loading__kicker">ATLASFIT · PLATAFORMA DE TREINOS</p>
        <h2 className="atlas-loading__title">{failed ? 'Não foi possível carregar' : label}</h2>
        <p className="atlas-loading__detail">{failed ? error : slow ? 'A conexão está demorando mais que o normal. Continuamos tentando.' : detail}</p>
        {failed ? (
          onRetry && <button type="button" className="atlas-loading__retry" onClick={onRetry}>Tentar novamente</button>
        ) : (
          <div className="atlas-loading__track" aria-hidden="true"><span /></div>
        )}
        <p className="atlas-loading__signature">MONTE <span>·</span> ACOMPANHE <span>·</span> EVOLUA</p>
      </div>
    </section>
  );
}
