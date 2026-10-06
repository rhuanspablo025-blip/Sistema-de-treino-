async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function loadAtlasData() {
  try {
    const data = await requestJson('/api/dashboard');
    if (data.currentUser?.financialAccess?.blocked) window.location.href = '/billing';
    return data;
  } catch (error) {
    if (error.message === 'Não autenticado.') window.location.href = '/login';
    if (error.status === 423) window.location.href = '/billing';
    throw error;
  }
}

export async function saveWorkout(workout, studentId) {
  const id = typeof workout.id === 'string' && /^[0-9a-f-]{36}$/i.test(workout.id) ? workout.id : undefined;
  const result = await requestJson('/api/workout-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(id && { id }), studentId, title: workout.title,
      goal: workout.goal, frequency: workout.frequency,
      exercises: workout.exerciseList || [],
    }),
  });
  const plan = result.plan;
  const exerciseList = (result.days || []).flatMap((day) => (day.exercises || []).map((item) => ({
    id: item.id,
    exerciseId: item.exerciseId,
    name: item.exercise?.name || 'Exercício',
    detail: `${item.sets} séries · ${item.repetitions} reps`,
    load: item.load ?? '',
    rest: `${item.rest}s`,
    workoutId: day.id,
    observations: item.observations,
  })));
  return {
    ...result,
    workout: {
      id: plan.id,
      title: plan.name,
      studentId: plan.studentId,
      goal: plan.objective,
      frequency: plan.frequency,
      exerciseList,
    },
  };
}

export async function saveMeasurements(measurements, studentId) {
  return requestJson('/api/body-measurements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...measurements, studentId }),
  });
}
