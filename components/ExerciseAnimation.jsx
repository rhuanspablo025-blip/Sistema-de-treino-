'use client';

import { useEffect, useMemo, useState } from 'react';

const DATA_URL = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json';
const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/assets';
let datasetPromise;

// Nomes usados na biblioteca em português -> nomes equivalentes do catálogo.
const ALIASES = [
  [/supino.*reto|bench press/i, ['barbell bench press', 'bench press']],
  [/supino.*inclinado/i, ['incline bench press', 'incline dumbbell press']],
  [/supino.*declinado/i, ['decline bench press']],
  [/agachamento.*livre|agachamento.*barra/i, ['barbell squat', 'squat']],
  [/agachamento/i, ['squat']],
  [/leg.?press/i, ['leg press']],
  [/puxada.*frente|pulldown/i, ['lat pulldown', 'cable pulldown']],
  [/remada.*curvada/i, ['bent over row', 'barbell row']],
  [/remada.*baixa/i, ['seated cable row', 'cable row']],
  [/rosca.*direta/i, ['barbell curl', 'standing barbell curl']],
  [/rosca.*martelo/i, ['hammer curl', 'dumbbell hammer curl']],
  [/triceps.*corda|tríceps.*corda/i, ['triceps pushdown', 'cable triceps pushdown']],
  [/coice.*triceps|coice.*tríceps|triceps kickback|tríceps.*kickback/i, ['triceps kickback', 'cable triceps kickback', 'dumbbell kickback']],
  [/desenvolvimento.*halter/i, ['dumbbell shoulder press', 'seated dumbbell press']],
  [/elevacao lateral|elevação lateral/i, ['dumbbell lateral raise', 'lateral raise']],
  [/cadeira extensora/i, ['leg extension', 'lever leg extension']],
  [/mesa flexora|cadeira flexora/i, ['lying leg curl', 'lever lying leg curl', 'seated leg curl', 'lever seated leg curl']],
  [/panturrilha/i, ['standing calf raise', 'calf raise']],
  [/levantamento terra/i, ['deadlift', 'barbell deadlift']],
  [/abdominal.*crunch/i, ['crunch', 'abdominal crunch']],
  [/caminhada.*fazendeiro|farmer.?s? walk|farmer.?s? carry/i, ['single arm farmer walk', 'single arm farmers walk', 'farmer walk', 'farmers walk', 'farmer carry']],
  [/caminhada lateral.*miniband|caminhada lateral.*mini band|band.*side walk|lateral band walk/i, ['band side walk', 'lateral band walk', 'resistance band side walk']],
  [/chest press.*convergente|convergente.*chest press/i, ['lever chest press', 'machine chest press', 'chest press']],
  [/clam.?shell/i, ['clamshell', 'side lying clam']],
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) throw new Error('Catálogo de animações indisponível.');
      return response.json();
    }).then((data) => {
      if (!Array.isArray(data)) throw new Error('Formato inválido do catálogo de animações.');
      return data;
    }).catch((error) => {
      datasetPromise = null;
      throw error;
    });
  }
  return datasetPromise;
}

function findAnimation(exercise, records) {
  const originalName = exercise?.name || exercise?.exerciseName || '';
  const name = normalize(originalName);
  if (!name) return null;

  const aliasEntry = ALIASES.find(([pattern]) => pattern.test(originalName));
  const aliases = aliasEntry ? aliasEntry[1] : [];
  const terms = [...new Set([name, ...aliases.map(normalize)].filter(Boolean))];
  const available = records.filter((item) => item?.animation?.frames?.length && item.mediaStatus !== 'instructions-only');

  // Primeiro tenta correspondência exata; depois nomes equivalentes documentados.
  for (const term of terms) {
    const exact = available.find((item) => normalize(item.name) === term);
    if (exact) return exact;
  }

  // Correspondência parcial apenas com termos suficientemente específicos.
  for (const term of terms.slice(1)) {
    if (term.length < 7) continue;
    const contained = available.find((item) => {
      const candidate = normalize(item.name);
      return candidate.includes(term) || term.includes(candidate);
    });
    if (contained) return contained;
  }
  return null;
}

export default function ExerciseAnimation({ exercise }) {
  const [record, setRecord] = useState(null);
  const [frame, setFrame] = useState(0);
  const [status, setStatus] = useState('loading');

  const sequence = useMemo(
    () => record?.animation?.sequence?.length ? record.animation.sequence : [0, 1, 2, 1],
    [record],
  );
  const frameUrls = useMemo(
    () => record ? [...new Set(sequence)].map((index) => `${ASSET_BASE}/${record.id}/frame-${String(index).padStart(2, '0')}.svg`) : [],
    [record, sequence],
  );

  useEffect(() => {
    let active = true;
    setRecord(null);
    setFrame(0);
    setStatus('loading');
    loadDataset().then((records) => {
      if (!active) return;
      const match = findAnimation(exercise, records);
      setRecord(match);
      setStatus(match ? 'ready' : 'not-found');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [exercise?.name, exercise?.exerciseName]);

  useEffect(() => {
    if (!record?.animation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const duration = Math.max(180, Number(record.animation.frameDurationMs) || 420);
    let index = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % sequence.length;
      setFrame(sequence[index]);
    }, duration);
    return () => window.clearInterval(timer);
  }, [record, sequence]);

  useEffect(() => {
    frameUrls.forEach((url) => {
      const preload = new Image();
      preload.src = url;
    });
  }, [frameUrls]);

  if (status !== 'ready' || !record) {
    const message = status === 'loading'
      ? 'Carregando demonstração...'
      : status === 'error'
        ? 'Não foi possível carregar o catálogo de demonstrações.'
        : 'Demonstração ainda não disponível para este exercício.';
    return <div className="exercise-animation-placeholder" role="status">{message}</div>;
  }

  const frameNumber = String(frame).padStart(2, '0');
  const src = `${ASSET_BASE}/${record.id}/frame-${frameNumber}.svg`;
  return <div className="exercise-animation" aria-label={`Animação demonstrativa: ${record.name}`}>
    <img
      src={src}
      alt={`Execução ilustrada de ${exercise?.name || record.name}`}
      loading="lazy"
      onError={() => setStatus('asset-error')}
    />
    <small>{status === 'asset-error' ? 'Não foi possível carregar esta animação.' : `Animação ilustrativa · ${record.name}`}</small>
  </div>;
}
