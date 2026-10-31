'use client';

import { useEffect, useState } from 'react';

const DATA_URL = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json';
const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/assets';
let datasetPromise;

const ALIASES = [
  [/supino.*reto|bench press/i, 'barbell bench press'],
  [/supino.*inclinado/i, 'incline bench press'],
  [/supino.*declinado/i, 'decline bench press'],
  [/agachamento.*livre|agachamento.*barra/i, 'barbell squat'],
  [/agachamento/i, 'squat'],
  [/leg.?press/i, 'leg press'],
  [/puxada.*frente|pulldown/i, 'lat pulldown'],
  [/remada.*curvada/i, 'bent over row'],
  [/remada.*baixa/i, 'seated cable row'],
  [/rosca.*direta/i, 'barbell curl'],
  [/rosca.*martelo/i, 'hammer curl'],
  [/triceps.*corda|tríceps.*corda/i, 'triceps pushdown'],
  [/desenvolvimento.*halter/i, 'dumbbell shoulder press'],
  [/elevacao lateral|elevação lateral/i, 'dumbbell lateral raise'],
  [/cadeira extensora/i, 'leg extension'],
  [/mesa flexora|cadeira flexora/i, 'lying leg curl'],
  [/panturrilha/i, 'standing calf raise'],
  [/levantamento terra/i, 'deadlift'],
  [/abdominal.*crunch/i, 'crunch'],
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) throw new Error('Catálogo de animações indisponível.');
      return response.json();
    }).catch((error) => {
      datasetPromise = null;
      throw error;
    });
  }
  return datasetPromise;
}

function findAnimation(exercise, records) {
  const name = normalize(exercise?.name);
  if (!name) return null;
  const alias = ALIASES.find(([pattern]) => pattern.test(exercise.name))?.[1];
  const terms = [name, alias && normalize(alias)].filter(Boolean);
  const available = records.filter((item) => item.animation && item.mediaStatus !== 'instructions-only');
  for (const term of terms) {
    const exact = available.find((item) => normalize(item.name) === term);
    if (exact) return exact;
    const contained = available.find((item) => normalize(item.name).includes(term) || term.includes(normalize(item.name)));
    if (contained && term.length > 5) return contained;
  }
  return null;
}

export default function ExerciseAnimation({ exercise }) {
  const [record, setRecord] = useState(null);
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadDataset().then((records) => {
      if (!active) return;
      const match = findAnimation(exercise, records);
      if (match) setRecord(match);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [exercise?.name]);

  useEffect(() => {
    if (!record?.animation) return undefined;
    const sequence = record.animation.sequence?.length ? record.animation.sequence : [0, 1, 2, 1];
    const duration = Math.max(180, Number(record.animation.frameDurationMs) || 420);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return undefined;
    let index = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % sequence.length;
      setFrame(sequence[index]);
    }, duration);
    return () => window.clearInterval(timer);
  }, [record]);

  if (!record) {
    return <div className="exercise-animation-placeholder" role="status">
      {error ? 'Demonstração indisponível no momento.' : 'Demonstração animada não cadastrada para este exercício.'}
    </div>;
  }

  const frameNumber = String(frame).padStart(2, '0');
  const src = `${ASSET_BASE}/${record.id}/frame-${frameNumber}.svg`;
  return <div className="exercise-animation" aria-label={`Animação demonstrativa: ${record.name}`}>
    <img src={src} alt={`Execução ilustrada de ${exercise?.name || record.name}`} loading="lazy" />
    <small>Animação ilustrativa · {record.name}</small>
  </div>;
}
