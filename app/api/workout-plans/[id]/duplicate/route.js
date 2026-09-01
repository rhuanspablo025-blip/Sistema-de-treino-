import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';

async function requireStaff() {
  const authClient = await createSupabaseServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: profile } = await authClient.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
  if (profile?.active === false) return { error: NextResponse.json({ error: 'Usuário desativado.' }, { status: 403 }) };
  const role = user.app_metadata?.role || profile?.role;
  if (!['dev', 'admin'].includes(role)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user, profile };
}

export async function POST(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: 'ID da ficha é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();

    // Buscar ficha original
    const { data: originalPlan, error: fetchError } = await authClient
      .from('workout_plans_v2')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !originalPlan) {
      return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    }

    // Criar nova ficha
    const { data: newPlan, error: createError } = await authClient
      .from('workout_plans_v2')
      .insert({
        student_id: originalPlan.student_id,
        professor_id: auth.user.id,
        name: `${originalPlan.name} (Cópia)`,
        goal: originalPlan.goal,
        status: 'ativa',
        observations: originalPlan.observations,
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        frequency: originalPlan.frequency,
      })
      .select()
      .single();

    if (createError) throw createError;

    // Buscar todos os treinos da ficha original
    const { data: originalWorkouts, error: workoutsError } = await authClient
      .from('workouts')
      .select('*')
      .eq('workout_plan_id', id)
      .order('order_number', { ascending: true });

    if (workoutsError) throw workoutsError;

    // Mapear IDs antigos para novos
    const workoutMap = {};

    // Duplicar treinos
    for (const workout of originalWorkouts || []) {
      const { data: newWorkout, error: newWorkoutError } = await authClient
        .from('workouts')
        .insert({
          workout_plan_id: newPlan.id,
          name: workout.name,
          day_of_week: workout.day_of_week,
          description: workout.description,
          order_number: workout.order_number,
          observations: workout.observations,
        })
        .select()
        .single();

      if (newWorkoutError) throw newWorkoutError;
      workoutMap[workout.id] = newWorkout.id;

      // Buscar exercícios do treino original
      const { data: originalExercises, error: exercisesError } = await authClient
        .from('workout_exercises')
        .select('*')
        .eq('workout_id', workout.id)
        .order('order_number', { ascending: true });

      if (exercisesError) throw exercisesError;

      // Duplicar exercícios
      for (const exercise of originalExercises || []) {
        const { error: newExerciseError } = await authClient
          .from('workout_exercises')
          .insert({
            workout_id: newWorkout.id,
            exercise_id: exercise.exercise_id,
            order_number: exercise.order_number,
            series: exercise.series,
            repetitions: exercise.repetitions,
            weight: exercise.weight,
            weight_unit: exercise.weight_unit,
            rest_seconds: exercise.rest_seconds,
            execution_time_seconds: exercise.execution_time_seconds,
            method: exercise.method,
            observations: exercise.observations,
            video_url: exercise.video_url,
          });

        if (newExerciseError) throw newExerciseError;
      }
    }

    return NextResponse.json({ plan: newPlan, message: 'Ficha duplicada com sucesso.' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
