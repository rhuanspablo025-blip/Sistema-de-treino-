const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeWorkoutPlan, WorkoutPlanValidationError } = require('../lib/workout-plan-validation.cjs');

const studentId = '00000000-0000-0000-0000-000000000001';
const exerciseId = '00000000-0000-0000-0000-000000000002';

test('normalizes a weekly plan and exercise prescription', () => {
  const plan = normalizeWorkoutPlan({
    name: 'Força A/B', studentId, objective: 'Força', level: 'Intermediário',
    startDate: '2026-10-01', reviewDate: '2026-11-01',
    days: [{
      dayOfWeek: 'monday', name: 'Peito e tríceps', exercises: [{
        exerciseId, sets: 4, repetitions: '8-10', load: '30', rest: 90, timeSeconds: 40,
        method: 'Pausa no alongamento', observations: 'Manter técnica controlada',
      }],
    }, { dayOfWeek: 'wednesday', name: 'Descanso', isRestDay: true }],
  });

  assert.equal(plan.studentId, studentId);
  assert.equal(plan.frequency, '1x por semana');
  assert.equal(plan.days[0].exercises[0].load, 30);
  assert.equal(plan.days[0].exercises[0].order, 1);
  assert.equal(plan.days[1].isRestDay, true);
});

test('rejects invalid dates, duplicate weekdays, invalid exercise values, and object IDs', () => {
  const base = { name: 'Ficha', studentId, objective: 'Hipertrofia', level: 'Iniciante' };
  assert.throws(() => normalizeWorkoutPlan({ ...base, studentId: { $ne: null } }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, id: { $ne: null } }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, startDate: '2026-02-31' }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, startDate: '2026-11-01', reviewDate: '2026-10-01' }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, days: [
    { dayOfWeek: 'monday', name: 'A' }, { dayOfWeek: 'monday', name: 'B' },
  ] }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, days: [{ dayOfWeek: 'monday', name: 'Treino vazio' }] }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, days: [{ dayOfWeek: 'monday', name: 'A', exercises: [{ exerciseId, sets: 0 }] }] }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, days: [{ dayOfWeek: 'monday', name: 'A', isRestDay: true, exercises: [{ exerciseId }] }] }), WorkoutPlanValidationError);
  assert.throws(() => normalizeWorkoutPlan({ ...base, days: [{ dayOfWeek: 'monday', name: 'A', isRestDay: 'true' }] }), WorkoutPlanValidationError);
});