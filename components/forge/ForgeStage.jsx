'use client';

import { useEffect, useRef, useState } from 'react';

export default function ForgeStage({ intro = false, still = false, onReady, onTime, onFailure }) {
  const host = useRef(null),
    callbacks = useRef({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    callbacks.current = { onReady, onTime, onFailure };
  }, [onReady, onTime, onFailure]);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stopped = false,
      dispose,
      timer;
    const fail = () => {
      if (!stopped) {
        setReady(false);
        callbacks.current.onFailure?.();
      }
    };
    const stopMotion = () => {
      if (motion.matches) {
        dispose?.();
        fail();
      }
    };
    setReady(false);
    if (still || motion.matches || navigator.connection?.saveData) {
      fail();
      return;
    }
    // Fast routes finish before fetching the graphics engine.
    timer = setTimeout(
      async () => {
        try {
          const { mountStudio } = await import('./studio');
          if (stopped || motion.matches) return;
          dispose = mountStudio(host.current, {
            intro,
            onReady: () => {
              setReady(true);
              callbacks.current.onReady?.();
            },
            onTime: (t) => callbacks.current.onTime?.(t),
            onFailure: fail,
          });
        } catch {
          fail();
        }
      },
      intro ? 0 : 220,
    );
    motion.addEventListener('change', stopMotion);
    return () => {
      stopped = true;
      clearTimeout(timer);
      dispose?.();
      motion.removeEventListener('change', stopMotion);
    };
  }, [intro, still]);
  return (
    <div aria-hidden="true" className={'forge-stage' + (ready ? ' is-ready' : '')}>
      <div className="forge-render" ref={host} />
    </div>
  );
}
