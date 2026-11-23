"use client";

import { useState, useEffect } from 'react';
import MuscleAnatomy from './MuscleAnatomy';
import MeasureInputs from './MeasureInputs';
import { currentMeasures } from '../lib/body-shape.mjs';
import { saveMeasurements } from '../lib/atlas-data';

export default function MeasuredAnatomy({ studentId, onMeasurementSaved, ...analytics }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        setError('');
        const response = await fetch('/api/body-measurements?studentId=' + encodeURIComponent(studentId), { cache: 'no-store', signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao carregar as medidas.');
        if (!abort.signal.aborted) setSaved(currentMeasures(data.measurements));
      } catch (err) {
        if (!abort.signal.aborted) setError(err.message);
      }
    }
    load();
    return () => abort.abort();
  }, [studentId, attempt]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { measurement } = await saveMeasurements(draft, studentId);
      setSaved({ ...saved, ...currentMeasures([measurement]) });
      onMeasurementSaved?.(measurement);
      setDraft(null);
      setNotice('Avaliação salva.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    {!analytics.isDraft && <section className="panel measurements-panel anatomy-measures">
      <div className="panel-header"><div><h2>Medidas corporais</h2>
        <p>Use a fita ao redor de cada região. Esquerda e direita são os lados do aluno.</p></div>
        {saved && !draft && <button className="outline-button" onClick={() => { setDraft({ ...saved }); setNotice(''); }}>Registrar avaliação</button>}
      </div>
      {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Tentar novamente</button></p>}
      {!saved && !error && <p role="status">Carregando medidas…</p>}
      {draft && <form onSubmit={save}><fieldset disabled={busy}>
        <MeasureInputs values={draft} onChange={(key, value) => setDraft(prev => ({ ...prev, [key]: value }))} />
        <div className="profile-save-row"><button className="primary-button" disabled={!Object.values(draft).some(v => Number(v) > 0)}>Salvar avaliação</button>
          <button type="button" className="outline-button" onClick={() => { setDraft(null); setNotice(''); }}>Cancelar</button></div>
      </fieldset></form>}
      {notice && <p role="status">{notice}</p>}
    </section>}
    <MuscleAnatomy {...analytics} measurements={draft ?? saved ?? undefined} />
  </>;
}
