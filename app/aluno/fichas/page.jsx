'use client';

import { useCallback, useEffect, useState } from 'react';
import WorkoutPlanManager from '../../../components/WorkoutPlanManager';
import MyRelationships from './my-relationships';
import '../../personal/personal.css';

export default function MinhasFichasPage() {
  const [profile, setProfile] = useState(null), [error, setError] = useState('');
  const loadProfile = useCallback(() => { fetch('/api/identity/me', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (data.role !== 'ALUNO') throw new Error('Área exclusiva do aluno.'); setProfile(data); }).catch((failure) => setError(failure.message)); }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  return <main className="personal-shell"><header className="personal-top"><a className="personal-brand" href="/"><span className="personal-mark">A</span><span>AtlasFit <small>ÁREA DO ALUNO</small></span></a><nav><a href="/">← Voltar</a></nav></header><section className="personal-main"><p className="personal-kicker">MINHA EVOLUÇÃO / TREINOS</p><h1>{profile ? `Olá, ${profile.name.split(' ')[0]}.` : 'Meus treinos'}</h1>{profile && <p className="personal-student-intro">{profile.studentMode === 'INDEPENDENT' ? 'Monte e ajuste suas fichas com os exercícios da biblioteca.' : 'As fichas prescritas pelo seu Personal estão disponíveis para acompanhamento.'}</p>}{error ? <p className="personal-alert" role="alert">{error}</p> : profile ? <><MyRelationships studentId={profile.id} onRelationshipChange={loadProfile} /><WorkoutPlanManager students={[{ id: profile.id, name: profile.name }]} canEdit={profile.studentMode === 'INDEPENDENT'} studentMode onNewStudent={() => {}} onGoToExercises={() => {}} /></> : <div className="personal-empty">Carregando fichas…</div>}</section></main>;
}
