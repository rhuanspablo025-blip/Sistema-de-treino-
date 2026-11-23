'use client';

import { useEffect, useState } from 'react';
import WorkoutPlanManager from '../../../components/WorkoutPlanManager';
import MuscleAnalytics from '../../../components/MuscleAnalytics';
import AtlasLoading from '../../../components/AtlasLoading';
import '../personal.css';

export default function PersonalFichasPage() {
  const [student, setStudent] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('studentId');
    if (!id) { setError('Selecione um aluno na central.'); return; }
    fetch(`/api/identity/relationships?id=${encodeURIComponent(id)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Aluno indisponível.'); const row = data.relationships[0]; if (row.status !== 'ACTIVE') throw new Error('Vínculo ativo necessário.'); setStudent({ id: row.student_id, name: row.full_name, trainerId: null }); })
      .catch((failure) => setError(failure.message));
  }, []);
  if (!student && !error) return <AtlasLoading label="Preparando ficha do aluno" detail="Verificando o vínculo e a autorização de acesso." />;
  return <main className="personal-shell"><header className="personal-top"><a className="personal-brand" href="/personal"><span className="personal-mark">A</span><span>AtlasFit <small>FICHAS DE TREINO</small></span></a><nav><a href="/personal">← Voltar aos alunos</a></nav></header><section className="personal-main">{error ? <p className="personal-alert" role="alert">{error}</p> : student ? <><WorkoutPlanManager students={[student]} canEdit onNewStudent={() => { window.location.href = '/personal'; }} onGoToExercises={() => {}} /><MuscleAnalytics studentId={student.id} /></> : <div className="personal-empty">Carregando ficha autorizada…</div>}</section></main>;
}
