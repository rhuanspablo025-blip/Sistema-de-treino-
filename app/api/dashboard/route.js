import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    const staff = ['admin', 'dev', 'trainer'].includes(access.user.role);
    const studentFilter = staff ? { active: true } : { userId: access.user.id, active: true };
    if (access.user.role === 'trainer') studentFilter.trainerId = access.user.id;
    const profiles = await database.collection('students').find(studentFilter).sort({ name: 1 }).toArray();
    const studentIds = profiles.map((student) => student.userId);
    const planFilter = staff ? { studentId: { $in: studentIds }, active: true } : { studentId: access.user.id, active: true };
    if (access.user.role === 'trainer') planFilter.trainerId = access.user.id;
    const plans = await database.collection('workout_plans').find(planFilter).sort({ updatedAt: -1 }).toArray();
    const planIds = plans.map((plan) => plan.id);
    const workouts = await database.collection('workouts').find({ workoutPlanId: { $in: planIds } }).sort({ order: 1 }).toArray();
    const exerciseIds = [...new Set(workouts.flatMap((workout) => (workout.exercises || []).map((item) => item.exerciseId)))];
    const exerciseDocs = exerciseIds.length ? await database.collection('exercises').find({ id: { $in: exerciseIds } }).toArray() : [];
    const exerciseNames = new Map(exerciseDocs.map((exercise) => [exercise.id, exercise.name]));

    const students = profiles.map((profile) => {
      const latestPlan = plans.find((plan) => plan.studentId === profile.userId);
      return {
        id: profile.userId,
        name: profile.name,
        initials: profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
        goal: profile.goal || latestPlan?.objective || 'Não definido',
        status: 'Em dia', color: 'coral',
        updated: latestPlan?.updatedAt ? new Date(latestPlan.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem ficha',
      };
    });

    const workoutViews = plans.map((plan) => {
      const student = students.find((item) => item.id === plan.studentId);
      const assignedWorkouts = workouts.filter((workout) => workout.workoutPlanId === plan.id);
      const exerciseList = assignedWorkouts.flatMap((workout) => (workout.exercises || []).map((item) => ({
        id: item.id, exerciseId: item.exerciseId, name: exerciseNames.get(item.exerciseId) || 'Exercício',
        detail: `${item.sets} séries · ${item.repetitions} reps`, load: item.load ?? '', rest: `${item.rest}s`,
        workoutId: workout.id, observations: item.observations,
      })));
      return { id: plan.id, title: plan.name, student: student?.name || 'Aluno', studentId: plan.studentId, admin: 'Equipe', exercises: exerciseList.length, frequency: plan.frequency, goal: plan.objective, exerciseList, workoutId: assignedWorkouts[0]?.id };
    });

    const [exerciseCatalog, adminUsers] = await Promise.all([
      database.collection('exercises').find({ active: true }).sort({ name: 1 }).toArray(),
      staff ? database.collection('users').find({ role: { $in: ['admin', 'trainer', 'dev'] }, active: true }, { projection: { passwordHash: 0 } }).toArray() : [],
    ]);
    return NextResponse.json({
      currentUser: { id: access.user.id, name: access.user.name, username: access.user.username, role: access.user.role },
      students, workouts: workoutViews,
      admins: adminUsers.map((user) => ({ id: user.id, name: user.name, username: user.username, role: user.role, initials: user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() })),
      exercises: exerciseCatalog.map((exercise) => exercise.name),
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os dados da academia.' }, { status: 500 });
  }
}
