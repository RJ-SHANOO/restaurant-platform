import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, tokenStore } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import type { AuthenticatedUser, UserRole } from '@/types/api';

interface LoginCredentials {
  email: string;
  password: string;
  restaurantSlug?: string;
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  signIn: (credentials: LoginCredentials) => Promise<AuthenticatedUser>;
  /** Stores a token issued outside signIn (e.g. registration) and loads the user it belongs to. */
  hydrateSession: (token: string, user: AuthenticatedUser) => void;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in user for the whole app.
 *
 * `can()` here is a convenience for hiding controls the user cannot use. It is
 * never the actual security boundary - the API re-checks every permission on
 * every request, and a hidden button is not a locked door.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.get();

    if (!token) {
      setIsLoading(false);
      return;
    }

    apiGet<AuthenticatedUser>(endpoints.auth.me)
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setIsLoading(false));
  }, []);

  const hydrateSession = useCallback((token: string, nextUser: AuthenticatedUser) => {
    tokenStore.set(token);
    setUser(nextUser);
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials) => {
    const result = await apiPost<{ token: string; user: AuthenticatedUser }>(
      endpoints.auth.login,
      { ...credentials, deviceName: 'web' },
    );

    hydrateSession(result.token, result.user);
    return result.user;
  }, [hydrateSession]);

  const signOut = useCallback(async () => {
    try {
      await apiPost(endpoints.auth.logout);
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (permission: string) =>
      user?.primaryRole === 'super_admin' || (user?.permissions ?? []).includes(permission),
    [user],
  );

  const canAny = useCallback(
    (permissions: string[]) => permissions.some(can),
    [can],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      role: user?.primaryRole ?? null,
      signIn,
      hydrateSession,
      signOut,
      can,
      canAny,
    }),
    [user, isLoading, signIn, hydrateSession, signOut, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }

  return context;
}
