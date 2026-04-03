import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    stravaId?: number;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      id?: string;
    };
  }

  interface User {
    id: string;
    stravaId: number;
    name: string;
    email: string;
    image: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    stravaId?: number;
  }
}
