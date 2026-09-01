import { createSupabaseBrowserClient } from './supabase-browser';

export const demoKeys = {
  students: 'atlas_students',
  workouts: 'atlas_workouts',
  admins: 'atlas_admins',
  exercises: 'atlas_exercises',
  measurements: 'atlas_measurements',
};

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function readDemo(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeDemo(key, value) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
}

export async function loadAtlasData(fallbacks) {
  if (!hasSupabaseConfig()) {
    return Object.fromEntries(Object.entries(fallbacks).map(([key, value]) => [key, readDemo(demoKeys[key], value)]));
  }

  const supabase = createSupabaseBrowserClient();
  const [{ data: userData }, { data: profiles, error: profilesError }, { data: workouts, error: workoutsError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
    supabase.from('workout_plans').select('id, student_id, title, goal, frequency, exercises, updated_at').order('updated_at', { ascending: false }),
  ]);
  if (profilesError) throw profilesError;
  if (workoutsError) throw workoutsError;

  const mappedStudents = (profiles || []).filter((profile) => profile.role === 'student' || profile.id === userData.user?.id).map((profile) => {
    const workout = (workouts || []).find((item) => item.student_id === profile.id);
    return { id: profile.id, name: profile.full_name, initials: profile.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(), goal: workout?.goal || 'Não definido', status: 'Em dia', color: 'coral', updated: workout ? new Date(workout.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem ficha' };
  });
  return {
    students: mappedStudents.length ? mappedStudents : fallbacks.students,
    workouts: (workouts || []).map((item) => ({ id: item.id, title: item.title, student: mappedStudents.find((student) => student.id === item.student_id)?.name || 'Aluno', studentId: item.student_id, admin: 'Equipe Atlas', exercises: Array.isArray(item.exercises) ? item.exercises.length : 0, frequency: item.frequency, goal: item.goal, exerciseList: Array.isArray(item.exercises) ? item.exercises : [] })),
    admins: fallbacks.admins,
    exercises: fallbacks.exercises,
    measurements: null,
  };
}

export async function saveWorkout(workout, studentId) {
  if (!hasSupabaseConfig()) return;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from('workout_plans').upsert({ id: workout.id, student_id: studentId, title: workout.title, goal: workout.goal, frequency: workout.frequency, exercises: workout.exerciseList || [] });
  if (error) throw error;
}

export async function saveMeasurements(measurements, studentId) {
  if (!hasSupabaseConfig()) return;
  const supabase = createSupabaseBrowserClient();
  const payload = { student_id: studentId, height: measurements.height, weight: measurements.weight, shoulder: measurements.shoulder, chest: measurements.chest, waist: measurements.waist, hip: measurements.hip, arm_left: measurements.armLeft, arm_right: measurements.armRight, thigh_left: measurements.thighLeft, thigh_right: measurements.thighRight, leg_left: measurements.legLeft, leg_right: measurements.legRight };
  const { error } = await supabase.from('body_measurements').insert(payload);
  if (error) throw error;
}
