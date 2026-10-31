'use client';

import { useEffect, useMemo, useState } from 'react';

const DATA_URL = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json';
const REPO_CDN = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/';
let datasetPromise;

const ALIASES = [
  [/cadeira flexora|mesa flexora/i, ['seated leg curl', 'lever seated leg curl', 'lying leg curl', 'lever lying leg curl']],
  [/cadeira extensora/i, ['leg extension', 'lever leg extension']],
  [/caminhada.*fazendeiro|farmer/i, ['farmer walk', 'farmers walk', 'single arm farmer walk', 'farmer carry']],
  [/caminhada lateral.*mini.?band|lateral band walk/i, ['lateral band walk', 'band side walk', 'resistance band side walk']],
  [/chest press.*convergente|convergente.*chest press/i, ['machine chest press', 'lever chest press', 'chest press']],
  [/clam.?shell/i, ['clamshell', 'side lying clam']],
  [/coice.*tr[ií]ceps|tr[ií]ceps.*kickback/i, ['triceps kickback', 'cable triceps kickback', 'dumbbell kickback']],
  [/tr[ií]ceps.*pol(i|e)y|pol(i|e)y.*tr[ií]ceps/i, ['triceps pushdown', 'cable triceps pushdown']],
  [/desenvolvimento.*halter/i, ['dumbbell shoulder press', 'seated dumbbell press']],
  [/supino.*inclinado/i, ['incline bench press', 'incline dumbbell press']],
  [/supino/i, ['barbell bench press', 'bench press']],
  [/agachamento/i, ['barbell squat', 'squat']],
  [/leg.?press/i, ['leg press']],
  [/puxada.*frente/i, ['lat pulldown', 'cable pulldown']],
  [/remada.*curvada/i, ['bent over row', 'barbell row']],
  [/remada.*baixa/i, ['seated cable row', 'cable row']],
  [/rosca.*martelo/i, ['hammer curl', 'dumbbell hammer curl']],
  [/rosca/i, ['barbell curl', 'dumbbell curl']],
  [/eleva[cç][aã]o lateral/i, ['dumbbell lateral raise', 'lateral raise']],
  [/panturrilha/i, ['standing calf raise', 'calf raise']],
  [/levantamento terra/i, ['deadlift', 'barbell deadlift']],
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Formato inválido do catálogo.');
        return data;
      })
      .catch((error) => {
        datasetPromise = null;
        throw error;
      });
  }
  return datasetPromise;
}

function findAnimation(exercise, records) {
  const name = exercise?.name || exercise?.exerciseName || '';
  const normalizedName = normalize(name);
  if (!normalizedName) return null;

  const alias = ALIASES.find(([pattern]) => pattern.test(name))?.[1] || [];
  const candidates = records.filter((item) =>
    item?.animation?.frames?.length >= 2 &&
    item.mediaStatus !== 'instructions-only'
  );

  for (const term of [normalizedName, ...alias.map(normalize)]) {
    const exact = candidates.find((item) => normalize(item.name) === term);
    if (exact) return exact;
  }

  // Comparação por palavras: tolera diferenças como "lever/seated" e ordem dos termos.
  const targetTokens = new Set(normalize([name, ...alias].join(' ')).split(' ').filter((word) => word.length > 2));
  let best = null;
  let bestScore = 0;
  for (const item of candidates) {
    const itemTokens = new Set(normalize(item.name).split(' ').filter((word) => word.length > 2));
    let overlap = 0;
    for (const token of itemTokens) if (targetTokens.has(token)) overlap++;
    const score = overlap / Math.max(1, Math.min(itemTokens.size, targetTokens.size));
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

function resolveFrameUrl(record, frameIndex) {
  const framePath = record?.animation?.frames?.[frameIndex];
  if (typeof framePath === 'string' && framePath.trim()) {
    if (/^https?:\/\//i.test(framePath)) return framePath;
    return REPO_CDN + framePath.replace(/^\.\//, '').replace(/^\//, '');
  }
  return REPO_CDN + `assets/${record.id}/frame-${String(frameIndex).padStart(2, '0')}.svg`;
}

export default function ExerciseAnimation({ exercise }) {
  const [record, setRecord] = useState(null);
  const [sequencePosition, setSequencePosition] = useState(0);
  const [status, setStatus] = useState('loading');
  const sequence = useMemo(
    () => record?.animation?.sequence?.length ? record.animation.sequence : [0, 1, 2, 1],
    [record],
  );

  useEffect(() => {
    let active = true;
    setRecord(null);
    setSequencePosition(0);
    setStatus('loading');
    loadDataset().then((records) => {
      if (!active) return;
      const match = findAnimation(exercise, records);
      setRecord(match);
      setStatus(match ? 'ready' : 'not-found');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [exercise?.name, exercise?.exerciseName]);

  const frameUrls = useMemo(
    () => record ? [...new Set(sequence)].map((index) => resolveFrameUrl(record, index)) : [],
    [record, sequence],
  );

  useEffect(() => {
    if (!record || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const duration = Math.max(180, Number(record.animation.frameDurationMs) || 420);
    const timer = window.setInterval(() => {
      if (!document.hidden) setSequencePosition((position) => (position + 1) % sequence.length);
    }, duration);
    return () => window.clearInterval(timer);
  }, [record, sequence]);

  useEffect(() => {
    frameUrls.forEach((url) => { const image = new Image(); image.src = url; });
  }, [frameUrls]);

  if (status !== 'ready' || !record) {
    const message = status === 'loading'
      ? 'Carregando demonstração...'
      : status === 'error'
        ? 'Falha ao carregar o catálogo de demonstrações.'
        : 'Demonstração ainda não disponível para este exercício.';
    return <div className="exercise-animation-placeholder" role="status">{message}</div>;
  }

  const frameIndex = sequence[sequencePosition] ?? 0;
  return <div className="exercise-animation" aria-label={`Animação demonstrativa: ${record.name}`}>
    <img
      key={`${record.id}-${frameIndex}`}
      src={resolveFrameUrl(record, frameIndex)}
      alt={`Execução ilustrada de ${exercise?.name || record.name}`}
      loading="lazy"
      onError={() => setStatus('asset-error')}
    />
    <small>{status === 'asset-error' ? 'Falha ao carregar os quadros desta animação.' : `Animação ilustrativa · ${record.name}`}</small>
  </div>;
}
