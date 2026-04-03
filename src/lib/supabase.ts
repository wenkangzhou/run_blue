import { createClient } from '@supabase/supabase-js';
import { User } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveUser(user: User) {
  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      strava_id: user.stravaId,
      email: user.email,
      name: user.name,
      image: user.image,
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
      expires_at: user.expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

  if (error) {
    console.error('Error saving user:', error);
    throw error;
  }

  return data;
}

export async function getUserByStravaId(stravaId: number): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('strava_id', stravaId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    stravaId: data.strava_id,
    email: data.email,
    name: data.name,
    image: data.image,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
}

export async function updateUserTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
) {
  const { error } = await supabase
    .from('users')
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating tokens:', error);
    throw error;
  }
}
