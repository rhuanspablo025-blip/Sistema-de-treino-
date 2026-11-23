'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './mascot.module.css';

export default function AtlasGorilla3D() {
  const host = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let generation = 0,
      stop;
    function update() {
      const current = ++generation;
      stop?.();
      setReady(false);
      if (reduced.matches || navigator.connection?.saveData) return;
      // Keep the GPU available for the opening while its modal covers the login.
      if (document.querySelector('.forge-opening[open]')) return;
      import('./mascot-scene')
        .then(({ mountMascot }) => {
          if (current === generation)
            stop = mountMascot(
              host.current,
              () => setReady(true),
              () => setReady(false),
            );
        })
        .catch(() => {
          if (current === generation) setReady(false);
        });
    }
    let opening = Boolean(document.querySelector('.forge-opening[open]'));
    const observer = new MutationObserver(() => {
      const active = Boolean(document.querySelector('.forge-opening[open]'));
      if (active !== opening) {
        opening = active;
        update();
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    reduced.addEventListener('change', update);
    update();
    return () => {
      generation++;
      stop?.();
      observer.disconnect();
      reduced.removeEventListener('change', update);
    };
  }, []);
  return (
    <div className={styles.stage} data-ready={ready} aria-hidden="true">
      <div ref={host} className={styles.canvas} />
    </div>
  );
}
