'use client';

import { useEffect, useMemo, useState } from 'react';
import { findAnimation } from '../lib/exercise-animation-matching.mjs';

const DATA_URL = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json';
const REPO_CDN = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/';
let datasetPromise;

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
    <small>
      {status === 'asset-error' ? 'Falha ao carregar os quadros desta animação. ' : `Animação ilustrativa · ${record.name} · `}
      <a href="https://github.com/ozansozuozgit/flow-exercise-dataset" target="_blank" rel="noopener noreferrer">Flow Exercise Dataset</a>
    </small>
  </div>;
}
