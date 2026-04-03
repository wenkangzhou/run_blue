import NextAuth from 'next-auth';
import { NextAuthOptions } from 'next-auth';

const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'strava',
      name: 'Strava',
      type: 'oauth',
      authorization: {
        url: 'https://www.strava.com/oauth/authorize',
        params: {
          scope: 'read,activity:read',
          approval_prompt: 'auto',
          response_type: 'code',
        },
      },
      token: {
        url: 'https://www.strava.com/oauth/token',
        async request({ client, params, checks, provider }) {
          const response = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_id: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID,
              client_secret: process.env.STRAVA_CLIENT_SECRET,
              code: params.code,
              grant_type: 'authorization_code',
            }),
          });

          const tokens = await response.json();
          return { tokens };
        },
      },
      userinfo: {
        url: 'https://www.strava.com/api/v3/athlete',
        async request({ tokens, provider }) {
          const response = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          });
          return await response.json();
        },
      },
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: `${profile.firstname} ${profile.lastname}`,
          email: profile.email || `${profile.id}@strava.local`,
          image: profile.profile,
          stravaId: profile.id,
        };
      },
      clientId: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.stravaId = (profile as any).id || (profile as any).stravaId;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.expiresAt = token.expiresAt as number;
      session.stravaId = token.stravaId as number;
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'jwt',
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
