const USER_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const OBJECTIVES = ['Hipertrofia', 'Emagrecimento', 'Força', 'Resistência', 'Condicionamento', 'Reabilitação', 'Personalizado'];
const LEVELS = ['Iniciante', 'Intermediário', 'Avançado'];

class WorkoutPlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkoutPlanValidationError';
  }
}

function requiredText(value, label, maximumLength) {
  if (typeof value !== 'string') throw new WorkoutPlanValidationError(`${label} inválido.`);
  const result = value.trim();
  if (!result || result.length > maximumLength) throw new WorkoutPlanValidationError(`${label} inválido.`);
  return result;
}

function optionalText(value, maximumLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > maximumLength) throw new WorkoutPlanValidationError('Texto inválido.');
  return value.trim();
}

function validDate(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WorkoutPlanValidationError('Data inválida.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new WorkoutPlanValidationError('Data inválida.');
  return value;
}

function boundedNumber(value, label, minimum, maximum, integer = false, nullable = false) {
  if (nullable && (value === undefined || value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    throw new WorkoutPlanValidationError(`${label} inválido.`);
  }
  return number;
}

function normalizeWorkoutPlan(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkoutPlanValidationError('Dados da ficha inválidos.');

  const name = requiredText(payload.name ?? payload.title, 'Nome da ficha', 120);
  const studentId = requiredText(payload.studentId ?? payload.student_id, 'Aluno', 64);
  if (!USER_ID_PATTERN.test(studentId)) throw new WorkoutPlanValidationError('Aluno inválido.');
  const objective = requiredText(payload.objective ?? payload.goal ?? 'Personalizado', 'Objetivo', 60);
  if (!OBJECTIVES.includes(objective)) throw new WorkoutPlanValidationError('Objetivo inválido.');
  const level = requiredText(payload.level ?? 'Intermediário', 'Nível', 32);
  if (!LEVELS.includes(level)) throw new WorkoutPlanValidationError('Nível inválido.');
  const startDate = validDate(payload.startDate ?? payload.start_date);
  const reviewDate = validDate(payload.reviewDate ?? payload.endDate ?? payload.end_date);
  if (startDate && reviewDate && reviewDate < startDate) throw new WorkoutPlanValidationError('A revisão não pode anteceder o início da ficha.');

  const rawDays = payload.days ?? [];
  if (!Array.isArray(rawDays) || rawDays.length > 7) throw new WorkoutPlanValidationError('A ficha pode ter até sete dias.');
  const seenDays = new Set();
  const days = rawDays.map((rawDay) => {
    if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) throw new WorkoutPlanValidationError('Dia de treino inválido.');
    const dayOfWeek = requiredText(rawDay.dayOfWeek ?? rawDay.day, 'Dia da semana', 20).toLowerCase();
    if (!DAY_KEYS.includes(dayOfWeek) || seenDays.has(dayOfWeek)) throw new WorkoutPlanValidationError('Dia da semana inválido ou repetido.');
    seenDays.add(dayOfWeek);

    if (rawDay.isRestDay !== undefined && typeof rawDay.isRestDay !== 'boolean') throw new WorkoutPlanValidationError('Tipo de dia inválido.');
    const isRestDay = rawDay.isRestDay === true;
    const name = isRestDay ? (optionalText(rawDay.name, 80) || 'Descanso') : requiredText(rawDay.name ?? rawDay.title, 'Nome do treino', 80);
    const rawExercises = rawDay.exercises ?? [];
    if (!Array.isArray(rawExercises) || rawExercises.length > 50 || (isRestDay && rawExercises.length)) throw new WorkoutPlanValidationError('Exercícios do dia inválidos.');
    const exercises = rawExercises.map((rawExercise, index) => {
      if (!rawExercise || typeof rawExercise !== 'object' || Array.isArray(rawExercise)) throw new WorkoutPlanValidationError('Exercício inválido.');
      const exerciseId = requiredText(rawExercise.exerciseId ?? rawExercise.exercise_id, 'Exercício', 64);
      if (!USER_ID_PATTERN.test(exerciseId)) throw new WorkoutPlanValidationError('Exercício inválido.');
      const id = rawExercise.id === undefined ? null : requiredText(rawExercise.id, 'ID do exercício', 64);
      if (id && !USER_ID_PATTERN.test(id)) throw new WorkoutPlanValidationError('ID do exercício inválido.');
      return {
        id,
        exerciseId,
        order: index + 1,
        sets: boundedNumber(rawExercise.sets ?? 3, 'Séries', 1, 20, true),
        repetitions: requiredText(rawExercise.repetitions ?? rawExercise.reps ?? '10', 'Repetições', 40),
        load: boundedNumber(rawExercise.load, 'Carga', 0, 10000, false, true),
        rest: boundedNumber(rawExercise.rest ?? rawExercise.restSeconds ?? 60, 'Intervalo', 0, 3600, true),
        timeSeconds: boundedNumber(rawExercise.timeSeconds ?? rawExercise.time, 'Tempo', 0, 14400, true, true),
        method: optionalText(rawExercise.method ?? rawExercise.technique, 100),
        observations: optionalText(rawExercise.observations, 1000),
      };
    });
    const id = rawDay.id === undefined ? null : requiredText(rawDay.id, 'ID do treino', 64);
    if (id && !USER_ID_PATTERN.test(id)) throw new WorkoutPlanValidationError('ID do treino inválido.');
    return {
      id,
      name,
      dayOfWeek,
      order: DAY_KEYS.indexOf(dayOfWeek) + 1,
      isRestDay,
      description: optionalText(rawDay.description, 1000),
      observations: optionalText(rawDay.observations, 2000),
      exercises,
    };
  });
  if (!days.some((day) => !day.isRestDay && day.exercises.length > 0)) throw new WorkoutPlanValidationError('Inclua ao menos um exercício em um dia de treino.');

  const id = payload.id === undefined ? null : requiredText(payload.id, 'ID da ficha', 64);
  if (id && !USER_ID_PATTERN.test(id)) throw new WorkoutPlanValidationError('ID da ficha inválido.');

  return {
    id,
    studentId,
    name,
    objective,
    objectiveDetails: optionalText(payload.objectiveDetails, 240),
    level,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    endDate: reviewDate,
    observations: optionalText(payload.observations, 2000),
    frequency: `${days.filter((day) => !day.isRestDay).length}x por semana`,
    days,
  };
}

module.exports = { DAY_KEYS, LEVELS, OBJECTIVES, WorkoutPlanValidationError, normalizeWorkoutPlan, validDate };