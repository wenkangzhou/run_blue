import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@/types';

type UserRow = Record<string, unknown> & {
  id: string;
  strava_id: number;
  email: string | null;
  name: string;
  image: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  updated_at: string;
};

type UserInsert = UserRow;
type UserUpdate = Partial<Omit<UserRow, 'id' | 'strava_id'>>;

interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type SupabaseUserClient = SupabaseClient<Database>;

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let supabaseClient: SupabaseUserClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

function requireSupabaseClient(): SupabaseUserClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
  }

  supabaseClient ??= createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

export async function saveUser(user: User) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      strava_id: user.stravaId,
      email: user.email || null,
      name: user.name,
      image: user.image,
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
      expires_at: user.expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving user:', error);
    throw error;
  }

  return data;
}

export async function getUserByStravaId(stravaId: number): Promise<User | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('strava_id', stravaId)
    .maybeSingle();

  if (error) {
    console.error('Error loading user:', error);
    throw error;
  }

  if (!data) return null;

  return {
    id: data.id,
    stravaId: data.strava_id,
    email: data.email ?? '',
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
  const supabase = requireSupabaseClient();
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
