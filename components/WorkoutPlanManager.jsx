'use client';

import { useEffect, useState } from 'react';

const WEEK_DAYS = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];
const OBJECTIVES = ['Hipertrofia', 'Emagrecimento', 'Força', 'Resistência', 'Condicionamento', 'Reabilitação', 'Personalizado'];
const LEVELS = ['Iniciante', 'Intermediário', 'Avançado'];

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

function dateLabel(value) {
  if (!value) return 'Não definida';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Não definida' : date.toLocaleDateString('pt-BR');
}

function dateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function blankPlan(studentId = '') {
  return {
    name: '', studentId, objective: 'Hipertrofia', objectiveDetails: '', level: 'Iniciante',
    startDate: new Date().toISOString().slice(0, 10), endDate: '', observations: '',
  };
}

function plainExercise(item) {
  const { exercise, ...fields } = item;
  return { ...fields };
}

export default function WorkoutPlanManager({ students, studentsLoading = false, onNewStudent, onGoToExercises }) {
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [objectiveFilter, setObjectiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [toast, setToast] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState({});
  const [pendingExercise, setPendingExercise] = useState({});

  async function loadData(showLoading = false) {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      const [planData, exerciseData] = await Promise.all([
        requestJson('/api/workout-plans?status=all'),
        requestJson('/api/exercises'),
      ]);
      setPlans(planData.plans || []);
      setCatalog(exerciseData.exercises || []);
    } catch (error) {
      setLoadError(error.message || 'Não foi possível carregar as fichas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(true); }, []);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  const totalCount = plans.length;
  const activeCount = plans.filter((plan) => plan.active !== false).length;
  const inactiveCount = totalCount - activeCount;
  const recentCount = plans.filter((plan) => Date.now() - new Date(plan.updatedAt || plan.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const filteredPlans = plans
    .filter((plan) => {
      const matchesSearch = `${plan.name} ${plan.studentName} ${plan.trainerName} ${plan.objective}`.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStudent = studentFilter === 'all' || plan.studentId === studentFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? plan.active !== false : plan.active === false);
      const matchesObjective = objectiveFilter === 'all' || plan.objective === objectiveFilter;
      return matchesSearch && matchesStudent && matchesStatus && matchesObjective;
    })
    .sort((left, right) => {
      if (sortBy === 'name') return left.name.localeCompare(right.name, 'pt-BR');
      if (sortBy === 'created') return new Date(right.createdAt) - new Date(left.createdAt);
      return new Date(right.updatedAt) - new Date(left.updatedAt);
    });

  async function openDetails(plan) {
    setDetailsLoading(true);
    setDetailError('');
    try {
      setDetails(await requestJson(`/api/workout-plans/${encodeURIComponent(plan.id)}`));
    } catch (error) {
      setDetailError(error.message || 'Não foi possível carregar os detalhes da ficha.');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function openEditor(plan = null) {
    setEditorError('');
    if (!plan) {
      setEditor({ plan: blankPlan(students[0]?.id || ''), days: [], id: null });
      return;
    }
    try {
      const data = await requestJson(`/api/workout-plans/${encodeURIComponent(plan.id)}`);
      setEditor({
        id: data.plan.id,
        plan: {
          name: data.plan.name || '',
          studentId: data.plan.studentId,
          objective: data.plan.objective || 'Personalizado',
          objectiveDetails: data.plan.objectiveDetails || '',
          level: data.plan.level || 'Intermediário',
          startDate: dateInputValue(data.plan.startDate),
          endDate: dateInputValue(data.plan.endDate),
          observations: data.plan.observations || '',
        },
        days: data.days.map((day) => ({
          ...day,
          exercises: (day.exercises || []).map(plainExercise),
        })),
      });
    } catch (error) {
      showToast(error.message || 'Não foi possível abrir a ficha para edição.');
    }
  }

  function updatePlan(field, value) {
    setEditor((current) => ({ ...current, plan: { ...current.plan, [field]: value } }));
  }

  function updateDay(dayKey, patch) {
    setEditor((current) => ({
      ...current,
      days: current.days.map((day) => day.dayOfWeek === dayKey ? { ...day, ...patch } : day),
    }));
  }

  function addDay(dayKey, isRestDay = false) {
    const label = WEEK_DAYS.find((day) => day.key === dayKey)?.label || 'Treino';
    setEditor((current) => ({
      ...current,
      days: [...current.days, {
        dayOfWeek: dayKey, name: isRestDay ? 'Descanso' : `${label} · Treino`,
        isRestDay, description: '', observations: '', exercises: [],
      }],
    }));
  }

  function moveDay(dayKey, targetKey) {
    if (editor.days.some((day) => day.dayOfWeek === targetKey)) {
      setEditorError('Já existe um dia configurado nessa posição.');
      return;
    }
    setEditorError('');
    updateDay(dayKey, { dayOfWeek: targetKey });
  }

  function removeDay(day) {
    if (day.exercises.length && !window.confirm(`Remover ${day.name} e seus exercícios desta ficha?`)) return;
    setEditor((current) => ({ ...current, days: current.days.filter((item) => item.dayOfWeek !== day.dayOfWeek) }));
  }

  function duplicateDay(day) {
    const target = WEEK_DAYS.find((slot) => !editor.days.some((item) => item.dayOfWeek === slot.key));
    if (!target) {
      setEditorError('Todos os dias da semana já estão configurados.');
      return;
    }
    const { id, ...copy } = day;
    setEditor((current) => ({
      ...current,
      days: [...current.days, {
        ...copy,
        dayOfWeek: target.key,
        name: `${target.label} · ${day.name.replace(/^(segunda|terça|quarta|quinta|sexta|sábado|domingo)\s*·\s*/i, '')}`,
        exercises: day.exercises.map(({ id: exerciseId, ...exercise }) => ({ ...exercise })),
      }],
    }));
  }

  function copyDayExercises(targetKey, sourceKey) {
    const source = editor.days.find((day) => day.dayOfWeek === sourceKey);
    if (!source) return;
    updateDay(targetKey, {
      exercises: source.exercises.map(({ id, ...exercise }) => ({ ...exercise })),
    });
  }

  function addExercise(dayKey) {
    const exerciseId = pendingExercise[dayKey];
    if (!exerciseId) return;
    updateDay(dayKey, {
      exercises: [...editor.days.find((day) => day.dayOfWeek === dayKey).exercises, {
        exerciseId, sets: 3, repetitions: '10', load: null, rest: 60, timeSeconds: null, method: '', observations: '',
      }],
    });
    setPendingExercise((current) => ({ ...current, [dayKey]: '' }));
  }

  function updateExercise(dayKey, index, patch) {
    const day = editor.days.find((item) => item.dayOfWeek === dayKey);
    const exercises = day.exercises.map((exercise, itemIndex) => itemIndex === index ? { ...exercise, ...patch } : exercise);
    updateDay(dayKey, { exercises });
  }

  function moveExercise(dayKey, index, offset) {
    const day = editor.days.find((item) => item.dayOfWeek === dayKey);
    const target = index + offset;
    if (target < 0 || target >= day.exercises.length) return;
    const exercises = [...day.exercises];
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    updateDay(dayKey, { exercises });
  }

  function duplicateExercise(dayKey, index) {
    const day = editor.days.find((item) => item.dayOfWeek === dayKey);
    if (day.exercises.length >= 50) return;
    const { id, ...exercise } = day.exercises[index];
    const exercises = [...day.exercises];
    exercises.splice(index + 1, 0, { ...exercise });
    updateDay(dayKey, { exercises });
  }

  function removeExercise(dayKey, index) {
    const day = editor.days.find((item) => item.dayOfWeek === dayKey);
    updateDay(dayKey, { exercises: day.exercises.filter((_, itemIndex) => itemIndex !== index) });
  }

  async function saveEditor(event) {
    event.preventDefault();
    setSaving(true);
    setEditorError('');
    try {
      const payload = { ...editor.plan, id: editor.id || undefined, days: editor.days };
      const result = await requestJson('/api/workout-plans', {
        method: editor.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setEditor(null);
      await loadData();
      showToast(editor.id ? 'Ficha atualizada com sucesso.' : 'Ficha criada com sucesso.');
      if (result.plan?.id) setDetails(null);
    } catch (error) {
      setEditorError(error.message || 'Não foi possível salvar a ficha.');
    } finally {
      setSaving(false);
    }
  }

  async function duplicatePlan(plan) {
    try {
      await requestJson(`/api/workout-plans/${encodeURIComponent(plan.id)}/duplicate`, { method: 'POST' });
      await loadData();
      showToast('Ficha duplicada com sucesso.');
    } catch (error) { showToast(error.message || 'Não foi possível duplicar a ficha.'); }
  }

  async function togglePlan(plan) {
    try {
      await requestJson('/api/workout-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, status: plan.active === false ? 'ativa' : 'inativa' }),
      });
      await loadData();
      showToast(plan.active === false ? 'Ficha ativada.' : 'Ficha desativada.');
    } catch (error) { showToast(error.message || 'Não foi possível alterar o status.'); }
  }

  async function deletePlan(plan) {
    if (!window.confirm(`Excluir a ficha “${plan.name}” de ${plan.studentName}? O histórico será preservado.`)) return;
    try {
      await requestJson(`/api/workout-plans?id=${encodeURIComponent(plan.id)}`, { method: 'DELETE' });
      await loadData();
      showToast('Ficha excluída; histórico preservado.');
    } catch (error) { showToast(error.message || 'Não foi possível excluir a ficha.'); }
  }

  if (editor) {
    return <div className="plans-editor" role="dialog" aria-modal="true" aria-labelledby="plans-editor-title">
      <header className="plans-editor-header">
        <button type="button" className="outline-button" onClick={() => { setEditor(null); setEditorError(''); }}>Voltar</button>
        <div><p className="eyebrow">{editor.id ? 'EDIÇÃO DE FICHA' : 'NOVA FICHA'}</p><h1 id="plans-editor-title">{editor.id ? 'Editar ficha' : 'Criar ficha de treino'}</h1></div>
        <button type="submit" form="workout-plan-form" className="primary-button" disabled={saving || students.length === 0 || studentsLoading}>{saving ? 'Salvando...' : 'Salvar ficha'}</button>
      </header>
      {editorError && <p className="plans-error" role="alert">{editorError}</p>}
      <form id="workout-plan-form" className="plans-editor-content" onSubmit={saveEditor}>
        <section className="plans-section">
          <div className="plans-section-heading"><div><p className="eyebrow">ETAPA 1</p><h2>Informações gerais</h2></div><span>Dados principais e revisão</span></div>
          {!studentsLoading && students.length === 0 ? <div className="plans-notice"><div><strong>Nenhum aluno cadastrado</strong><span>Cadastre um aluno antes de criar uma ficha.</span></div><button type="button" className="outline-button" onClick={() => { setEditor(null); onNewStudent(); }}>Cadastrar aluno</button></div> : null}
          <div className="plans-form-grid">
            <label className="plans-field plans-field-wide">Nome da ficha<input value={editor.plan.name} required maxLength="120" onChange={(event) => updatePlan('name', event.target.value)} placeholder="Ex.: Base de força A/B" /></label>
            <label className="plans-field">Aluno<select value={editor.plan.studentId} required disabled={Boolean(editor.id)} onChange={(event) => updatePlan('studentId', event.target.value)}><option value="">Selecione um aluno</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
            <label className="plans-field">Objetivo<select value={editor.plan.objective} onChange={(event) => updatePlan('objective', event.target.value)}>{OBJECTIVES.map((objective) => <option key={objective}>{objective}</option>)}</select></label>
            {editor.plan.objective === 'Personalizado' && <label className="plans-field">Objetivo personalizado<input maxLength="240" value={editor.plan.objectiveDetails} onChange={(event) => updatePlan('objectiveDetails', event.target.value)} placeholder="Descreva o objetivo" /></label>}
            <label className="plans-field">Nível<select value={editor.plan.level} onChange={(event) => updatePlan('level', event.target.value)}>{LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
            <label className="plans-field">Data de início<input type="date" required value={editor.plan.startDate} onChange={(event) => updatePlan('startDate', event.target.value)} /></label>
            <label className="plans-field">Revisar em<input type="date" value={editor.plan.endDate} min={editor.plan.startDate} onChange={(event) => updatePlan('endDate', event.target.value)} /></label>
            <label className="plans-field plans-field-wide">Observações gerais<textarea rows="3" maxLength="2000" value={editor.plan.observations} onChange={(event) => updatePlan('observations', event.target.value)} placeholder="Orientações gerais para esta ficha" /></label>
          </div>
        </section>

        <section className="plans-section plans-week-section">
          <div className="plans-section-heading"><div><p className="eyebrow">ETAPA 2</p><h2>Estrutura semanal</h2></div><span>{editor.days.filter((day) => !day.isRestDay).length} treinos · {editor.days.filter((day) => day.isRestDay).length} descansos</span></div>
          <div className="plans-week-grid">
            {WEEK_DAYS.map((slot) => {
              const day = editor.days.find((item) => item.dayOfWeek === slot.key);
              const exerciseQuery = (exerciseSearch[slot.key] || '').toLowerCase().trim();
              const availableExercises = catalog.filter((exercise) => `${exercise.name} ${exercise.muscleGroup} ${exercise.equipment}`.toLowerCase().includes(exerciseQuery));
              return <article key={slot.key} className={`plans-day ${day?.isRestDay ? 'is-rest' : ''}`}>
                <header className="plans-day-header"><span className="plans-day-label">{slot.label}</span>{day ? <span className={`plans-day-badge ${day.isRestDay ? 'rest' : ''}`}>{day.isRestDay ? 'Descanso' : `${day.exercises.length} exercícios`}</span> : <span className="plans-day-badge rest">Sem treino</span>}</header>
                {!day ? <div className="plans-day-empty"><button type="button" className="outline-button" onClick={() => addDay(slot.key)}>+ Adicionar treino</button><button type="button" className="plans-text-button" onClick={() => addDay(slot.key, true)}>Marcar descanso</button></div> : <>
                  <div className="plans-day-controls">
                    {!day.isRestDay && <label className="plans-field">Mover para<select value={day.dayOfWeek} onChange={(event) => moveDay(day.dayOfWeek, event.target.value)}>{WEEK_DAYS.map((option) => <option key={option.key} value={option.key} disabled={option.key !== day.dayOfWeek && editor.days.some((item) => item.dayOfWeek === option.key)}>{option.label}</option>)}</select></label>}
                    <button type="button" className="plans-icon-button" title="Duplicar treino para outro dia" aria-label={`Duplicar treino de ${slot.label}`} onClick={() => duplicateDay(day)}>⧉</button>
                    <button type="button" className="plans-icon-button danger" title="Remover dia" aria-label={`Remover ${slot.label}`} onClick={() => removeDay(day)}>×</button>
                  </div>
                  <label className="plans-field">{day.isRestDay ? 'Dia de descanso' : 'Nome do treino'}<input maxLength="80" disabled={day.isRestDay} value={day.name} onChange={(event) => updateDay(slot.key, { name: event.target.value })} /></label>
                  {day.isRestDay ? <button type="button" className="plans-text-button" onClick={() => updateDay(slot.key, { isRestDay: false, name: `${slot.label} · Treino` })}>Transformar em treino</button> : <>
                    <label className="plans-field">Observações do dia<textarea rows="2" maxLength="2000" value={day.observations || ''} onChange={(event) => updateDay(slot.key, { observations: event.target.value })} /></label>
                    {editor.days.length > 1 && <label className="plans-field">Copiar exercícios de<select defaultValue="" onChange={(event) => { if (event.target.value) copyDayExercises(slot.key, event.target.value); event.target.value = ''; }}><option value="">Não copiar</option>{editor.days.filter((other) => other.dayOfWeek !== slot.key && !other.isRestDay).map((other) => <option key={other.dayOfWeek} value={other.dayOfWeek}>{WEEK_DAYS.find((item) => item.key === other.dayOfWeek)?.label} · {other.name}</option>)}</select></label>}
                    {catalog.length === 0 ? <div className="plans-notice"><span>O catálogo está vazio. Cadastre exercícios antes de montar este treino.</span><button type="button" className="outline-button" onClick={() => { setEditor(null); onGoToExercises(); }}>Abrir exercícios</button></div> : <div className="plans-add-exercise">
                      <input aria-label={`Buscar exercício para ${slot.label}`} value={exerciseSearch[slot.key] || ''} onChange={(event) => setExerciseSearch((current) => ({ ...current, [slot.key]: event.target.value }))} placeholder="Buscar no catálogo" />
                      <select aria-label={`Selecionar exercício para ${slot.label}`} value={pendingExercise[slot.key] || ''} onChange={(event) => setPendingExercise((current) => ({ ...current, [slot.key]: event.target.value }))}><option value="">Selecione exercício</option>{availableExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select>
                      <button type="button" className="outline-button" disabled={!pendingExercise[slot.key]} onClick={() => addExercise(slot.key)}>Adicionar</button>
                    </div>}
                    {day.exercises.length === 0 ? <p className="plans-empty-exercises">Adicione exercícios da biblioteca existente.</p> : <div className="plans-exercises">
                      {day.exercises.map((exercise, index) => {
                        const catalogExercise = catalog.find((item) => item.id === exercise.exerciseId);
                        return <div className="plans-exercise" key={exercise.id || `${exercise.exerciseId}-${index}`}>
                          <header className="plans-exercise-header"><div><strong>{catalogExercise?.name || exercise.exercise?.name || 'Exercício'}</strong><small>{catalogExercise?.muscleGroup || exercise.exercise?.muscleGroup || 'Grupo não classificado'} · {catalogExercise?.equipment || exercise.exercise?.equipment || 'Sem equipamento'}</small></div><div className="plans-row-actions"><button type="button" className="plans-icon-button" aria-label="Mover exercício para cima" title="Mover para cima" disabled={index === 0} onClick={() => moveExercise(slot.key, index, -1)}>↑</button><button type="button" className="plans-icon-button" aria-label="Mover exercício para baixo" title="Mover para baixo" disabled={index === day.exercises.length - 1} onClick={() => moveExercise(slot.key, index, 1)}>↓</button><button type="button" className="plans-icon-button" aria-label="Duplicar exercício" title="Duplicar exercício" onClick={() => duplicateExercise(slot.key, index)}>⧉</button><button type="button" className="plans-icon-button danger" aria-label="Remover exercício" title="Remover exercício" onClick={() => removeExercise(slot.key, index)}>×</button></div></header>
                          <div className="plans-exercise-grid">
                            <label className="plans-field">Séries<input type="number" min="1" max="20" required value={exercise.sets} onChange={(event) => updateExercise(slot.key, index, { sets: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
                            <label className="plans-field">Repetições<input required maxLength="40" value={exercise.repetitions} onChange={(event) => updateExercise(slot.key, index, { repetitions: event.target.value })} placeholder="8-12" /></label>
                            <label className="plans-field">Carga (kg)<input type="number" min="0" max="10000" step="0.5" value={exercise.load ?? ''} onChange={(event) => updateExercise(slot.key, index, { load: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Opcional" /></label>
                            <label className="plans-field">Intervalo (s)<input type="number" min="0" max="3600" value={exercise.rest} onChange={(event) => updateExercise(slot.key, index, { rest: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
                            <label className="plans-field">Tempo (s)<input type="number" min="0" max="14400" value={exercise.timeSeconds ?? ''} onChange={(event) => updateExercise(slot.key, index, { timeSeconds: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Opcional" /></label>
                            <label className="plans-field">Método/técnica<input maxLength="100" value={exercise.method || ''} onChange={(event) => updateExercise(slot.key, index, { method: event.target.value })} placeholder="Opcional" /></label>
                            <label className="plans-field plans-field-wide">Observação<textarea rows="2" maxLength="1000" value={exercise.observations || ''} onChange={(event) => updateExercise(slot.key, index, { observations: event.target.value })} /></label>
                          </div>
                        </div>;
                      })}
                    </div>}
                    <button type="button" className="plans-text-button" onClick={() => {
                      if (day.exercises.length && !window.confirm('Os exercícios deste dia serão removidos ao marcá-lo como descanso. Continuar?')) return;
                      updateDay(slot.key, { isRestDay: true, name: 'Descanso', exercises: [] });
                    }}>Marcar como descanso</button>
                  </>}
                </>}
              </article>;
            })}
          </div>
        </section>
        {editorError && <p className="plans-error" role="alert">{editorError}</p>}
        <footer className="plans-editor-footer"><button type="button" className="outline-button" onClick={() => setEditor(null)}>Cancelar</button><button type="submit" form="workout-plan-form" className="primary-button" disabled={saving || students.length === 0}>{saving ? 'Salvando...' : 'Salvar ficha'}</button></footer>
      </form>
    </div>;
  }

  return <div className="page-content plans-page">
    <div className="page-heading plans-heading"><div><p className="eyebrow">GESTÃO DE FICHAS</p><h1>Fichas de treino</h1><p className="heading-copy">Monte a semana, ajuste cada exercício e acompanhe as atualizações.</p></div><button className="primary-button" disabled={!students.length || studentsLoading} onClick={() => openEditor()}>+ Nova ficha</button></div>
    <div className="plans-stats">
      <article><span>Total de fichas</span><strong>{totalCount}</strong></article>
      <article><span>Ativas</span><strong>{activeCount}</strong></article>
      <article><span>Inativas</span><strong>{inactiveCount}</strong></article>
      <article><span>Atualizadas em 7 dias</span><strong>{recentCount}</strong></article>
    </div>
    {!studentsLoading && students.length === 0 && <div className="plans-notice"><div><strong>Nenhum aluno cadastrado</strong><span>Cadastre um aluno antes de criar uma ficha.</span></div><button className="outline-button" onClick={onNewStudent}>Cadastrar aluno</button></div>}
    <section className="plans-list-panel">
      <div className="plans-toolbar">
        <label className="plans-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ficha, aluno ou professor" aria-label="Buscar fichas" /></label>
        <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} aria-label="Filtrar por aluno"><option value="all">Todos os alunos</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select>
        <select value={objectiveFilter} onChange={(event) => setObjectiveFilter(event.target.value)} aria-label="Filtrar por objetivo"><option value="all">Todos os objetivos</option>{OBJECTIVES.map((objective) => <option key={objective}>{objective}</option>)}</select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordenar fichas"><option value="updated">Atualizadas recentemente</option><option value="created">Mais recentes</option><option value="name">Nome</option></select>
      </div>
      {loading || studentsLoading ? <div className="plans-state" role="status">Carregando fichas...</div> : loadError ? <div className="plans-state" role="alert"><strong>Não foi possível carregar as fichas.</strong><span>{loadError}</span><button className="outline-button" onClick={() => loadData(true)}>Tentar novamente</button></div> : filteredPlans.length === 0 ? <div className="plans-state"><strong>{plans.length ? 'Nenhuma ficha encontrada' : 'Nenhuma ficha cadastrada'}</strong><span>{plans.length ? 'Altere a pesquisa ou os filtros.' : 'Crie a primeira ficha de treino para começar.'}</span>{!plans.length && students.length > 0 && <button className="primary-button" onClick={() => openEditor()}>+ Nova ficha</button>}</div> : <div className="plans-grid">
        {filteredPlans.map((plan) => <article className="plans-card" key={plan.id}>
          <header className="plans-card-header"><div><p className="eyebrow">{plan.objective}</p><h2>{plan.name}</h2></div><span className={`plans-status ${plan.active === false ? 'inactive' : ''}`}>{plan.active === false ? 'Inativa' : 'Ativa'}</span></header>
          <div className="plans-card-student"><span className="plans-avatar">{(plan.studentName || 'A').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{plan.studentName}</strong><small>Professor: {plan.trainerName || 'Equipe'}</small></span></div>
          <div className="plans-card-meta"><span><small>Treinos</small><strong>{plan.dayCount || 0} dias · {plan.exerciseCount || 0} exercícios</strong></span><span><small>Nível</small><strong>{plan.level || 'Não definido'}</strong></span><span><small>Período</small><strong>{dateLabel(plan.startDate)} · {dateLabel(plan.endDate)}</strong></span></div>
          <footer className="plans-card-footer"><small>Atualizada {dateLabel(plan.updatedAt)}</small><div className="plans-card-actions"><button className="plans-text-button" onClick={() => openDetails(plan)}>Visualizar</button><button className="plans-text-button" onClick={() => openEditor(plan)}>Editar</button><button className="plans-icon-button" title="Duplicar ficha" aria-label="Duplicar ficha" onClick={() => duplicatePlan(plan)}>⧉</button><button className="plans-icon-button" title={plan.active === false ? 'Ativar ficha' : 'Desativar ficha'} aria-label={plan.active === false ? 'Ativar ficha' : 'Desativar ficha'} onClick={() => togglePlan(plan)}>{plan.active === false ? '▶' : 'Ⅱ'}</button><button className="plans-icon-button danger" title="Excluir ficha" aria-label="Excluir ficha" onClick={() => deletePlan(plan)}>×</button></div></footer>
        </article>)}
      </div>}
    </section>

    {detailsLoading && <div className="plans-detail-overlay"><div className="plans-detail-panel" role="status">Carregando ficha...</div></div>}
    {detailError && <div className="plans-toast plans-toast-error" role="alert">{detailError}<button onClick={() => setDetailError('')} aria-label="Fechar">×</button></div>}
    {details && <div className="plans-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="plans-detail-title" onMouseDown={(event) => event.target === event.currentTarget && setDetails(null)}>
      <article className="plans-detail-panel plans-print-area">
        <header className="plans-detail-header"><div><p className="eyebrow">FICHA DE TREINO</p><h1 id="plans-detail-title">{details.plan.name}</h1><p>{details.plan.studentName} · {details.plan.objective}{details.plan.objectiveDetails ? ` · ${details.plan.objectiveDetails}` : ''}</p></div><div className="plans-detail-actions"><button className="outline-button" onClick={() => window.print()}>Imprimir / PDF</button><button className="plans-icon-button" aria-label="Fechar ficha" onClick={() => setDetails(null)}>×</button></div></header>
        <div className="plans-detail-meta"><span><small>Nível</small><strong>{details.plan.level || 'Não definido'}</strong></span><span><small>Status</small><strong>{details.plan.active === false ? 'Inativa' : 'Ativa'}</strong></span><span><small>Período</small><strong>{dateLabel(details.plan.startDate)} – {dateLabel(details.plan.endDate)}</strong></span><span><small>Professor</small><strong>{details.plan.trainerName}</strong></span></div>
        {details.plan.observations && <p className="plans-detail-observations">{details.plan.observations}</p>}
        {details.days.length === 0 ? <div className="plans-state">Nenhum dia configurado nesta ficha.</div> : details.days.map((day) => <section className="plans-detail-day" key={day.id}><header><span>{WEEK_DAYS.find((slot) => slot.key === day.dayOfWeek)?.label || 'Treino'}</span><h2>{day.name}</h2></header>{day.isRestDay ? <p>Descanso</p> : day.exercises.length === 0 ? <p>Sem exercícios neste treino.</p> : <div className="plans-detail-table"><div className="plans-detail-row plans-detail-head"><span>Exercício</span><span>Séries</span><span>Repetições</span><span>Carga</span><span>Intervalo</span><span>Tempo</span></div>{day.exercises.map((exercise) => <div className="plans-detail-row" key={exercise.id}><span><strong>{exercise.exercise?.name || 'Exercício'}</strong><small>{exercise.method || exercise.observations || ''}</small></span><span>{exercise.sets}</span><span>{exercise.repetitions}</span><span>{exercise.load === null ? '—' : `${exercise.load} kg`}</span><span>{exercise.rest}s</span><span>{exercise.timeSeconds ? `${exercise.timeSeconds}s` : '—'}</span></div>)}</div>}</section>)}
        <footer className="plans-detail-footer"><small>Criada em {dateLabel(details.plan.createdAt)} · Atualizada em {dateLabel(details.plan.updatedAt)}</small><button className="primary-button" onClick={() => { const plan = details.plan; setDetails(null); openEditor(plan); }}>Editar ficha</button></footer>
      </article>
    </div>}
    {toast && <div className="plans-toast" role="status">{toast}</div>}
  </div>;
}