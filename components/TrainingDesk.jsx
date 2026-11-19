export default function TrainingDesk({ students, workoutPlans, exerciseList, currentUser, onNewStudent, onNavigate, onStudent, onCreate, canManageUsers, isHydrating }) {
  const assigned = new Map();
  for (const plan of workoutPlans) {
    if (!assigned.has(plan.studentId)) assigned.set(plan.studentId, plan);
  }
  const lanes = [
    { title: 'Preparar ficha', rows: students.filter(s => !assigned.has(s.id)), tone: 'pending' },
    { title: 'Em acompanhamento', rows: students.filter(s => assigned.has(s.id)), tone: 'assigned' }
  ];
  const covered = students.length ? Math.round((students.filter(s => assigned.has(s.id)).length / students.length) * 100) : 0;
  return <div className="page-content training-desk">
    <header className="desk-mast">
      <div><p className="eyebrow">Planejamento da unidade</p><h1>Mesa de treino</h1><p>{currentUser?.name}, acompanhe as fichas dos seus alunos.</p></div>
      <div className="desk-mast-actions"><span className="desk-live">VISÃO DA UNIDADE</span><button className="primary-button" onClick={onNewStudent}>+ Cadastrar aluno</button></div>
    </header>
    <section className="desk-overview" aria-label="Resumo da unidade">
      <div><span>ALUNOS</span><strong>{isHydrating ? '—' : students.length}</strong><small>Na unidade</small></div>
      <div><span>FICHAS ATIVAS</span><strong>{isHydrating ? '—' : workoutPlans.length}</strong><small>Em planejamento</small></div>
      <div><span>COBERTURA</span><strong>{isHydrating ? '—' : `${covered}%`}</strong><small>Alunos com ficha</small></div>
      <div className="desk-coverage"><span>PROGRESSO DA UNIDADE</span><strong>{isHydrating ? 'Atualizando…' : `${students.filter(s => assigned.has(s.id)).length} de ${students.length} alunos com ficha`}</strong><div className="desk-coverage-track"><i style={{ width: `${covered}%` }} /></div></div>
    </section>
    <div className="desk-columns">
      {lanes.map(({ title, rows, tone }) => <section className={'desk-lane ' + tone} key={tone}>
        <header><h2>{title}</h2><span>{isHydrating ? '…' : rows.length}</span></header>
        {isHydrating ? <p role="status">Carregando alunos…</p> : rows.length === 0 ? <p className="desk-quiet">{tone === 'assigned' ? 'Nenhuma ficha vinculada.' : 'Nenhum aluno aguardando ficha.'}</p> :
          <ul>{rows.map(s => <li key={s.id}><button onClick={() => onStudent(s)}>
            <span className="desk-initials">{s.initials}</span><span><strong>{s.name}</strong><small>{assigned.get(s.id)?.title || s.goal}</small></span><span aria-hidden="true">↗</span>
          </button></li>)}</ul>}
      </section>)}
      <aside className="desk-index"><h2>Prescrição</h2>
        <button onClick={() => onNavigate('workouts')}><strong>{workoutPlans.length}</strong> Fichas de treino <span>→</span></button>
        <button onClick={() => onNavigate('exercises')}><strong>{exerciseList.length}</strong> Exercícios <span>→</span></button>
        {canManageUsers && <button onClick={() => onCreate('admin')}>Adicionar profissional <span>＋</span></button>}
      </aside>
    </div>
    <section className="desk-actions" aria-label="Acessos rápidos"><div><span className="eyebrow">PRÓXIMOS PASSOS</span><h2>Continue o trabalho</h2></div><button onClick={() => onNavigate('workouts')}><span>01</span><strong>Organizar fichas</strong><span aria-hidden="true">↗</span></button><button onClick={() => onNavigate('exercises')}><span>02</span><strong>Explorar exercícios</strong><span aria-hidden="true">↗</span></button></section>
  </div>;
}
