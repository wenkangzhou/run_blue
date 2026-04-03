import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('user_id');
  response.cookies.delete('next-auth.session-token');
  response.cookies.delete('next-auth.callback-url');
  response.cookies.delete('next-auth.csrf-token');
  
  return response;
}
