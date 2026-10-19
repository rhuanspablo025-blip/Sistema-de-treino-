"use client";

import { useEffect, useState } from "react";
import { saveMeasurements } from "../lib/atlas-data";
import WorkoutPlanManager from "../components/WorkoutPlanManager";
import FinancialManager from "../components/FinancialManager";
import { isSuperAdmin as isSuperAdminAccount } from "../lib/roles";

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

const emptyStudent = { name: 'Nenhum aluno cadastrado', initials: '--', goal: 'Não definido', status: 'Em dia', color: 'coral', updated: 'Sem ficha' };

const navItems = [
  { label: "Visão geral", icon: LayoutDashboard, key: "overview" },
  { label: "Cadastros", icon: UserRound, key: "admins" },
  { label: "Fichas de treino", icon: ClipboardList, key: "workouts" },
  { label: "Financeiro", icon: BarChart3, key: "finance" },
  { label: "Documentação", icon: ClipboardList, key: "documentation" },
];

function DocumentationModule() {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/documentation').then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a documentação.');
      if (active) setMarkdown(body.markdown);
    }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const blocks = markdown.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  function renderBlock(block, index) {
    const lines = block.split('\n');
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={index}>{lines.map((line) => <li key={line}>{line.replace(/^[-*] /, '')}</li>)}</ul>;
    if (/^### /.test(block)) return <h3 key={index}>{block.slice(4)}</h3>;
    if (/^## /.test(block)) return <h2 key={index}>{block.slice(3)}</h2>;
    if (/^# /.test(block)) return <h1 key={index}>{block.slice(2)}</h1>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={`${index}-${lineIndex}`}>{line}{lineIndex < lines.length - 1 && <br />}</span>)}</p>;
  }

  return <div className="page-content documentation-page"><div className="page-heading"><div><p className="eyebrow">REFERÊNCIA DO SISTEMA</p><h1>Documentação</h1><p className="heading-copy">Visão geral das áreas, dos dados e das regras implementadas.</p></div></div>{error && <p className="login-error" role="alert">{error}</p>}{loading ? <p className="heading-copy">Carregando documentação...</p> : !error && <article className="panel documentation-content">{blocks.map(renderBlock)}</article>}</div>;
}

function UserManagement({ trainers = [] }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [roleFilter, setRoleFilter] = useState('Todos');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRoles, setEditingRoles] = useState(['student']);
  const editingRole = ['admin', 'dev', 'trainer', 'student'].find((role) => editingRoles.includes(role)) || 'student';
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
    payload.financialAccessExempt = form.get('financialAccessExempt') === 'on';
    payload.role = editingRole;
    payload.roles = editingRoles;
    try {
      const response = await fetch('/api/users', { method: editingUser?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingUser?.id ? { ...payload, id: editingUser.id } : payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o usuário.');
      setEditingUser(null);
      setFeedback(editingUser?.needsAccount ? 'Acesso do aluno criado.' : editingUser?.id ? 'Usuário atualizado.' : 'Usuário criado.');
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
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, ...body.user } : item));
      setFeedback(user.active ? 'Usuário desativado.' : 'Usuário ativado.');
    } catch (toggleError) { setError(toggleError.message); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Excluir ${user.name}? A conta será removida dos cadastros e não poderá ser reativada. O histórico será preservado.`)) return;
    try {
      const response = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível excluir o usuário.');
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, active: false, deletedAt: new Date().toISOString() } : item));
      setFeedback('Cadastro excluído. O histórico foi preservado.');
    } catch (deleteError) { setError(deleteError.message); }
  }

  const filteredUsers = users.filter((user) => {
    const matchesQuery = `${user.name} ${user.username}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === 'Todos'
      ? !user.deletedAt
      : statusFilter === 'Excluídos'
        ? Boolean(user.deletedAt)
        : statusFilter === 'Ativos'
          ? !user.deletedAt && user.active !== false
          : !user.deletedAt && user.active === false;
    const matchesRole = roleFilter === 'Todos' || (user.roles || [user.role]).includes(roleFilter);
    return matchesQuery && matchesStatus && matchesRole;
  });
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const roleLabels = { student: 'Aluno', trainer: 'Professor', admin: 'Administrador', dev: 'Desenvolvedor', SUPER_ADMIN: 'Proprietário' };
  const trainerOptions = (users.length ? users : trainers).filter((user) => user.active !== false && !user.deletedAt && (user.role === 'trainer' || (user.roles || []).includes('trainer')));
  const counts = {
    total: users.filter((user) => !user.deletedAt).length,
    active: users.filter((user) => !user.deletedAt && user.active !== false).length,
    students: users.filter((user) => !user.deletedAt && (user.roles || [user.role]).includes('student')).length,
    team: users.filter((user) => !user.deletedAt && (user.roles || [user.role]).some((role) => ['admin', 'dev', 'trainer'].includes(role))).length,
  };

  return <div className="page-content user-management-page">
    <div className="page-heading"><div><p className="eyebrow">GESTÃO DE PESSOAS</p><h1>Cadastros</h1><p className="heading-copy">Uma pessoa, um login e os perfis que ela precisa.</p></div><button className="primary-button" onClick={() => { setEditingRoles(['student']); setEditingUser({}); }}><Plus size={17} /> Novo cadastro</button></div>
    <div className="stats-row user-stats"><div className="stat-card"><span className="stat-icon coral-bg"><UsersRound size={18} /></span><span><small>Total de cadastros</small><strong>{counts.total}</strong></span></div><div className="stat-card"><span className="stat-icon green-bg"><UserRound size={18} /></span><span><small>Alunos</small><strong>{counts.students}</strong></span></div><div className="stat-card"><span className="stat-icon yellow-bg"><Settings size={18} /></span><span><small>Equipe</small><strong>{counts.team}</strong></span></div></div>
    <section className="panel module-panel user-directory"><div className="panel-header user-directory-heading"><div><h2>Pessoas e acessos</h2><p>Edite perfis, redefina senhas e altere o status de acesso.</p></div><span className="user-active-count">{counts.active} ativos</span></div>
    <div className="user-filters"><div className="search-box"><Search size={17} /><input aria-label="Buscar cadastro" placeholder="Buscar por nome ou usuário..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div><label className="user-filter-select"><span>Perfil</span><select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option value="Todos">Todos os perfis</option><option value="student">Alunos</option><option value="trainer">Professores</option><option value="admin">Administradores</option><option value="dev">Desenvolvedores</option></select></label><div className="filter-tabs">{['Todos', 'Ativos', 'Inativos', 'Excluídos'].map((item) => <button className={statusFilter === item ? 'filter active' : 'filter'} key={item} onClick={() => { setStatusFilter(item); setPage(1); }}>{item}</button>)}</div></div>
    {error && <p className="login-error" role="alert">{error}</p>}{feedback && <p className="profile-status" role="status">{feedback}</p>}
    {loading ? <p className="empty-state">Carregando cadastros...</p> : visibleUsers.length === 0 ? <p className="empty-state">Nenhum cadastro encontrado com esses filtros.</p> : <div className="user-directory-list">{visibleUsers.map((user) => { const protectedAccount = user.role === 'SUPER_ADMIN'; const lockedAccount = protectedAccount || Boolean(user.deletedAt); const roles = user.roles || [user.role]; return <article className={`user-directory-row ${user.deletedAt ? 'is-deleted' : user.active === false ? 'is-inactive' : ''}`} key={user.id}><span className="student-avatar coral">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="user-directory-name"><strong>{user.name}</strong><small>@{user.username}</small></span><span className="user-role-badge">{roles.map((role) => roleLabels[role]).filter(Boolean).join(' · ') || 'Usuário'}</span><span className={`status ${user.deletedAt ? 'deleted' : user.active === false ? 'inativo' : ''}`}><i />{user.deletedAt ? 'Excluído' : user.active === false ? 'Inativo' : 'Ativo'}</span><div className="user-row-actions"><button className="outline-button small-button" onClick={() => { setEditingUser(user); setEditingRoles(roles.filter((role) => ['student','trainer','admin','dev'].includes(role))); }} disabled={lockedAccount}>Editar</button><button className="user-action-button" onClick={() => toggleUser(user)} disabled={lockedAccount} aria-label={user.active === false ? `Ativar ${user.name}` : `Inativar ${user.name}`}>{user.active === false ? 'Ativar' : 'Inativar'}</button><button className="user-action-button danger" onClick={() => deleteUser(user)} disabled={lockedAccount} aria-label={`Excluir ${user.name}`}>Excluir</button></div></article>; })}</div>}
    <div className="user-directory-footer"><small>{filteredUsers.length} cadastro(s)</small><div><button className="filter" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span> Página {page} de {pageCount} </span><button className="filter" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Próxima</button></div></div></section>
    {editingUser && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingUser(null)}><div className="modal user-editor-modal"><button className="modal-close" onClick={() => setEditingUser(null)} aria-label="Fechar"><X size={18} /></button><span className="modal-kicker"><UserRound size={16} /></span><h2>{editingUser.needsAccount ? 'Criar acesso do aluno' : editingUser.id ? 'Editar cadastro' : 'Novo cadastro'}</h2><p>{editingUser.needsAccount ? 'O perfil já existe. Defina usuário e senha para liberar o acesso.' : 'Use um único login e marque todos os perfis dessa pessoa.'}</p><form onSubmit={saveUser}><fieldset className="user-role-picker" disabled={editingUser.role === 'SUPER_ADMIN' || editingUser.needsAccount}><legend>Perfis e acessos</legend>{[['student','Aluno'],['trainer','Professor'],['admin','Administrador'],['dev','Desenvolvedor']].map(([role,label]) => <label key={role}><input type="checkbox" checked={editingRoles.includes(role)} onChange={(event) => setEditingRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))} />{label}</label>)}</fieldset><label>Nome completo<input name="name" required minLength="2" defaultValue={editingUser.name || ''} /></label><label>Nome de usuário<input name="username" required minLength="3" maxLength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]" defaultValue={editingUser.username || ''} autoComplete="username" /></label><div className="user-editor-profile-fields" data-roles={editingRoles.join(' ')}><label data-profile="student">Objetivo<input name="goal" defaultValue={editingUser.goal || ''} placeholder="Ex.: hipertrofia" /></label><label data-profile="student">Telefone<input name="phone" type="tel" defaultValue={editingUser.phone || ''} autoComplete="tel" /></label><label data-profile="student">Data de nascimento<input name="dateOfBirth" type="date" defaultValue={editingUser.dateOfBirth || ''} /></label><label data-profile="student">Professor/personal responsável<select name="trainerId" required={editingRoles.includes('student')} defaultValue={editingUser.trainerId || ''}><option value="" disabled>Selecione um professor/personal ou aluno avulso</option><option value="avulso">Aluno avulso (sem personal)</option>{trainerOptions.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.id === editingUser.id ? ' (eu mesmo)' : ''}</option>)}</select></label><label data-profile="trainer">CREF<input name="cref" defaultValue={editingUser.cref || ''} /></label></div>{editingRoles.some((role) => ['admin','dev'].includes(role)) && <label className="user-active-toggle"><input name="financialAccessExempt" type="checkbox" defaultChecked={editingUser.financialAccessExempt === true} /> Acesso permanente ao financeiro, sem bloqueio por vencimento</label>}<label>Senha {editingUser.needsAccount ? '(obrigatória para criar acesso)' : editingUser.id ? '(deixe em branco para manter)' : ''}<input name="password" type="password" minLength="8" required={!editingUser.id || editingUser.needsAccount} autoComplete="new-password" /></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength="8" required={!editingUser.id || editingUser.needsAccount} autoComplete="new-password" /></label><label className="user-active-toggle"><input name="active" type="checkbox" defaultChecked={editingUser.active !== false} /> Cadastro ativo</label><button className="primary-button" disabled={saving || editingRoles.length === 0}>{saving ? 'Salvando...' : editingUser.needsAccount ? 'Criar acesso' : 'Salvar cadastro'}</button></form></div></div>}
  </div>;
}

function SettingsModule() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/settings').then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Falha ao carregar.'); setSettings(body.settings); }).catch((reason) => setError(reason.message)); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Falha ao salvar.'); setSettings(body.settings); setMessage('Configurações salvas.'); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  return <div className="page-content settings-page"><div className="page-heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Configurações</h1><p className="heading-copy">Dados da academia que aparecem no sistema.</p></div></div>{error && <p className="login-error" role="alert">{error}</p>}{message && <p className="profile-status" role="status">{message}</p>}{!settings ? <p className="heading-copy">Carregando configurações...</p> : <form className="panel settings-form" onSubmit={save}><h2>Identificação da academia</h2><p className="heading-copy">Edite o nome e os dados de contato usados pela equipe.</p><div className="settings-fields"><label>Nome da academia<input name="academyName" required maxLength="100" defaultValue={settings.academyName} /></label><label>Unidade<input name="unitName" required maxLength="100" defaultValue={settings.unitName} /></label><label>Telefone<input name="phone" type="tel" maxLength="40" defaultValue={settings.phone} /></label><label>E-mail<input name="email" type="email" maxLength="160" defaultValue={settings.email} /></label><label>Fuso horário<select name="timezone" defaultValue={settings.timezone}><option value="America/Sao_Paulo">Brasília</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Cuiaba">Cuiabá</option><option value="America/Recife">Recife</option></select></label></div><button className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar configurações'}</button></form>}</div>;
}

function AdminModule({ view, students, workoutPlans, adminList, exerciseList, onNewStudent, onAction, onNavigate, onCreate, canManageUsers, isHydrating, currentUser }) {
  const documentationRoles = currentUser?.roles || [currentUser?.role];
  if (view === 'documentation') return documentationRoles.some((role) => ['admin', 'SUPER_ADMIN'].includes(role)) ? <DocumentationModule /> : <div className="page-content"><p className="login-error">Acesso negado.</p></div>;
  const moduleData = {
    overview: {
      kicker: "VISÃO GERAL",
      title: "Central da academia",
      copy: "Tenha uma visão rápida dos cadastros e das fichas em movimento.",
    },
    admins: {
      kicker: "GESTÃO DE ACESSOS",
      title: "Cadastros",
      copy: "Organize todos os perfis e acessos da sua academia.",
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
  if (view === 'finance') return (isSuperAdminAccount(currentUser) || currentUser?.financialAccessExempt === true) ? <FinancialManager /> : <div className="page-content"><p className="login-error">Acesso negado.</p></div>;
  if (view === 'settings') return <SettingsModule />;
  if (view === "workouts" || view === "exercises") { const roles = currentUser?.roles || [currentUser?.role]; const isTrainerOnly = roles.includes('trainer') && !roles.some((role) => ['admin','dev','SUPER_ADMIN'].includes(role)); return <WorkoutPlanManager students={students} studentsLoading={isHydrating} onNewStudent={onNewStudent} onGoToExercises={() => onNavigate("workouts")} canEdit={['admin','dev','trainer','SUPER_ADMIN'].includes(currentUser?.role) || roles.some((role) => ['admin','dev','trainer','SUPER_ADMIN'].includes(role))} requireStudentSelection={isTrainerOnly} initialTab={view === 'exercises' ? 'library' : 'plans'} />; }
  if (view === "admins") return <UserManagement trainers={adminList.filter((user) => user.role === 'trainer' || (user.roles || []).includes('trainer'))} />;
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
            <strong>{exerciseList.length}</strong>
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
            <button onClick={() => onNavigate("workouts")}>
              <ClipboardList size={17} />
              <span>
                Nova ficha<strong>Montar treino por exercícios</strong>
              </span>
              <ChevronRight size={16} />
            </button>
            {canManageUsers && <button
              onClick={() => onCreate("admin")}
            >
              <UserRound size={17} />
              <span>
                Novo administrador<strong>Convidar profissional</strong>
              </span>
              <ChevronRight size={16} />
            </button>}
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
        {view !== 'admins' && <button className="primary-button" onClick={() => onCreate(view === "workouts" ? "workout" : "exercise")}><Plus size={18} /> {view === "workouts" ? "Nova ficha" : "Novo exercício"}</button>}
      </div>
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
  function update(key, value) { setMeasurements((current) => ({ ...current, [key]: value === '' ? '' : Number(value) })); }
  const bmi = Number(measurements.height) > 0 && Number(measurements.weight) > 0 ? (measurements.weight / ((measurements.height / 100) ** 2)).toFixed(1) : '—';
  return <div className="enhanced-profile-grid"><section className="panel measurements-panel enhanced-measurements"><div className="panel-header"><div><h2>Mapa de medidas</h2><p>Edite cada região para atualizar o modelo em tempo real.</p></div><span className="profile-status">Atualização ao vivo</span></div><div className="measurement-form enhanced-form">{fields.map(([key, label, unit]) => <label key={key}>{label}<div><input type="number" min="1" value={measurements[key] ?? ''} onChange={(event) => update(key, event.target.value)} /><span>{unit}</span></div></label>)}</div></section><section className="panel body-card enhanced-body"><div className="panel-header"><div><p className="eyebrow">MODELO PROPORCIONAL</p><h2>Seu corpo hoje</h2></div><span className="bmi-badge">IMC {bmi}</span></div><BodyFigure measurements={measurements} /><p className="figure-caption">Ombros, tronco, braços e pernas mudam conforme suas medidas.</p></section></div>;
}

function EnhancedProfile({ student, measurements, setMeasurements, onBack, onSaved, measurementHistory = [] }) {
  const history = measurementHistory.map((item) => ({ date: new Date(item.measuredAt).toLocaleDateString('pt-BR'), weight: item.weight, waist: item.waist })).filter((item) => item.weight || item.waist).slice(0, 4).reverse();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
    async function persistMeasurements() {
      setSaving(true);
      setMessage('');
      try {
        const result = await saveMeasurements(measurements, student.id);
        onSaved?.(result.measurement);
        setMessage('Medidas salvas com sucesso.');
      } catch (error) {
        setMessage(`Não foi possível salvar: ${error.message}`);
      } finally {
        setSaving(false);
      }
    }
  function exportHistory() { const csv = ["Data,Peso (kg),Cintura (cm)", ...history.map((item) => `${item.date},${item.weight},${item.waist}`)].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })); const link = document.createElement("a"); link.href = url; link.download = "historico-corporal-atlas.csv"; link.click(); URL.revokeObjectURL(url); }
  return <div className="student-view profile-view"><div className="student-view-header"><div><p className="eyebrow">MEU PERFIL</p><h1>Seus dados, seu progresso</h1><p className="heading-copy">Atualize suas medidas para acompanhar sua evolução.</p></div><button className="outline-button" onClick={onBack}>← Voltar para o treino</button></div><BodyProfileEditor measurements={measurements} setMeasurements={setMeasurements} /><div className="profile-save-row"><button className="primary-button" onClick={persistMeasurements} disabled={saving}>{saving ? 'Salvando...' : 'Salvar medidas'}</button>{message && <span className="profile-status">{message}</span>}</div><section className="panel history-panel"><div className="panel-header"><div><p className="eyebrow">HISTÓRICO CORPORAL</p><h2>Evolução das medidas</h2><p>Compare seus registros ao longo do tempo.</p></div><button className="outline-button" onClick={exportHistory} disabled={!history.length}>↓ Exportar CSV</button></div>{history.length ? <div className="history-charts"><div className="history-chart"><div className="history-chart-title"><strong>Peso</strong><span>{measurements.weight || '—'} kg atual</span></div><div className="history-line weight-line">{history.filter((item) => item.weight).map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.weight * 1.02)}px` }}><b>{item.weight}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div><div className="history-chart"><div className="history-chart-title"><strong>Cintura</strong><span>{measurements.waist || '—'} cm atual</span></div><div className="history-line waist-line">{history.filter((item) => item.waist).map((item, index) => <div className="history-point" key={item.date} style={{ left: `${index * 33.33}%`, bottom: `${Math.max(12, 100 - item.waist * 1.02)}px` }}><b>{item.waist}</b><i /></div>)}</div><div className="history-labels">{history.map((item) => <span key={item.date}>{item.date}</span>)}</div></div></div> : <p className="empty-state">Ainda não há registros de medidas.</p>}</section></div>;
}

function StudentProfile({ student, measurements, setMeasurements, onBack, onSaved, history: measurementHistory }) {
  return <EnhancedProfile student={student} measurements={measurements} setMeasurements={setMeasurements} onBack={onBack} onSaved={onSaved} measurementHistory={measurementHistory} />;
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
  const [workoutPlan, setWorkoutPlan] = useState(null);
  const [editingOwnPlan, setEditingOwnPlan] = useState(false);
  const [workout, setWorkout] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(0);
  const [notes, setNotes] = useState({});
  const [seriesTypes, setSeriesTypes] = useState({});
  const [chartPeriod, setChartPeriod] = useState("1 mês");
  const [studentPanel, setStudentPanel] = useState("workout");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [measurements, setMeasurements] = useState({});
  const [measurementHistory, setMeasurementHistory] = useState([]);
  const periodDays = { "1 semana": 7, "15 dias": 15, "1 mês": 30, "3 meses": 90, "6 meses": 180, "1 ano": 365 };
  const chartPeriods = Object.keys(periodDays);
  const exercises = workoutExercises.map((item) => ({
    ...item,
    name: item.exercise?.name || 'Exercício',
    detail: `${item.sets} séries · ${item.repetitions} reps`,
    load: item.load ?? '',
    rest: `${item.rest}s`,
  }));
  const activeExercise = exercises[selectedExercise];
  const completed = new Set(history.filter((record) => new Date(record.date).toDateString() === new Date().toDateString()).map((record) => record.exerciseId));
  const progress = exercises.length ? Math.round((exercises.filter((item) => completed.has(item.exerciseId)).length / exercises.length) * 100) : 0;
  const loadHistory = activeExercise ? history
    .filter((record) => record.exerciseId === activeExercise.exerciseId && new Date(record.date) >= new Date(Date.now() - periodDays[chartPeriod] * 86400000))
    .flatMap((record) => (record.sets || []).map((set) => Number(set.load)))
    .filter((load) => Number.isFinite(load) && load > 0) : [];
  const measurementDefaults = ['height', 'weight', 'shoulder', 'chest', 'waist', 'hip', 'armLeft', 'armRight', 'thighLeft', 'thighRight', 'legLeft', 'legRight'].reduce((result, key) => ({ ...result, [key]: 0 }), {});
  const safeMeasurements = { ...measurementDefaults, ...measurements };

  useEffect(() => {
    let active = true;
    async function loadStudentData() {
      setLoading(true);
      setError('');
      if (student.profileMissing) {
        setWorkoutPlan(null);
        setWorkout(null);
        setWorkoutExercises([]);
        setHistory([]);
        setLoading(false);
        return;
      }
      try {
        const getJson = async (url) => {
          const response = await fetch(url);
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'Falha ao carregar dados.');
          return body;
        };
        const plans = await getJson(`/api/workout-plans?studentId=${encodeURIComponent(student.id)}`);
        const selectedPlan = plans.plans.find((item) => item.active !== false);
        if (!active) return;
        setWorkoutPlan(selectedPlan || null);
        if (!selectedPlan) {
          setWorkout(null);
          setWorkoutExercises([]);
          setHistory([]);
          return;
        }
        const workouts = await getJson(`/api/workouts?workoutPlanId=${encodeURIComponent(selectedPlan.id)}`);
        const selectedWorkout = workouts.workouts[0] || null;
        if (!active) return;
        setWorkout(selectedWorkout);
        if (!selectedWorkout) {
          setWorkoutExercises([]);
          setHistory([]);
          return;
        }
        const [exerciseData, historyData, measurementData] = await Promise.all([
          getJson(`/api/workout-exercises?workoutId=${encodeURIComponent(selectedWorkout.id)}`),
          getJson(`/api/workout-history?studentId=${encodeURIComponent(student.id)}&workoutId=${encodeURIComponent(selectedWorkout.id)}`),
          getJson(`/api/body-measurements?studentId=${encodeURIComponent(student.id)}`),
        ]);
        if (!active) return;
        setWorkoutExercises(exerciseData.exercises);
        setHistory(historyData.history);
        setMeasurementHistory(measurementData.measurements);
        setMeasurements(measurementData.measurements[0] || {});
        setSelectedExercise(0);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadStudentData();
    return () => { active = false; };
  }, [student.id, student.profileMissing]);
  const profileDevEnabled = true;
  if (loading) return <div className="page-content"><p className="heading-copy">Carregando sua ficha...</p></div>;
  if (error) return <div className="page-content"><p className="login-error">{error}</p></div>;
  if (student.profileMissing) return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">ÁREA DO ALUNO</p><h1>Olá, {student.name.split(" ")[0]}!</h1><p className="heading-copy">Esta conta não tem um perfil de aluno cadastrado. Nenhuma ficha de outra pessoa será exibida aqui.</p></div>{onBack && <button className="outline-button" onClick={onBack}>← Visão do administrador</button>}</div></div>;
  if (editingOwnPlan) return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">ÁREA DO ALUNO</p><h1>Minha ficha de treino</h1><p className="heading-copy">Monte e salve sua ficha com sua senha.</p></div><button className="outline-button" onClick={() => setEditingOwnPlan(false)}>← Voltar</button></div><WorkoutPlanManager students={[student]} canEdit onNewStudent={() => {}} onGoToExercises={() => {}} studentMode /></div>;
  if (!workoutPlan || !workout || exercises.length === 0) return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">ÁREA DO ALUNO</p><h1>Olá, {student.name.split(" ")[0]}!</h1><p className="heading-copy">{student.trainerId ? 'Seu personal responsável gerencia sua ficha.' : 'Sua ficha ainda não foi cadastrada.'}</p></div>{!student.trainerId && <button className="primary-button" onClick={() => setEditingOwnPlan(true)}>Montar minha ficha</button>}{onBack && <button className="outline-button" onClick={onBack}>← Visão do administrador</button>}</div></div>;
  if (studentPanel === "profile") return <StudentProfile student={student} measurements={safeMeasurements} setMeasurements={setMeasurements} history={measurementHistory} onSaved={(record) => { setMeasurementHistory((current) => [record, ...current]); setMeasurements(record); }} onBack={() => setStudentPanel("workout")} />;

  async function toggleCompleted(index) {
    const item = exercises[index];
    if (!item || completed.has(item.exerciseId) || !workout) return;
    const load = Number(String(notes[item.id] ?? item.load ?? 0).replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || 0);
    const repetitions = Number(item.repetitions.match(/[0-9]+/)?.[0] || 0);
    const response = await fetch('/api/workout-history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: student.id, workoutId: workout.id, exerciseId: item.exerciseId,
        sets: Array.from({ length: item.sets }, () => ({ repetitions, load })),
        observations: seriesTypes[item.id] || '',
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || 'Não foi possível registrar o treino.');
      return;
    }
    setHistory((current) => [body.record, ...current]);
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
        {!student.trainerId && <button className="outline-button" onClick={() => setEditingOwnPlan(true)}>Editar minha ficha</button>}
        <button className="outline-button profile-button" disabled={!profileDevEnabled} onClick={() => setStudentPanel("profile")}>
          <UserRound size={15} /> {profileDevEnabled ? "Meu perfil" : "Perfil em desenvolvimento"}
        </button>{onBack && <button className="outline-button" onClick={onBack}>
          ← Visão do administrador
        </button>}
      </div>
      <div className="student-hero">
        <div>
          <span className="student-pill">{workout.name}</span>
          <h2>{workoutPlan.name}</h2>
          <p>{workoutPlan.objective || student.goal} · {exercises.length} exercícios</p>
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
              {exercises.filter((item) => completed.has(item.exerciseId)).length}/{exercises.length}
            </strong>
          </div>
          <div className="student-exercise-list">
            {exercises.map((exercise, index) => (
              <div
                className={
                  selectedExercise === index
                    ? "student-exercise selected"
                    : completed.has(exercise.exerciseId)
                      ? "student-exercise completed"
                      : "student-exercise"
                }
                key={exercise.id}
                onClick={() => setSelectedExercise(index)}
              >
                <button
                  className="check-circle"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCompleted(index);
                  }}
                  aria-label={
                    completed.has(exercise.exerciseId)
                      ? `Desmarcar ${exercise.name}`
                      : `Concluir ${exercise.name}`
                  }
                >
                    {completed.has(exercise.exerciseId) ? "✓" : index + 1}
                </button>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.detail}</small>
                </span>
                <b>{exercise.load}</b>
                <i>{completed.has(exercise.exerciseId) ? "Concluído" : exercise.rest}</i>
                <button
                  className="complete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCompleted(index);
                  }}
                >
                  {completed.has(exercise.exerciseId) ? "Concluído" : "Concluir"}
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
                  value={notes[activeExercise.id] ?? activeExercise.load}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [activeExercise.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Tipo de série
                <select
                    value={seriesTypes[activeExercise.id] || "Normal"}
                  onChange={(event) =>
                    setSeriesTypes((current) => ({
                      ...current,
                      [activeExercise.id]: event.target.value,
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
                {completed.has(activeExercise.exerciseId)
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
                {loadHistory.length} séries registradas
              </span>
            </div>
            <div className="chart-range">
              {chartPeriods.map((period) => (
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
                      style={{ height: `${Math.max(6, Math.min(100, (load / Math.max(...loadHistory)) * 100))}px` }}
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
              <strong>{loadHistory.at(-1) ?? notes[activeExercise.id] ?? activeExercise.load}</strong>
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
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(emptyStudent);
  const [workoutPlans, setWorkoutPlans] = useState([]);
  const [adminList, setAdminList] = useState([]);
  const [exerciseList, setExerciseList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [academySettings, setAcademySettings] = useState({ academyName: 'Atlas Training', unitName: 'Unidade Centro' });
  const [notifications, setNotifications] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    if (!mobileNav) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNav]);
  const [mode, setMode] = useState("admin");
  useEffect(() => {
    if (mode !== 'admin' || students.some((student) => student.id === selectedStudent?.id)) return;
    setSelectedStudent(students[0] || emptyStudent);
  }, [students, selectedStudent, mode]);
  const isStaff = ['dev', 'admin', 'trainer', 'SUPER_ADMIN'].includes(currentUser?.role) || (currentUser?.roles || []).some((role) => ['dev', 'admin', 'trainer', 'SUPER_ADMIN'].includes(role));
  const [toast, setToast] = useState("");
  const [adminView, setAdminView] = useState("admins");
  const [createType, setCreateType] = useState(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const selectedWorkout = workoutPlans.find((plan) => plan.studentId === selectedStudent?.id);
  const ownStudent = students.find((student) => student.id === currentUser?.id);
  const ownStudentView = ownStudent || (currentUser ? { ...emptyStudent, id: currentUser.id, name: currentUser.name, profileMissing: true } : emptyStudent);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        const { loadAtlasData } = await import("../lib/atlas-data");
        const data = await loadAtlasData();
        if (!active) return;
        setCurrentUser(data.currentUser);
        setAcademySettings(data.settings || { academyName: 'Atlas Training', unitName: 'Unidade Centro' });
        setNotifications(data.notifications || []);
        setMode(data.currentUser.role === 'student' ? 'student' : 'admin');
        setStudents(data.students);
        setWorkoutPlans(data.workouts);
        setAdminList(data.admins);
        setExerciseList(data.exercises);
        setSelectedStudent(data.students[0] || emptyStudent);
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
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), username: form.get('username'), password: form.get('password'), confirmPassword: form.get('password'), goal: form.get('goal'), phone: form.get('phone'), dateOfBirth: form.get('dateOfBirth'), trainerId: form.get('trainerId') === 'avulso' ? null : form.get('trainerId') || (currentUser?.role === 'trainer' ? currentUser.id : null), role: 'student', active: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível cadastrar o aluno.');
      const student = { id: body.user.id, name: body.user.name, trainerId: form.get('trainerId') === 'avulso' ? null : form.get('trainerId') || (currentUser?.role === 'trainer' ? currentUser.id : null), initials: body.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(), goal: form.get('goal'), status: 'Em dia', color: 'coral', updated: 'Agora' };
      setStudents((current) => [student, ...current]); setSelectedStudent(student); setShowModal(false); showAction('Aluno cadastrado com sucesso.');
    } catch (error) { showAction(error.message); }
  }

  function showAction(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function createModuleItem(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      let response;
      if (createType === 'admin') {
        response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), username: form.get('username'), password: form.get('password'), confirmPassword: form.get('confirmPassword'), cref: form.get('cref'), role: form.get('role'), active: true }) });
      } else if (createType === 'exercise') {
        response = await fetch('/api/exercises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), muscleGroup: form.get('muscleGroup'), equipment: form.get('equipment') }) });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o cadastro.');
      if (createType === 'admin') setAdminList((current) => [{ name: body.user.name, username: body.user.username, role: body.user.role, initials: body.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() }, ...current]);
      if (createType === 'exercise') setExerciseList((current) => [...current, body.exercise.name]);
      setCreateType(null);
      showAction('Cadastro salvo com sucesso.');
    } catch (error) {
      showAction(error.message);
    }
  }

  return (
    <main className="app-shell">
      {mobileNav && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}
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
            <strong>{academySettings.academyName}</strong>
            <small>{academySettings.unitName}</small>
          </span>
          <ChevronDown size={15} />
        </div>
        {isStaff && <nav className="main-nav" id="main-navigation">
          {navItems.filter(({ key }) => (key !== 'admins' || ['admin', 'dev', 'SUPER_ADMIN'].includes(currentUser?.role)) && (key !== 'documentation' || (currentUser?.roles || [currentUser?.role]).some((role) => ['admin', 'SUPER_ADMIN'].includes(role))) && (key !== 'finance' || isSuperAdminAccount(currentUser) || currentUser?.financialAccessExempt === true)).map(({ label, icon: Icon, key }) => (
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
        </nav>}
        {isStaff && <nav className="main-nav view-mode-nav" aria-label="Alternar visão do sistema">
          <button className={mode === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => { setMode('admin'); setMobileNav(false); }}><LayoutDashboard size={18} /><span>Visão prof/adm</span>{mode === 'admin' && <span className="nav-indicator" />}</button>
          <button className={mode === 'student' ? 'nav-item active' : 'nav-item'} onClick={() => { setMode('student'); setMobileNav(false); }}><UserRound size={18} /><span>Visão do aluno</span>{mode === 'student' && <span className="nav-indicator" />}</button>
        </nav>}
        <div className="sidebar-bottom">
          {['admin','dev','SUPER_ADMIN'].includes(currentUser?.role) && <button
            className="nav-item"
            onClick={() => { setAdminView('settings'); setMode('admin'); setMobileNav(false); }}
          >
            <Settings size={18} />
            <span>Configurações</span>
          </button>}
          {isStaff && <div className="user-card role-switcher">
            <span className="user-avatar">{currentUser?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span>
                <strong>{currentUser?.name}</strong>
              <small>{mode === 'admin' ? 'Visão prof/adm' : 'Visão do aluno'}</small>
            </span>
          </div>}
          <button
            className="logout"
            onClick={async () => {
              const response = await fetch('/api/auth/logout', { method: 'POST' });
              if (!response.ok) showAction('Não foi possível sair da conta.');
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
            aria-label={mobileNav ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileNav}
            aria-controls="main-navigation"
          >
            {mobileNav ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className="breadcrumbs">
            <span>{mode === "admin" ? "Alunos" : "Área do aluno"}</span>
            <ChevronRight size={15} />
            <strong>{mode === 'student' ? ownStudentView.name : selectedStudent.name}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button notification"
              onClick={() => showAction(notifications.length ? notifications.slice(0, 3).map((item) => `${item.title}: ${item.message}`).join(' | ') : 'Você não tem novas notificações')}
              aria-label="Notificações"
            >
              <Bell size={19} />
              {notifications.some((item) => !item.readAt) && <i />}
            </button>
            <span className="topbar-divider" />
            <span className="topbar-date">
              <Clock3 size={15} /> Sexta, 14 de junho
            </span>
          </div>
        </header>
        {currentUser?.financialAccess?.level && currentUser.financialAccess.level !== 'ACTIVE' && <div className={`financial-access-banner ${currentUser.financialAccess.level === 'WARNING' ? 'is-warning' : ''}`} role="status"><span>{currentUser.financialAccess.restricted ? 'Seu acesso está restrito por pendência financeira.' : 'Há uma cobrança próxima do vencimento na sua conta.'}</span><a href="/billing">Ver cobrança</a></div>}
        {mode === "student" ? (
          <StudentView
            student={ownStudentView}
            onBack={isStaff ? () => setMode("admin") : undefined}
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
            canManageUsers={['admin', 'dev', 'SUPER_ADMIN'].includes(currentUser?.role)}
            isHydrating={isHydrating}
            currentUser={currentUser}
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
                  <small>cadastrados</small>
                </em>
              </div>
              <div className="stat-card">
                <span className="stat-icon green-bg">
                  <ClipboardList size={18} />
                </span>
                <span>
                  <small>Fichas ativas</small>
                    <strong>{workoutPlans.filter((plan) => plan.active !== false).length}</strong>
                </span>
                <em>
                  <small>no sistema</small>
                </em>
              </div>
              <div className="stat-card">
                <span className="stat-icon yellow-bg">
                  <Clock3 size={18} />
                </span>
                <span>
                  <small>Para revisar</small>
                    <strong>—</strong>
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
                    onClick={() => {
                      setQuery("");
                      setFilter("Todos");
                      if (students.length) setSelectedStudent(students[0]);
                    }}
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
                      type="button"
                      aria-label={`Ver ficha de ${student.name}`}
                      title={`Ver ficha de ${student.name}`}
                      className={
                        selectedStudent.id === student.id
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
                    onClick={() => setAdminView('workouts')}
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
                    <strong>Frequência</strong>{selectedWorkout?.frequency || 'Não informada'}
                  </span>
                  <span>
                    <strong>Atualizada em</strong>
                    {selectedStudent.updated}
                  </span>
                </div>
                <div className="exercise-heading">
                  <h3>
                    Exercícios <span>{(selectedWorkout?.exerciseList || []).length}</span>
                  </h3>
                  <button
                    className="icon-button"
                    onClick={() => setAdminView('workouts')}
                    aria-label="Adicionar exercício"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="exercise-list">
                  {(selectedWorkout?.exerciseList || []).map((exercise, index) => (
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
                Nome de usuário
                <input name="username" required minLength="3" maxLength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]" title="Use de 3 a 30 letras, números, hífens ou sublinhados, sem espaços." autoComplete="username" placeholder="ana_souza" />
              </label>
              <label>Telefone<input name="phone" type="tel" autoComplete="tel" /></label>
              <label>Data de nascimento<input name="dateOfBirth" type="date" /></label>
              {['admin', 'dev', 'SUPER_ADMIN'].includes(currentUser?.role) && <label>Personal responsável<select name="trainerId" required defaultValue=""><option value="" disabled>Selecione um personal ou aluno avulso</option><option value="avulso">Aluno avulso (sem personal)</option>{adminList.filter((item) => item.active !== false && (item.role === 'trainer' || (item.roles || []).includes('trainer'))).map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.id === currentUser?.id ? ' (eu mesmo)' : ''}</option>)}</select></label>}
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
      {createType && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCreateType(null)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setCreateType(null)} aria-label="Fechar"><X size={18} /></button>
            <span className="modal-kicker"><Plus size={16} /></span>
            <h2>{createType === "admin" ? "Novo administrador" : "Novo exercício"}</h2>
            <p>Preencha os dados para adicionar este cadastro ao sistema.</p>
            <form onSubmit={createModuleItem}>
              {createType === "admin" && <><label>Nome completo<input name="name" required placeholder="Nome do profissional" /></label><label>Nome de usuário<input name="username" required minLength="3" maxLength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]" autoComplete="username" placeholder="nome_usuario" /></label><label>Função<select name="role" defaultValue="trainer"><option value="trainer">Professor</option><option value="admin">Administrador</option><option value="dev">Desenvolvedor</option></select></label><label>CREF (professores)<input name="cref" /></label><label>Senha inicial<input name="password" type="password" minLength="8" required autoComplete="new-password" /></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength="8" required autoComplete="new-password" /></label></>}
              {createType === "exercise" && <><label>Nome do exercício<input name="name" required placeholder="Nome do exercício" /></label><label>Grupo muscular<select name="muscleGroup" required defaultValue=""><option value="" disabled>Selecione o grupo</option><option>Peito</option><option>Costas</option><option>Pernas</option><option>Ombros</option><option>Braços</option><option>Abdômen</option></select></label><label>Equipamento<input name="equipment" placeholder="Equipamento" /></label></>}
              <button className="primary-button" type="submit">Salvar cadastro</button>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
