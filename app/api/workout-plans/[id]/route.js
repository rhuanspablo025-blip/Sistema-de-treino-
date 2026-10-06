import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { getWorkoutPlanDetails, workoutPlanErrorResponse } from '../../../../lib/workout-plan-service';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const { id } = await params;
    return NextResponse.json(await getWorkoutPlanDetails(access.user, id));
  } catch (error) {
    return workoutPlanErrorResponse(error, 'Não foi possível carregar os detalhes da ficha.');
  }
}