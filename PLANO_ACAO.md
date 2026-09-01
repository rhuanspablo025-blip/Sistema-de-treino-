# 🎯 PLANO DE AÇÃO - SISTEMA DE FICHAS DE TREINO

## RELATÓRIO DE AUDITORIA

### ✅ Funcionalidades Operacionais
- **Autenticação**: Login com Supabase (JWT, cookies seguros)
- **Autorização**: Middleware global + RLS
- **CRUD Usuários**: Create, Read, Update, Delete (Staff)
- **Body Profile**: Visualização SVG + localStorage
- **Banco**: Schema com relacionamentos corretos

### ❌ Funcionalidades Faltando
- **Exercícios**: Nenhuma API, dados hardcoded
- **Fichas de Treino**: Tabela vazia, sem CRUD
- **Treinos**: Não implementado
- **Body Measurements**: Sem endpoints (só localStorage)
- **Permissões**: Sem controle por módulo
- **Visão do Aluno**: Sem página dedicada

---

## 📋 FASES DE IMPLEMENTAÇÃO

### **FASE 1: EXERCÍCIOS (PRIORIDADE 1)**
Status: ❌ Não iniciado

#### Tasks:
```
[ ] 1.1 - Criar API GET /api/exercises (listar todos)
[ ] 1.2 - Criar API POST /api/exercises (criar novo)
[ ] 1.3 - Criar API GET /api/exercises/[id] (buscar um)
[ ] 1.4 - Criar API PATCH /api/exercises/[id] (editar)
[ ] 1.5 - Criar API PATCH /api/exercises/[id]/deactivate (desativar)
[ ] 1.6 - Criar tabela "exercises" no Supabase
[ ] 1.7 - Atualizar frontend: Listagem de exercícios
[ ] 1.8 - Implementar modal: Criar exercício
[ ] 1.9 - Implementar modal: Editar exercício
[ ] 1.10 - Implementar ação: Desativar/Excluir
[ ] 1.11 - Adicionar: Pesquisa + Filtros
[ ] 1.12 - Testar CRUD de ponta a ponta
```

**Campos do Exercício:**
```
id, nome, grupo_muscular, equipamento, categoria, 
descricao, instrucoes, video_url, imagem_url, 
dificuldade, observacoes, ativo, criado_em, atualizado_em
```

---

### **FASE 2: FICHAS DE TREINO (PRIORIDADE 1)**
Status: ❌ Não iniciado

#### Tasks:
```
[ ] 2.1 - Criar API GET /api/workout-plans (listar)
[ ] 2.2 - Criar API POST /api/workout-plans (criar)
[ ] 2.3 - Criar API GET /api/workout-plans/[id] (buscar uma)
[ ] 2.4 - Criar API PATCH /api/workout-plans/[id] (editar)
[ ] 2.5 - Criar API DELETE /api/workout-plans/[id] (deletar)
[ ] 2.6 - Criar API POST /api/workout-plans/[id]/duplicate (duplicar)
[ ] 2.7 - Atualizar tabela "workout_plans"
[ ] 2.8 - Criar frontend: Listagem de fichas
[ ] 2.9 - Criar frontend: Editar ficha
[ ] 2.10 - Criar frontend: Criar ficha
[ ] 2.11 - Implementar: Duplicar ficha
[ ] 2.12 - Implementar: Histórico de fichas
[ ] 2.13 - Testar CRUD de ponta a ponta
```

**Campos da Ficha:**
```
id, student_id, professor_id, nome, objetivo, status 
(ativa/inativa/revisao/finalizada), observacoes, 
data_inicio, data_termino_prevista, criado_em, atualizado_em
```

---

### **FASE 3: TREINOS DENTRO DA FICHA (PRIORIDADE 2)**
Status: ❌ Não iniciado

#### Tasks:
```
[ ] 3.1 - Criar API GET /api/workouts (listar)
[ ] 3.2 - Criar API POST /api/workouts (criar dentro de ficha)
[ ] 3.3 - Criar API PATCH /api/workouts/[id] (editar)
[ ] 3.4 - Criar API DELETE /api/workouts/[id] (deletar)
[ ] 3.5 - Criar API PATCH /api/workouts/[id]/reorder (reordenar)
[ ] 3.6 - Criar tabela "workouts"
[ ] 3.7 - Frontend: Adicionar treinos à ficha
[ ] 3.8 - Frontend: Editar treino
[ ] 3.9 - Frontend: Reordenar treinos
[ ] 3.10 - Testar de ponta a ponta
```

**Campos do Treino:**
```
id, workout_plan_id, nome, dia_semana, ordem, 
observacoes, criado_em, atualizado_em
```

---

### **FASE 4: EXERCÍCIOS DENTRO DO TREINO (PRIORIDADE 2)**
Status: ❌ Não iniciado

#### Tasks:
```
[ ] 4.1 - Criar API GET /api/workout-exercises (listar)
[ ] 4.2 - Criar API POST /api/workout-exercises (adicionar)
[ ] 4.3 - Criar API PATCH /api/workout-exercises/[id] (editar séries/reps/carga)
[ ] 4.4 - Criar API DELETE /api/workout-exercises/[id] (remover)
[ ] 4.5 - Criar tabela "workout_exercises"
[ ] 4.6 - Frontend: Adicionar exercícios ao treino
[ ] 4.7 - Frontend: Editar séries/repetições/carga
[ ] 4.8 - Frontend: Remover exercício
[ ] 4.9 - Testar de ponta a ponta
```

**Campos do Exercício no Treino:**
```
id, workout_id, exercise_id, ordem, series, repeticoes, 
carga, unidade_carga, descanso_segundos, tempo_execucao, 
metodo, observacoes, video_url, criado_em, atualizado_em
```

---

### **FASE 5: BODY MEASUREMENTS API (PRIORIDADE 2)**
Status: ⚠️ Parcial (só localStorage)

#### Tasks:
```
[ ] 5.1 - Criar API GET /api/body-measurements (listar próprias medidas)
[ ] 5.2 - Criar API POST /api/body-measurements (salvar medida)
[ ] 5.3 - Atualizar frontend: Integrar com API
[ ] 5.4 - Implementar: Histórico de medidas
[ ] 5.5 - Testar persistência
```

---

### **FASE 6: PERMISSÕES POR MÓDULO (PRIORIDADE 3)**
Status: ❌ Não implementado

#### Tasks:
```
[ ] 6.1 - Criar middleware por rota
[ ] 6.2 - Aluno: Bloquear acesso a Administradores
[ ] 6.3 - Aluno: Bloquear acesso a Exercícios (admin)
[ ] 6.4 - Aluno: Permitir apenas Meu Perfil + Minha Ficha
[ ] 6.5 - Professor: Permitir CRUD de Fichas + Exercícios
[ ] 6.6 - Professor: Bloquear Administradores
[ ] 6.7 - Admin: Acesso total
[ ] 6.8 - Testar por cada role
```

---

### **FASE 7: VISÃO DO ALUNO (PRIORIDADE 3)**
Status: ❌ Não implementado

#### Tasks:
```
[ ] 7.1 - Criar página /aluno/dashboard
[ ] 7.2 - Mostrar: Olá, [Nome]!
[ ] 7.3 - Mostrar: Meu Perfil (dados pessoais)
[ ] 7.4 - Mostrar: Minha Ficha (nome, objetivo, professor)
[ ] 7.5 - Mostrar: Treinos da ficha
[ ] 7.6 - Mostrar: Exercícios de cada treino
[ ] 7.7 - Adicionar: Marca exercício como completo
[ ] 7.8 - Adicionar: Campo de notas
[ ] 7.9 - Responsividade mobile
[ ] 7.10 - Testar acesso (aluno não vê admin)
```

---

### **FASE 8: VISÃO DO PROFESSOR (PRIORIDADE 3)**
Status: ❌ Não implementado

#### Tasks:
```
[ ] 8.1 - Criar página /professor/dashboard
[ ] 8.2 - Mostrar: Lista de alunos
[ ] 8.3 - Ao clicar aluno: Abrir perfil completo
[ ] 8.4 - Mostrar: Fichas do aluno
[ ] 8.5 - Ação: Criar nova ficha
[ ] 8.6 - Ação: Editar ficha existente
[ ] 8.7 - Ação: Duplicar ficha
[ ] 8.8 - Ação: Adicionar treinos
[ ] 8.9 - Ação: Adicionar exercícios
[ ] 8.10 - Ação: Editar séries/reps/carga
[ ] 8.11 - Testar acesso (professor não vê admin)
```

---

### **FASE 9: VISÃO DO ADMINISTRADOR (PRIORIDADE 3)**
Status: ✅ Parcial (já existe)

#### Tasks:
```
[ ] 9.1 - Consolidar todas as funcionalidades
[ ] 9.2 - Mostrar: Dashboard com KPIs
[ ] 9.3 - Mostrar: Alunos + Status financeiro
[ ] 9.4 - Mostrar: Professores
[ ] 9.5 - Mostrar: Exercícios
[ ] 9.6 - Mostrar: Fichas
[ ] 9.7 - Ação: Gerenciar tudo
[ ] 9.8 - Relatórios (opcional)
```

---

## 🎯 PLANO DE EXECUÇÃO

### Semana 1:
- ✅ Auditoria (FEITO)
- **Fase 1**: Exercícios CRUD
- **Fase 5**: Body Measurements API

### Semana 2:
- **Fase 2**: Fichas de Treino CRUD
- **Fase 3**: Treinos dentro de Fichas

### Semana 3:
- **Fase 4**: Exercícios dentro do Treino
- **Fase 6**: Permissões por módulo

### Semana 4:
- **Fase 7**: Visão do Aluno
- **Fase 8**: Visão do Professor

### Semana 5:
- **Fase 9**: Consolidação Admin
- **Testes** gerais

---

## ✅ CHECKLIST FINAL

Antes de considerar completo:

```
[ ] Todos os CRUDs funcionam de ponta a ponta
[ ] Sem dados hardcoded (exceto demo inicial)
[ ] Sem botões decorativos
[ ] Validações em cliente e servidor
[ ] Feedback visual (sucesso/erro)
[ ] Permissões testadas por role
[ ] Segurança: RLS ativo no Supabase
[ ] Sem console errors
[ ] Sem erros de backend (logs limpos)
[ ] Responsividade mobile
[ ] Performance aceitável
[ ] Documentação atualizada
```

---

## 📞 STATUS ATUAL
**Data:** 2026-09-01  
**Progresso:** 15% (Auth + User CRUD)  
**Próxima Etapa:** Implementar Exercícios API
