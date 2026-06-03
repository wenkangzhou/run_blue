import { NextRequest } from 'next/server';
import { handleTrainingPlanRequest } from '../../training-plan/handler';

// Backward-compatible route for older clients. New code should use /api/training-plan.
export async function POST(request: NextRequest) {
  return handleTrainingPlanRequest(request);
}
