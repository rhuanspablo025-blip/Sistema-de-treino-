'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canPlayIntro, introPhase, INTRO_VERSION } from '../../lib/forge-experience.mjs';
import ForgeStage from './ForgeStage';
import atlas from '../../public/forge/atlasfit.webp';
import webplus from '../../public/forge/webplus.webp';

const storageKey = 'atlasfit.opening';

export default function ForgeOpening() {
  const [open, setOpen] = useState(false),
    [phase, setPhase] = useState('reveal');
  const dialog = useRef(null),
    lastPhase = useRef('reveal'),
    watchdog = useRef();
  const finish = useCallback(() => {
    clearTimeout(watchdog.current);
    try {
      localStorage.setItem(storageKey, INTRO_VERSION);
    } catch {}
    setOpen(false);
  }, []);
  useLayoutEffect(() => {
    let seen;
    try {
      seen = localStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (
      canPlayIntro({
        seen,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        saveData: navigator.connection?.saveData,
        hasSession: false,
      })
    )
      setOpen(true);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    watchdog.current = setTimeout(finish, 4500);
    return () => clearTimeout(watchdog.current);
  }, [open, finish]);
  const update = (t) => {
    const next = introPhase(t);
    if (next === 'done') {
      finish();
      return;
    }
    if (next !== lastPhase.current) {
      lastPhase.current = next;
      setPhase(next);
    }
  };
  if (!open) return null;
  const words = { monte: 'Monte.', acompanhe: 'Acompanhe.', evolua: 'Evolua.' };
  return (
    <dialog
      ref={dialog}
      className="forge-opening"
      data-phase={phase}
      aria-label="AtlasFit — Forjado para evoluir"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <ForgeStage
        intro
        onTime={update}
        onReady={() => clearTimeout(watchdog.current)}
        onFailure={finish}
      />
      <div className="forge-circuit" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="forge-film-head">
        <img src={atlas.src} alt="AtlasFit" />
        <button type="button" onClick={finish}>
          Pular abertura <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="forge-caption">
        {phase === 'identity' && (
          <p>
            A evolução não acontece <em>por acaso.</em>
          </p>
        )}
        {words[phase] && <strong key={phase}>{words[phase]}</strong>}
        {['brand', 'exit'].includes(phase) && (
          <div className="forge-endmark">
            <img src={atlas.src} alt="AtlasFit" />
            <p>Forjado para evoluir.</p>
          </div>
        )}
      </div>
      <div className="forge-film-foot">
        <span>Tecnologia</span>
        <img src={webplus.src} alt="WebPlus" />
      </div>
    </dialog>
  );
}
