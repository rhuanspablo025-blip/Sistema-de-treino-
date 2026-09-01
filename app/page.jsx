"use client";

import { useEffect, useState } from "react";
import { demoKeys, readDemo, writeDemo, saveMeasurements, saveWorkout } from "../lib/atlas-data";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

const SimpleIcon = ({ children, size = 18 }) => (
  <span className="simple-icon" style={{ fontSize: size }}>
    {children}
  </span>
);
const Activity = (props) => <SimpleIcon {...props}>⌁</SimpleIcon>;
const BarChart3 = (props) => <SimpleIcon {...props}>▥</SimpleIcon>;
const Bell = (props) => <SimpleIcon {...props}>♧</SimpleIcon>;
const ChevronDown = (props) => <SimpleIcon {...props}>⌄</SimpleIcon>;
const ChevronRight = (props) => <SimpleIcon {...props}>›</SimpleIcon>;
const ClipboardList = (props) => <SimpleIcon {...props}>▤</SimpleIcon>;
const Clock3 = (props) => <SimpleIcon {...props}>◷</SimpleIcon>;
const Dumbbell = (props) => <SimpleIcon {...props}>╫</SimpleIcon>;
const LayoutDashboard = (props) => <SimpleIcon {...props}>▦</SimpleIcon>;
const LogOut = (props) => <SimpleIcon {...props}>↪</SimpleIcon>;
const Menu = (props) => <SimpleIcon {...props}>☰</SimpleIcon>;
const Plus = (props) => <SimpleIcon {...props}>+</SimpleIcon>;
const Search = (props) => <SimpleIcon {...props}>⌕</SimpleIcon>;
const Settings = (props) => <SimpleIcon {...props}>⚙</SimpleIcon>;
const UserRound = (props) => <SimpleIcon {...props}>○</SimpleIcon>;
const UsersRound = (props) => <SimpleIcon {...props}>♙</SimpleIcon>;
const X = (props) => <SimpleIcon {...props}>×</SimpleIcon>;

const initialStudents = [
  {
    name: "Rhuan",
    initials: "RH",
    goal: "Hipertrofia",
    status: "Em dia",
    color: "coral",
    updated: "Hoje, 09:42",
  },
];

const exercises = [
  {
    name: "Agachamento livre",
    detail: "4 séries  ·  8–10 reps",
    load: "42 kg",
    rest: "90s",
  },
  {
    name: "Leg press 45°",
    detail: "3 séries  ·  10–12 reps",
    load: "120 kg",
    rest: "90s",
  },
  {
    name: "Cadeira extensora",
    detail: "3 séries  ·  12–15 reps",
    load: "35 kg",
    rest: "60s",
  },
  {
    name: "Mesa flexora",
    detail: "3 séries  ·  10–12 reps",
    load: "30 kg",
    rest: "60s",
  },
  {
    name: "Panturrilha em pé",
    detail: "4 séries  ·  15–20 reps",
    load: "40 kg",
    rest: "45s",
  },
];

const navItems = [
  { label: "Visão geral", icon: LayoutDashboard, key: "overview" },
  { label: "Cadastro de alunos", icon: UsersRound, key: "students" },
  { label: "Administradores", icon: UserRound, key: "admins" },
  { label: "Fichas de treino", icon: ClipboardList, key: "workouts" },
  { label: "Exercícios", icon: Dumbbell, key: "exercises" },
];

const adminUsers = [
  {
    name: "Rhuan",
    email: "rhuan@atlas.training",
    role: "Dev · Administrador + Aluno",
    initials: "RH",
  },
];

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const pageSize = 8;

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/users');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar os usuários.');
      setUsers(body.users);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function saveUser(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.active = form.get('active') === 'on';
    try {
      const response = await fetch('/api/users', { method: editingUser?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingUser?.id ? { ...payload, id: editingUser.id } : payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o usuário.');
      setEditingUser(null);
      setFeedback(editingUser?.id ? 'Usuário atualizado.' : 'Usuário criado.');
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(user) {
    try {
      const response = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...user, active: !user.active }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível alterar o status.');
      setUsers((current) => current.map((item) => item.id === user.id ? body.user : item));
      setFeedback(user.active ? 'Usuário desativado.' : 'Usuário ativado.');
    } catch (toggleError) { setError(toggleError.message); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Excluir o usuário ${user.name}? Esta ação não pode ser desfeita.`)) return;
    try {
      const response = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível excluir o usuário.');
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setFeedback('Usuário excluído.');
    } catch (deleteError) { setError(deleteError.message); }
  }

  const filteredUsers = users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === 'Todos' || (statusFilter === 'Ativos' ? user.active : !user.active);
    return matchesQuery && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  return <section className="panel module-panel">
    <div className="panel-header"><div><h2>Usuários do sistema</h2><p>Controle acessos, perfis e status diretamente no banco.</p></div><button className="primary-button" onClick={() => setEditingUser({})}><Plus size={17} /> Novo usuário</button></div>
    <div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar por nome ou e-mail..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div><div className="filter-tabs">{['Todos', 'Ativos', 'Inativos'].map((item) => <button className={statusFilter === item ? 'filter active' : 'filter'} key={item} onClick={() => { setStatusFilter(item); setPage(1); }}>{item}</button>)}</div></div>
    {error && <p className="login-error">{error}</p>}{feedback && <p className="profile-status">{feedback}</p>}
    {loading ? <p className="empty-state">Carregando usuários...</p> : visibleUsers.length === 0 ? <p className="empty-state">Nenhum usuário encontrado.</p> : <div className="table-list">{visibleUsers.map((user) => <div className="table-row" key={user.id}><span className="student-avatar coral">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><em>{user.role === 'student' ? 'Aluno' : user.role === 'admin' ? 'Administrador' : 'Desenvolvedor'}</em><span className={`status ${user.active ? 'em-dia' : 'revisar'}`}><i />{user.active ? 'Ativo' : 'Inativo'}</span><button className="outline-button small-button" onClick={() => setEditingUser(user)}>Editar</button><button className="more-button" onClick={() => toggleUser(user)} aria-label={user.active ? 'Desativar usuário' : 'Ativar usuário'}>{user.active ? '⏸' : '▶'}</button><button className="more-button" onClick={() => deleteUser(user)} aria-label={`Excluir ${user.name}`}>×</button></div>)}</div>}
    <div className="panel-header"><small>{filteredUsers.length} usuário(s)</small><div><button className="filter" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span> Página {page} de {pageCount} </span><button className="filter" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Próxima</button></div></div>
    {editingUser && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingUser(null)}><div className="modal"><button className="modal-close" onClick={() => setEditingUser(null)} aria-label="Fechar"><X size={18} /></button><span className="modal-kicker"><UserRound size={16} /></span><h2>{editingUser.id ? 'Editar usuário' : 'Novo usuário'}</h2><p>Os dados serão persistidos no Supabase Authentication e em profiles.</p><form onSubmit={saveUser}><label>Nome completo<input name="name" required minLength="2" defaultValue={editingUser.name || ''} /></label><label>E-mail / login<input name="email" type="email" required defaultValue={editingUser.email || ''} /></label><label>Perfil<select name="role" defaultValue={editingUser.role || 'student'}><option value="student">Aluno</option><option value="admin">Administrador</option><option value="dev">Desenvolvedor</option></select></label><label>Senha {editingUser.id ? '(opcional)' : ''}<input name="password" type="password" minLength="8" required={!editingUser.id} autoComplete="new-password" /></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength="8" required={!editingUser.id} autoComplete="new-password" /></label><label><input name="active" type="checkbox" defaultChecked={editingUser.active !== false} /> Usuário ativo</label><button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar usuário'}</button></form></div></div>}
  </section>;
}

function AdminModule({ view, students, workoutPlans, adminList, exerciseList, onNewStudent, onAction, onNavigate, onCreate }) {
  const moduleData = {
    overview: {
      kicker: "VISÃO GERAL",
      title: "Central da academia",
      copy: "Tenha uma visão rápida dos cadastros e das fichas em movimento.",
    },
    admins: {
      kicker: "EQUIPE",
      title: "Administradores",
      copy: "Gerencie quem pode criar e acompanhar fichas.",
    },
    workouts: {
      kicker: "GESTÃO DE FICHAS",
      title: "Fichas de treino",
      copy: "Fichas prontas, editáveis e vinculadas ao aluno responsável.",
    },
    exercises: {
      kicker: "BIBLIOTECA",
      title: "Cadastro de exercícios",
      copy: "Mantenha sua biblioteca organizada para montar treinos mais rápido.",
    },
  }[view];
  if (view === "overview")
    return (
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{moduleData.kicker}</p>
            <h1>{moduleData.title}</h1>
            <p className="heading-copy">{moduleData.copy}</p>
          </div>
        </div>
        <div className="module-cards">
          <button className="module-card" onClick={onNewStudent}>
            <UsersRound size={22} />
            <strong>{students.length}</strong>
            <span>Alunos cadastrados</span>
            <b>Adicionar aluno →</b>
          </button>
          <button className="module-card" onClick={() => onNavigate("workouts")}>
            <ClipboardList size={22} />
            <strong>{workoutPlans.length}</strong>
            <span>Fichas prontas</span>
            <b>Gerenciar fichas →</b>
          </button>
          <button className="module-card" onClick={() => onNavigate("exercises")}>
            <Dumbbell size={22} />
            <strong>42</strong>
            <span>Exercícios na biblioteca</span>
            <b>Ver exercícios →</b>
          </button>
        </div>
        <section className="panel module-panel">
          <div className="panel-header">
            <div>
              <h2>Atalhos de gestão</h2>
              <p>Os fluxos principais da sua operação.</p>
            </div>
          </div>
          <div className="shortcut-grid">
            <button onClick={onNewStudent}>
              <Plus size={17} />
              <span>
                Novo aluno<strong>Criar acesso e objetivo</strong>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => onCreate("workout")}>
              <ClipboardList size={17} />
              <span>
                Nova ficha<strong>Montar treino por exercícios</strong>
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onCreate("admin")}
            >
              <UserRound size={17} />
              <span>
                Novo administrador<strong>Convidar profissional</strong>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
    );
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{moduleData.kicker}</p>
          <h1>{moduleData.title}</h1>
          <p className="heading-copy">{moduleData.copy}</p>
        </div>
        <button
          className="primary-button"
          onClick={() => onCreate(view === "admins" ? "admin" : view === "workouts" ? "workout" : "exercise")}
        >
          <Plus size={18} />{" "}
          {view === "admins"
            ? "Novo administrador"
            : view === "workouts"
              ? "Nova ficha"
              : "Novo exercício"}
        </button>
      </div>
      {view === "admins" && (
        <UserManagement />
      )}
      {view === "workouts" && (
        <section className="panel module-panel">
          <div className="table-list">
            {workoutPlans.map((plan) => (
              <div className="table-row" key={plan.id}>
                <span className="table-icon">
                  <ClipboardList size={16} />
                </span>
                <span>
                  <strong>{plan.title}</strong>
                  <small>
                    Aluno: {plan.student} · Criada por {plan.admin}
                  </small>
                </span>
                <em>{plan.exercises} exercícios</em>
                <button
                  className="outline-button small-button"
                  onClick={() => onAction(`Editando ficha de ${plan.student}`)}
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {view === "exercises" && (
        <section className="panel module-panel">
          <div className="exercise-library">
            {exerciseList.map((exercise) => (
              <button
                key={exercise}
                onClick={() => onAction(`Editando ${exercise}`)}
              >
                <Dumbbell size={16} />
                <span>
                  <strong>{exercise}</strong>
                  <small>Editar detalhes e instruções</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BodyFigure({ measurements }) {
  const value = (current, fallback) => Number(current) > 0 ? Number(current) : fallback;
  const shoulder = Math.max(82, Math.min(142, value(measurements.shoulder, 108) * 1.15));
  const chest = Math.max(72, Math.min(124, value(measurements.chest, 96) * 1.05));
  const waist = Math.max(62, Math.min(108, value(measurements.waist, 82) * 0.95));
  const hip = Math.max(75, Math.min(132, value(measurements.hip, 101) * 0.98));
  const armLeft = Math.max(13, Math.min(25, value(measurements.armLeft, 34) * 0.58));
  const armRight = Math.max(13, Math.min(25, value(measurements.armRight, 34) * 0.58));
  const thighLeft = Math.max(21, Math.min(37, value(measurements.thighLeft, 58) * 0.48));
  const thighRight = Math.max(21, Math.min(37, value(measurements.thighRight, 58) * 0.48));
  return <div className="body-map"><div className="body-measure-tag tag-shoulder">Ombros {measurements.shoulder} cm</div><div className="body-measure-tag tag-waist">Cintura {measurements.waist} cm</div><svg viewBox="0 0 260 430" role="img" aria-label="Visualização proporcional do corpo"><defs><linearGradient id="figureGradient" x1="0" x2="1"><stop offset="0" stopColor="#277665" /><stop offset="1" stopColor="#3a927c" /></linearGradient></defs><circle cx="130" cy="42" r="29" fill="#d89575" /><path d="M115 67h30l6 25h-42z" fill="#d89575" /><path d={`M${130 - shoulder / 2} 86 Q130 73 ${130 + shoulder / 2} 86 L${130 + chest / 2} 185 Q130 204 ${130 - chest / 2} 185Z`} fill="url(#figureGradient)" /><path d={`M${130 - shoulder / 2} 94 L${130 - shoulder / 2 - armLeft - 12} 190 Q${130 - shoulder / 2 - armLeft - 12} 207 ${130 - shoulder / 2 - armLeft} 209 Q${130 - shoulder / 2 - armLeft + 8} 208 ${130 - shoulder / 2 - armLeft + 10} 190 L${130 - shoulder / 2 + 7} 112Z`} fill="#d89575" /><path d={`M${130 + shoulder / 2} 94 L${130 + shoulder / 2 + armRight + 12} 190 Q${130 + shoulder / 2 + armRight + 12} 207 ${130 + shoulder / 2 + armRight} 209 Q${130 + shoulder / 2 + armRight - 8} 208 ${130 + shoulder / 2 + armRight - 10} 190 L${130 + shoulder / 2 - 7} 112Z`} fill="#d89575" /><path d={`M${130 - hip / 2} 177 Q130 195 ${130 + hip / 2} 177 L${130 + hip / 2 - 7} 220 L${130 + thighRight / 2} 350 Q130 360 ${130 - thighLeft / 2} 350 L${130 - hip / 2 + 7} 220Z`} fill="url(#figureGradient)" /><path d={`M${130 - thighLeft / 2} 340 L${130 - thighLeft / 2 - 4} 405 Q130 414 ${130 - thighLeft / 2 + 10} 414 L130 405 L130 340Z`} fill="#315f57" /><path d={`M${130 + thighRight / 2} 340 L${130 + thighRight / 2 + 4} 405 Q260 414 ${130 + thighRight / 2 - 10} 414 L130 405 L130 340Z`} fill="#315f57" /></svg><div className="body-measure-legend"><span><i className="legend-teal" /> Proporções estimadas</span><span><i className="legend-coral" /> Medidas editáveis</span></div></div>;
}

function BodyProfileEditor({ measurements, setMeasurements }) {
  const fields = [["height", "Altura", "cm"], ["weight", "Peso", "kg"], ["shoulder", "Ombros", "cm"], ["chest", "Peito", "cm"], ["waist", "Cintura", "cm"], ["hip", "Quadril", "cm"], ["armLeft", "Braço esquerdo", "cm"], ["armRight", "Braço direito", "cm"], ["thighLeft", "Coxa esquerda", "cm"], ["thighRight", "Coxa direita", "cm"], ["legLeft", "Perna esquerda", "cm"], ["legRight", "Perna direita", "cm"]];
  const defaults = { height: 172, weight: 74, shoulder: 108, chest: 96, waist: 82, hip: 101, armLeft: 34, armRight: 34, thighLeft: 58, thighRight: 58, legLeft: 38, legRight: 38 };
  function update(key, value) { setMeasurements((current) => ({ ...current, [key]: Number(value) > 0 ? Number(value) : defaults[key] })); }
  return <div className="enhanced-profile-grid"><section className="panel measurements-panel enhanced-measurements"><div className="panel-header"><div><h2>Mapa de medidas</h2><p>Edite cada região para atualizar o modelo em tempo real.</p></div><span className="profile-status">Atualização ao vivo</span></div><div className="measurement-form enhanced-form">{fields.map(([key, label, unit]) => <label key={key}>{label}<div><input type="number" min="1" value={measurements[key]} onChange={(event) => update(key, event.target.value)} /><span>{unit}</span></div></label>)}</div></section><section className="panel body-card enhanced-body"><div className="panel-header"><div><p className="eyebrow">MODELO PROPORCIONAL</p><h2>Seu corpo hoje</h2></div><span className="bmi-badge">IMC {(measurements.weight / ((measurements.height / 100) ** 2)).toFixed(1)}</span></div><BodyFigure measurements={measurements} /><p className="figure-caption">Ombros, tronco, braços e pernas mudam conforme suas medidas.</p></section></div>;
}

function EnhancedProfile({ student, measurements, setMeasurements, onBack }) {
  const history = [{ date: "02 mai", weight: 78, waist: 88 }, { date: "16 mai", weight: 77, waist: 86 }, { date: "30 mai", weight: 76, waist: 85 }, { date: "14 jun", weight: measurements.weight, waist: measurements.waist }];
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
    async function persistMeasurements() {
      setSaving(true);
      setMessage('');
      try {
        await saveMeasurements(measurements, student.id);
        setMessage('Medidas salvas com sucesso.');
      } catch (error) {
        setMessage(`Não foi possível salvar: ${error.message}`);
      } finally {
        setSaving(false);
      }
    }
  function exportHistory() { const csv = ["Data,Peso (kg),Cintura (cm)", ...history.map((item) => `${item.date},${item.weight},${item.waist}`)].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })); const link = document.createElement("a"); link.href = url; link.download = "historico-corporal-atlas.csv"; link.click(); URL.revokeObjectURL(url); }
  return <div className="student-view profile-view"><div className="student-view-header"><div><p className="eyebrow">MEU PERFIL</p><h1>Seus dados, seu progresso</h1><p className="heading-copy">Atualize suas medidas para acompanhar sua evolução.</p></div><button className="outline-button" onClick={onBack}>← Voltar para o treino</button></div><BodyProfileEditor measurements={measurements} setMeasurements={setMeasurements} /><div className="profile-save-row"><button className="primary-button" onClick={persistMeasurements} disabled={saving}>{saving ? 'Salvando...' : 'Salvar medidas'}</button>{message && <span className="profile-status">{message}</span>}</div><section className="panel history-panel"><div className="panel-header"><div><p className="eyebrow">HISTÓRICO CORPORAL</p><h2>Evolução das medidas</h2><p>Compare seus registros ao longo do tempo.</p></div><button className="outline-button" onClick={exportHistory}>↓ Exportar CSV</button></div><div className="history-charts"><div className="history-chart"><div className="history-chart-title"><strong>Peso</strong><span>{measurements.weight} kg atual</span></div><div className="history-line weight-line">{history.map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.weight * 1.02)}px` }}><b>{item.weight}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div><div className="history-chart"><div className="history-chart-title"><strong>Cintura</strong><span>{measurements.waist} cm atual</span></div><div className="history-line waist-line">{history.map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.waist * 1.02)}px` }}><b>{item.waist}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div></div></section></div>;
}

function StudentProfile({ student, measurements, setMeasurements, onBack }) {
  return <EnhancedProfile student={student} measurements={measurements} setMeasurements={setMeasurements} onBack={onBack} />;
  const bodyWidth = Math.max(82, Math.min(130, measurements.hip * 0.92));
  const shoulderWidth = Math.max(75, Math.min(120, measurements.waist * 1.12));
  const bmi = (measurements.weight / ((measurements.height / 100) ** 2)).toFixed(1);
  const history = [{ date: "02 mai", weight: 78, waist: 88 }, { date: "16 mai", weight: 77, waist: 86 }, { date: "30 mai", weight: 76, waist: 85 }, { date: "14 jun", weight: measurements.weight, waist: measurements.waist }];
  function updateMeasurement(key, value) { setMeasurements((current) => ({ ...current, [key]: Number(value) || 0 })); }
  function exportHistory() {
    const csv = ["Data,Peso (kg),Cintura (cm)", ...history.map((item) => `${item.date},${item.weight},${item.waist}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "historico-corporal-atlas.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="student-view profile-view"><div className="student-view-header"><div><p className="eyebrow">MEU PERFIL</p><h1>Seus dados, seu progresso</h1><p className="heading-copy">Atualize suas medidas para acompanhar sua evolução.</p></div><button className="outline-button" onClick={onBack}>← Voltar para o treino</button></div><div className="profile-grid"><section className="panel measurements-panel"><div className="panel-header"><div><h2>Medidas corporais</h2><p>As informações ficam visíveis para você e seu professor.</p></div><span className="profile-status">Atualizado hoje</span></div><div className="measurement-form">{[["height", "Altura", "cm"], ["weight", "Peso", "kg"], ["waist", "Cintura", "cm"], ["hip", "Quadril", "cm"], ["arm", "Braço", "cm"]].map(([key, label, unit]) => <label key={key}>{label}<div><input type="number" min="1" value={measurements[key]} onChange={(event) => updateMeasurement(key, event.target.value)} /><span>{unit}</span></div></label>)}</div><button className="primary-button profile-save" onClick={() => alert("Medidas salvas no protótipo")}>Salvar medidas</button></section><section className="panel body-card"><div className="panel-header"><div><p className="eyebrow">VISUALIZAÇÃO</p><h2>Seu corpo hoje</h2></div><span className="bmi-badge">IMC {bmi}</span></div><div className="body-figure" style={{ "--body-width": `${bodyWidth}px`, "--shoulder-width": `${shoulderWidth}px` }}><div className="figure-head" /><div className="figure-neck" /><div className="figure-torso" /><div className="figure-arm left" /><div className="figure-arm right" /><div className="figure-legs left" /><div className="figure-legs right" /></div><p className="figure-caption">Visualização proporcional baseada nas medidas informadas.</p></section></div><section className="panel history-panel"><div className="panel-header"><div><p className="eyebrow">HISTÓRICO CORPORAL</p><h2>Evolução das medidas</h2><p>Compare seus registros ao longo do tempo.</p></div><button className="outline-button" onClick={exportHistory}>↓ Exportar CSV</button></div><div className="history-charts"><div className="history-chart"><div className="history-chart-title"><strong>Peso</strong><span>{measurements.weight} kg atual</span></div><div className="history-line weight-line">{history.map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.weight * 1.02)}px` }}><b>{item.weight}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div><div className="history-chart"><div className="history-chart-title"><strong>Cintura</strong><span>{measurements.waist} cm atual</span></div><div className="history-line waist-line">{history.map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.waist * 1.02)}px` }}><b>{item.waist}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div></div></section></div>;
}
  <button className="primary-button profile-save" onClick={() => saveMeasurements(measurements, student.id)}>Salvar medidas</button>

function StudentView({ student, onBack }) {
  const studentKey = student.id || student.name;
  const storageKey = (name) => `atlas_${name}_${studentKey}`;
  const [completed, setCompleted] = useState(() => readDemo(storageKey("completed"), []));
  const [selectedExercise, setSelectedExercise] = useState(() => readDemo(storageKey("selected-exercise"), 0));
  const [notes, setNotes] = useState(() => readDemo(storageKey("notes"), {}));
  const [seriesTypes, setSeriesTypes] = useState(() => readDemo(storageKey("series-types"), {}));
  const [chartPeriod, setChartPeriod] = useState(() => readDemo(storageKey("chart-period"), "1 mês"));
  const [studentPanel, setStudentPanel] = useState("workout");
  useEffect(() => writeDemo(storageKey("completed"), completed), [completed, studentKey]);
  useEffect(() => writeDemo(storageKey("selected-exercise"), selectedExercise), [selectedExercise, studentKey]);
  useEffect(() => writeDemo(storageKey("notes"), notes), [notes, studentKey]);
  useEffect(() => writeDemo(storageKey("series-types"), seriesTypes), [seriesTypes, studentKey]);
  useEffect(() => writeDemo(storageKey("chart-period"), chartPeriod), [chartPeriod, studentKey]);
  const [measurements, setMeasurements] = useState(() => readDemo("atlas_measurements", { height: 172, weight: 74, shoulder: 108, chest: 96, waist: 82, hip: 101, armLeft: 34, armRight: 34, thighLeft: 58, thighRight: 58, legLeft: 38, legRight: 38 }));
  useEffect(() => writeDemo("atlas_measurements", measurements), [measurements]);
  const progress = Math.round((completed.length / exercises.length) * 100);
  const activeExercise = exercises[selectedExercise];
  const chartData = {
    "1 semana": [35, 38, 40, 42],
    "15 dias": [32, 35, 38, 40, 42],
    "1 mês": [28, 32, 35, 38, 42],
    "3 meses": [20, 25, 28, 32, 36, 42],
    "6 meses": [15, 20, 22, 26, 30, 34, 38, 42],
    "1 ano": [10, 14, 18, 20, 24, 28, 31, 34, 38, 42],
  };
  const loadHistory = chartData[chartPeriod];

  const measurementDefaults = { height: 172, weight: 74, shoulder: 108, chest: 96, waist: 82, hip: 101, armLeft: 34, armRight: 34, thighLeft: 58, thighRight: 58, legLeft: 38, legRight: 38 };
  const safeMeasurements = Object.fromEntries(Object.entries(measurementDefaults).map(([key, fallback]) => [key, Number(measurements[key]) > 0 ? measurements[key] : fallback]));
  const profileDevEnabled = process.env.NEXT_PUBLIC_PROFILE_DEV === "true";
  if (studentPanel === "profile") return <StudentProfile student={student} measurements={safeMeasurements} setMeasurements={setMeasurements} onBack={() => setStudentPanel("workout")} />;

  function toggleCompleted(index) {
    setCompleted((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
    );
  }

  return (
    <div className="student-view">
      <div className="student-view-header">
        <div>
          <p className="eyebrow">ÁREA DO ALUNO</p>
          <h1>Olá, {student.name.split(" ")[0]}!</h1>
          <p className="heading-copy">
            Seu treino de hoje está pronto. Vamos começar?
          </p>
        </div>
        <button className="outline-button profile-button" disabled={!profileDevEnabled} onClick={() => setStudentPanel("profile")}>
          <UserRound size={15} /> {profileDevEnabled ? "Meu perfil" : "Perfil em desenvolvimento"}
        </button><button className="outline-button" onClick={onBack}>
          ← Visão do administrador
        </button>
      </div>
      <div className="student-hero">
        <div>
          <span className="student-pill">TREINO A</span>
          <h2>Pernas e glúteos</h2>
          <p>Foco em força e hipertrofia · 5 exercícios</p>
        </div>
        <div className="progress-ring">
          <strong>{progress}%</strong>
          <small>concluído</small>
        </div>
      </div>
      <div className="student-workout-layout">
        <section className="panel student-exercises">
          <div className="panel-header">
            <div>
              <h2>Seu treino de hoje</h2>
              <p>Selecione um exercício para registrar sua série.</p>
            </div>
            <strong className="exercise-count">
              {completed.length}/{exercises.length}
            </strong>
          </div>
          <div className="student-exercise-list">
            {exercises.map((exercise, index) => (
              <div
                className={
                  selectedExercise === index
                    ? "student-exercise selected"
                    : completed.includes(index)
                      ? "student-exercise completed"
                      : "student-exercise"
                }
                key={exercise.name}
                onClick={() => setSelectedExercise(index)}
              >
                <button
                  className="check-circle"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCompleted(index);
                  }}
                  aria-label={
                    completed.includes(index)
                      ? `Desmarcar ${exercise.name}`
                      : `Concluir ${exercise.name}`
                  }
                >
                  {completed.includes(index) ? "✓" : index + 1}
                </button>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.detail}</small>
                </span>
                <b>{exercise.load}</b>
                <i>{completed.includes(index) ? "Concluído" : exercise.rest}</i>
                <button
                  className="complete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCompleted(index);
                  }}
                >
                  {completed.includes(index) ? "Concluído" : "Concluir"}
                </button>
              </div>
            ))}
          </div>
          <div className="exercise-detail">
            <div className="detail-heading">
              <div>
                <p className="eyebrow">REGISTRO DA SÉRIE</p>
                <h3>{activeExercise.name}</h3>
              </div>
              <span>{activeExercise.detail}</span>
            </div>
            <div className="detail-fields">
              <label>
                Carga usada
                <input
                  value={notes[selectedExercise] || activeExercise.load}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [selectedExercise]: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Tipo de série
                <select
                  value={seriesTypes[selectedExercise] || "Normal"}
                  onChange={(event) =>
                    setSeriesTypes((current) => ({
                      ...current,
                      [selectedExercise]: event.target.value,
                    }))
                  }
                >
                  <option>Normal</option>
                  <option>Drop set</option>
                  <option>Bi-set</option>
                  <option>Triset</option>
                  <option>Pirâmide crescente</option>
                  <option>Pirâmide decrescente</option>
                  <option>Rest-pause</option>
                </select>
              </label>
              <button
                className="primary-button"
                onClick={() => toggleCompleted(selectedExercise)}
              >
                {completed.includes(selectedExercise)
                  ? "✓ Série concluída"
                  : "Marcar como concluído"}
              </button>
            </div>
          </div>
        </section>
        <aside className="student-side">
          <div className="panel load-chart">
            <div className="panel-header">
              <div>
                <p className="eyebrow">EVOLUÇÃO DE CARGA</p>
                <h2>{activeExercise.name}</h2>
              </div>
              <span className="chart-period">
                {loadHistory.length} registros
              </span>
            </div>
            <div className="chart-range">
              {Object.keys(chartData).map((period) => (
                <button
                  className={
                    chartPeriod === period
                      ? "range-button active"
                      : "range-button"
                  }
                  key={period}
                  onClick={() => setChartPeriod(period)}
                >
                  {period}
                </button>
              ))}
            </div>
            <div className="chart">
              <div className="chart-y">
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>
              <div className="chart-bars">
                {loadHistory.map((load, index) => (
                  <div className="bar-column" key={`${load}-${index}`}>
                    <strong>{load} kg</strong>
                    <span
                      className={
                        index === loadHistory.length - 1 ? "bar current" : "bar"
                      }
                      style={{ height: `${load * 1.35}px` }}
                    />
                    <small>
                      {index === loadHistory.length - 1
                        ? "Hoje"
                        : `T${index + 1}`}
                    </small>
                  </div>
                ))}
              </div>
            </div>
            <p className="chart-caption">
              Último registro:{" "}
              <strong>{notes[selectedExercise] || activeExercise.load}</strong>
            </p>
          </div>
          <div className="student-side-card">
            <p className="eyebrow">SEU OBJETIVO</p>
            <h3>{student.goal}</h3>
            <p>Consistência é o que transforma esforço em resultado.</p>
          </div>
          <div className="student-side-card tip">
            <p className="eyebrow">LEMBRETE</p>
            <h3>Não esqueça da água</h3>
            <p>Mantenha-se hidratado durante todo o treino.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Home() {
  const defaultWorkouts = [{ id: 1, title: "Treino A · Pernas e glúteos", student: "Rhuan", admin: "Rhuan", exercises: 5, frequency: "4x por semana", goal: "Hipertrofia", exerciseList: exercises }];
  const defaultExercises = ["Agachamento livre", "Leg press 45°", "Cadeira extensora", "Mesa flexora", "Hip thrust", "Puxada frontal", "Supino reto", "Elevação lateral"];
  const [students, setStudents] = useState(() => readDemo(demoKeys.students, initialStudents));
  const [selectedStudent, setSelectedStudent] = useState(() => readDemo(demoKeys.students, initialStudents)[0]);
  const [workoutPlans, setWorkoutPlans] = useState(() => readDemo(demoKeys.workouts, defaultWorkouts));
  const [adminList, setAdminList] = useState(() => readDemo(demoKeys.admins, adminUsers));
  const [exerciseList, setExerciseList] = useState(() => readDemo(demoKeys.exercises, defaultExercises));
  useEffect(() => writeDemo(demoKeys.students, students), [students]);
  useEffect(() => writeDemo(demoKeys.workouts, workoutPlans), [workoutPlans]);
  useEffect(() => writeDemo(demoKeys.admins, adminList), [adminList]);
  useEffect(() => writeDemo(demoKeys.exercises, exerciseList), [exerciseList]);
  useEffect(() => {
    if (!selectedStudent || students.some((student) => student.name === selectedStudent.name)) return;
    setSelectedStudent(students[0] || initialStudents[0]);
  }, [students, selectedStudent]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [mode, setMode] = useState("admin");
  const [showWorkoutEditor, setShowWorkoutEditor] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [toast, setToast] = useState("");
  const [adminView, setAdminView] = useState("students");
  const [createType, setCreateType] = useState(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const selectedWorkout = workoutPlans.find((plan) => plan.studentId === selectedStudent?.id) || workoutPlans[0];

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        const { loadAtlasData } = await import("../lib/atlas-data");
        const data = await loadAtlasData({ students: initialStudents, workouts: defaultWorkouts, admins: adminUsers, exercises: defaultExercises });
        if (!active) return;
        setStudents(data.students);
        setWorkoutPlans(data.workouts);
        setAdminList(data.admins);
        setExerciseList(data.exercises);
        setSelectedStudent(data.students[0] || initialStudents[0]);
      } catch (error) {
        showAction(`Não foi possível carregar os dados: ${error.message}`);
      } finally {
        if (active) setIsHydrating(false);
      }
    }
    hydrate();
    return () => { active = false; };
  }, []);

  const filteredStudents = students.filter((student) => {
    const matchesQuery = student.name
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFilter = filter === "Todos" || student.status === filter;
    return matchesQuery && matchesFilter;
  });

  async function addStudent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), confirmPassword: form.get('password'), role: 'student', active: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível cadastrar o aluno.');
      const student = { id: body.user.id, name: body.user.name, initials: body.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(), goal: form.get('goal'), status: 'Em dia', color: 'coral', updated: 'Agora' };
      setStudents((current) => [student, ...current]); setSelectedStudent(student); setShowModal(false); showAction('Aluno cadastrado com sucesso.');
    } catch (error) { showAction(error.message); }
  }

  function showAction(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function createModuleItem(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (createType === "admin") setAdminList((current) => [...current, { name: form.get("name"), email: `${form.get("username")}@atlas.training`, role: form.get("role"), initials: String(form.get("name")).split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() }]);
    if (createType === "exercise") setExerciseList((current) => [...current, form.get("name")]);
    if (createType === "workout") setWorkoutPlans((current) => [...current, { id: Date.now(), title: form.get("title"), student: form.get("student"), admin: "Rhuan", exercises: 0 }]);
    setCreateType(null); showAction("Cadastro salvo com sucesso");
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          <span>
            atlas<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">AT</span>
          <span>
            <strong>Atlas Training</strong>
            <small>Unidade Centro</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon, key }) => (
            <button
              className={
                adminView === key && mode === "admin"
                  ? "nav-item active"
                  : "nav-item"
              }
              key={label}
              onClick={() => {
                setMode("admin");
                setAdminView(key);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {adminView === key && mode === "admin" && (
                <span className="nav-indicator" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => showAction("Configurações ainda não estão disponíveis")}
          >
            <Settings size={18} />
            <span>Configurações</span>
          </button>
          <button
            className="user-card role-switcher"
            onClick={() => setMode(mode === "admin" ? "student" : "admin")}
          >
            <span className="user-avatar">RH</span>
            <span>
                <strong>Rhuan</strong>
              <small>
                {mode === "admin"
                  ? "Ver visão do aluno"
                  : "Voltar ao administrador"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <button
            className="logout"
            onClick={async () => {
              const { error } = await createSupabaseBrowserClient().auth.signOut();
              if (error) showAction(`Não foi possível sair: ${error.message}`);
              else window.location.href = "/login";
            }}
          >
            <LogOut size={16} /> Sair da conta
          </button>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Abrir menu"
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>{mode === "admin" ? "Alunos" : "Área do aluno"}</span>
            <ChevronRight size={15} />
            <strong>{selectedStudent.name}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button notification"
              onClick={() => showAction("Você não tem novas notificações")}
              aria-label="Notificações"
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="topbar-divider" />
            <span className="topbar-date">
              <Clock3 size={15} /> Sexta, 14 de junho
            </span>
          </div>
        </header>
        {mode === "student" ? (
          <StudentView
            student={selectedStudent}
            onBack={() => setMode("admin")}
          />
        ) : adminView !== "students" ? (
          <AdminModule
            view={adminView}
            students={students}
            workoutPlans={workoutPlans}
            adminList={adminList}
            exerciseList={exerciseList}
            onNewStudent={() => setShowModal(true)}
            onAction={showAction}
            onNavigate={setAdminView}
            onCreate={setCreateType}
          />
        ) : (
          <div className="page-content">
            {isHydrating && <p className="heading-copy">Carregando dados da academia...</p>}
            <div className="page-heading">
              <div>
                <p className="eyebrow">GESTÃO DE ALUNOS</p>
                <h1>Alunos</h1>
                <p className="heading-copy">
                  Acompanhe seus alunos e mantenha as fichas sempre em dia.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setShowModal(true)}
              >
                <Plus size={18} /> Novo aluno
              </button>
            </div>
            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-icon coral-bg">
                  <UsersRound size={18} />
                </span>
                <span>
                  <small>Total de alunos</small>
                  <strong>{students.length}</strong>
                </span>
                <em>
                  +12% <small>este mês</small>
                </em>
              </div>
              <div className="stat-card">
                <span className="stat-icon green-bg">
                  <ClipboardList size={18} />
                </span>
                <span>
                  <small>Fichas ativas</small>
                  <strong>38</strong>
                </span>
                <em>
                  +8% <small>este mês</small>
                </em>
              </div>
              <div className="stat-card">
                <span className="stat-icon yellow-bg">
                  <Clock3 size={18} />
                </span>
                <span>
                  <small>Para revisar</small>
                  <strong>04</strong>
                </span>
                <em className="neutral">Atenção necessária</em>
              </div>
            </div>
            <div className="dashboard-grid">
              <section className="panel students-panel">
                <div className="panel-header">
                  <div>
                    <h2>
                      Seus alunos <span>{students.length}</span>
                    </h2>
                    <p>Selecione um aluno para visualizar a ficha.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setFilter("Todos")}
                  >
                    Ver todos <ChevronRight size={15} />
                  </button>
                </div>
                <div className="toolbar">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      placeholder="Buscar aluno..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <div className="filter-tabs">
                    {["Todos", "Em dia", "Revisar"].map((item) => (
                      <button
                        className={filter === item ? "filter active" : "filter"}
                        key={item}
                        onClick={() => setFilter(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="student-list">
                  {filteredStudents.map((student) => (
                    <button
                      className={
                        selectedStudent.name === student.name
                          ? "student-row selected"
                          : "student-row"
                      }
                      key={student.name}
                      onClick={() => setSelectedStudent(student)}
                    >
                      <span className={`student-avatar ${student.color}`}>
                        {student.initials}
                      </span>
                      <span className="student-info">
                        <strong>{student.name}</strong>
                        <small>{student.goal}</small>
                      </span>
                      <span
                        className={`status ${student.status.toLowerCase().replace(" ", "-")}`}
                      >
                        <i />
                        {student.status}
                      </span>
                      <ChevronRight className="row-arrow" size={17} />
                    </button>
                  ))}
                  {filteredStudents.length === 0 && (
                    <div className="empty-state">Nenhum aluno encontrado.</div>
                  )}
                </div>
                <button
                  className="add-student-link"
                  onClick={() => setShowModal(true)}
                >
                  <Plus size={16} /> Cadastrar novo aluno
                </button>
              </section>
              <section className="panel workout-panel">
                <div className="workout-top">
                  <div>
                    <p className="eyebrow">FICHA ATUAL</p>
                    <h2>{selectedStudent.name}</h2>
                    <p className="workout-subtitle">
                      {selectedWorkout?.title || 'Sem ficha'}
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => setShowWorkoutEditor(true)}
                  >
                    <span className="edit-icon">✎</span> Editar ficha
                  </button>
                </div>
                <div className="workout-meta">
                  <span>
                    <strong>Objetivo</strong>
                    {selectedStudent.goal}
                  </span>
                  <span>
                    <strong>Frequência</strong>4x por semana
                  </span>
                  <span>
                    <strong>Atualizada em</strong>
                    {selectedStudent.updated}
                  </span>
                </div>
                <div className="exercise-heading">
                  <h3>
                    Exercícios <span>{(selectedWorkout?.exerciseList || exercises).length}</span>
                  </h3>
                  <button
                    className="icon-button"
                    onClick={() => setShowExerciseModal(true)}
                    aria-label="Adicionar exercício"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="exercise-list">
                  {(selectedWorkout?.exerciseList || exercises).map((exercise, index) => (
                    <div className="exercise-row" key={`${exercise.name}-${index}`}>
                      <span className="exercise-number">0{index + 1}</span>
                      <span className="exercise-name">
                        <strong>{exercise.name}</strong>
                        <small>{exercise.detail}</small>
                      </span>
                      <span className="exercise-value">
                        <small>CARGA</small>
                        <strong>{exercise.load}</strong>
                      </span>
                      <span className="exercise-value rest">
                        <small>DESCANSO</small>
                        <strong>{exercise.rest}</strong>
                      </span>
                      <button
                        className="more-button"
                        onClick={() => showAction(`Opções de ${exercise.name}`)}
                        aria-label={`Opções de ${exercise.name}`}
                      >
                        •••
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="view-workout"
                  onClick={() => setMode("student")}
                >
                  Visualizar ficha completa <ChevronRight size={16} />
                </button>
              </section>
            </div>
          </div>
        )}
      </section>
      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setShowModal(false)
          }
        >
          <div className="modal">
            <button
              className="modal-close"
              onClick={() => setShowModal(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <span className="modal-kicker">
              <UserRound size={16} />
            </span>
            <h2>Novo aluno</h2>
            <p>Cadastre o aluno para criar a primeira ficha de treino.</p>
            <form onSubmit={addStudent}>
              <label>
                Nome completo
                <input name="name" required placeholder="Ex: Ana Souza" />
              </label>
              <label>
                E-mail / login
                <input name="email" type="email" required placeholder="ana@email.com" />
              </label>
              <label>
                Senha inicial
                <input name="password" type="password" required minLength="8" autoComplete="new-password" />
              </label>
              <label>
                Objetivo principal
                <select name="goal" defaultValue="Hipertrofia">
                  <option>Hipertrofia</option>
                  <option>Emagrecimento</option>
                  <option>Condicionamento</option>
                  <option>Força</option>
                </select>
              </label>
              <button className="primary-button" type="submit">
                Cadastrar aluno <ChevronRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
      {showWorkoutEditor && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="modal-close"
              onClick={() => setShowWorkoutEditor(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <span className="modal-kicker">
              <ClipboardList size={16} />
            </span>
            <h2>Editar ficha</h2>
            <p>
              Atualize os dados principais da ficha de {selectedStudent.name}.
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const updatedWorkout = { ...(selectedWorkout || {}), id: selectedWorkout?.id || Date.now(), title: form.get('title'), frequency: form.get('frequency'), studentId: selectedStudent.id, student: selectedStudent.name, goal: selectedStudent.goal, exerciseList: selectedWorkout?.exerciseList || exercises };
                try { await saveWorkout(updatedWorkout, selectedStudent.id); setWorkoutPlans((current) => current.some((plan) => plan.id === updatedWorkout.id) ? current.map((plan) => plan.id === updatedWorkout.id ? { ...plan, ...updatedWorkout, exercises: updatedWorkout.exerciseList.length } : plan) : [updatedWorkout, ...current]); setShowWorkoutEditor(false); showAction("Ficha atualizada com sucesso"); }
                catch (error) { showAction(`Não foi possível salvar a ficha: ${error.message}`); }
              }}
            >
              <label>
                Nome do treino
                <input name="title" defaultValue={selectedWorkout?.title || "Treino A - Pernas e glúteos"} required />
              </label>
              <label>
                Frequência
                  <select name="frequency" defaultValue={selectedWorkout?.frequency || "4x por semana"}>
                  <option>2x por semana</option>
                  <option>3x por semana</option>
                  <option>4x por semana</option>
                  <option>5x por semana</option>
                </select>
              </label>
              <button className="primary-button" type="submit">
                Salvar alterações
              </button>
            </form>
          </div>
        </div>
      )}
      {showExerciseModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="modal-close"
              onClick={() => setShowExerciseModal(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <span className="modal-kicker">
              <Dumbbell size={16} />
            </span>
            <h2>Adicionar exercício</h2>
            <p>Inclua um novo exercício na ficha atual.</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const updatedWorkout = { ...(selectedWorkout || {}), id: selectedWorkout?.id || Date.now(), title: selectedWorkout?.title || 'Nova ficha', frequency: selectedWorkout?.frequency || '4x por semana', studentId: selectedStudent.id, student: selectedStudent.name, goal: selectedStudent.goal, exerciseList: [...(selectedWorkout?.exerciseList || []), { name: form.get('name'), detail: '3 séries · 10–12 reps', load: form.get('load'), rest: '60s' }] };
                try { await saveWorkout(updatedWorkout, selectedStudent.id); setWorkoutPlans((current) => current.some((plan) => plan.id === updatedWorkout.id) ? current.map((plan) => plan.id === updatedWorkout.id ? { ...plan, ...updatedWorkout, exercises: updatedWorkout.exerciseList.length } : plan) : [updatedWorkout, ...current]); setShowExerciseModal(false); showAction("Exercício adicionado à ficha"); }
                catch (error) { showAction(`Não foi possível adicionar: ${error.message}`); }
              }}
            >
              <label>
                Exercício
                  <input name="name" required placeholder="Ex: Hip thrust" />
              </label>
              <label>
                Carga
                  <input name="load" required placeholder="Ex: 40 kg" />
              </label>
              <button className="primary-button" type="submit">
                Adicionar exercício
              </button>
            </form>
          </div>
        </div>
      )}
      {createType && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCreateType(null)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setCreateType(null)} aria-label="Fechar"><X size={18} /></button>
            <span className="modal-kicker"><Plus size={16} /></span>
            <h2>{createType === "admin" ? "Novo administrador" : createType === "workout" ? "Nova ficha de treino" : "Novo exercício"}</h2>
            <p>Preencha os dados para adicionar este cadastro ao sistema.</p>
            <form onSubmit={createModuleItem}>
              {createType === "admin" && <><label>Nome completo<input name="name" required placeholder="Nome do profissional" /></label><label>Usuário<input name="username" required placeholder="usuario" /></label><label>Função<select name="role" defaultValue="Professor"><option>Professor</option><option>Administrador</option></select></label></>}
              {createType === "workout" && <><label>Nome da ficha<input name="title" required placeholder="Treino A · Corpo inteiro" /></label><label>Aluno<select name="student" defaultValue={students[0]?.name}>{students.map((student) => <option key={student.name}>{student.name}</option>)}</select></label></>}
              {createType === "exercise" && <><label>Nome do exercício<input name="name" required placeholder="Ex: Remada baixa" /></label><label>Grupo muscular<select defaultValue="Costas"><option>Peito</option><option>Costas</option><option>Pernas</option><option>Ombros</option><option>Braços</option></select></label></>}
              <button className="primary-button" type="submit">Salvar cadastro</button>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
