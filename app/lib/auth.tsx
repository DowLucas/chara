import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearToken, getMe, setToken, User } from './api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  setUser: () => {},
  refreshUser: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(t: string) {
    await setToken(t);
    setTokenState(t);
    const u = await getMe();
    setUser(u);
  }

  async function signOut() {
    await clearToken();
    setTokenState(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const u = await getMe();
      setUser(u);
      return u;
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
