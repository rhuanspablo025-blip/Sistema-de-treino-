async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

export async function loadAtlasData() {
  try {
    return await requestJson('/api/dashboard');
  } catch (error) {
    if (error.message === 'Não autenticado.') window.location.href = '/login';
    throw error;
  }
}

export async function saveWorkout(workout, studentId) {
  const id = typeof workout.id === 'string' && /^[0-9a-f-]{36}$/i.test(workout.id) ? workout.id : undefined;
  return requestJson('/api/workout-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(id && { id }), studentId, title: workout.title,
      goal: workout.goal, frequency: workout.frequency,
      exercises: workout.exerciseList || [],
    }),
  });
}

export async function saveMeasurements(measurements, studentId) {
  return requestJson('/api/body-measurements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...measurements, studentId }),
  });
}
