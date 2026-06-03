import { NextRequest } from 'next/server';
import { handleTrainingPlanRequest } from './handler';

export async function POST(request: NextRequest) {
  return handleTrainingPlanRequest(request);
}
