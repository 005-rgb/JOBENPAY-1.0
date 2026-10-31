import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, setCsrfToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/auth/me'),
    retry: false,
    staleTime: 30000,
  });
  const csrfToken = authQuery.data?.csrfToken || '';

  useEffect(() => {
    setCsrfToken(csrfToken);
  }, [csrfToken]);

  const value = useMemo(() => ({
    ...authQuery,
    user: authQuery.data?.user || null,
    org: authQuery.data?.org || null,
    role: authQuery.data?.role || 'VIEWER',
    csrfToken,
    async login(credentials) {
      const result = await apiClient.post('/auth/login', credentials);
      if (!result.ok) {
        const error = new Error(result.message || 'Authentication failed.');
        error.code = result.code || 'UNAUTHENTICATED';
        throw error;
      }
      setCsrfToken(result.csrfToken);
      queryClient.setQueryData(['auth', 'me'], await apiClient.get('/auth/me'));
      return result;
    },
    async logout() {
      await apiClient.post('/auth/logout');
      setCsrfToken('');
      queryClient.setQueryData(['auth', 'me'], null);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    refresh: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  }), [authQuery, csrfToken, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
