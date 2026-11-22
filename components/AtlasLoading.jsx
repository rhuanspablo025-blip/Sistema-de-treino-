'use client';

import { useEffect, useRef, useState } from 'react';
import ForgeStage from './forge/ForgeStage';
import { getVisualLoadingProgress } from '../lib/loading-progress.mjs';
import { waitingState } from '../lib/forge-experience.mjs';

export default function AtlasLoading({
  label = 'Carregando o Atlas Fit',
  detail = 'Preparando sua experiência de treino.',
  variant = 'fullscreen',
  error = '',
  onRetry,
}) {
  const [elapsed, setElapsed] = useState(0);
  const track = useRef(null);
  useEffect(() => {
    setElapsed(0);
    if (error) return;
    const began = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - began), 420);
    return () => clearInterval(timer);
  }, [error, label]);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // Let the last glint finish over the incoming view without delaying its mount.
    return () => {
      if (
        el.isConnected ||
        !el.dataset.left ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const glint = document.createElement('i');
      glint.className = 'forge-complete';
      glint.style.left = el.dataset.left;
      glint.style.top = el.dataset.top;
      glint.style.width = el.dataset.width;
      document.body.appendChild(glint);
      setTimeout(() => glint.remove(), 190);
    };
  }, [error]);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    function locate() {
      const { left, top, width } = el.getBoundingClientRect();
      Object.assign(el.dataset, { left: left + 'px', top: top + 'px', width: width + 'px' });
    }
    locate();
    const observer = new ResizeObserver(locate);
    observer.observe(el);
    return () => observer.disconnect();
  }, [error]);
  const state = waitingState(elapsed, error);
  const failed = state === 'error',
    timedOut = state === 'timeout';
  const title = failed
    ? 'Não foi possível carregar'
    : timedOut
      ? 'A resposta está demorando'
      : label;
  const message =
    error ||
    (timedOut
      ? 'Você pode tentar carregar esta tela novamente.'
      : state === 'slow'
        ? 'A conexão está demorando. Aguardando os dados…'
        : detail);
  return (
    <section
      className={'forge-loading' + (variant === 'inline' ? ' forge-inline' : '')}
      aria-label={title}
    >
      <ForgeStage still={failed || timedOut} />
      <div className="forge-readout">
        {!failed && !timedOut && (
          <div className="forge-track" ref={track} aria-hidden="true">
            <i style={{ width: getVisualLoadingProgress(elapsed) + '%' }} />
          </div>
        )}
        <div role={failed ? 'alert' : 'status'} aria-live="polite">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
        {(failed || timedOut) && (
          <button
            type="button"
            className="forge-retry"
            onClick={failed && onRetry ? onRetry : () => location.reload()}
          >
            Tentar novamente
          </button>
        )}
      </div>
    </section>
  );
}
