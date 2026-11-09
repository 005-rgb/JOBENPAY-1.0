import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getEnvironment, setEnvironment as setClientEnvironment } from '../api/client.js';

const EnvironmentContext = createContext({
  environment: 'SANDBOX',
  setEnvironment: (_env) => {},
  isLive: false,
  isSandbox: true,
});

export function EnvironmentProvider({ children }) {
  let queryClient = null;
  try {
    queryClient = useQueryClient();
  } catch {}

  const [environment, setEnvState] = useState(() => {
    try {
      const saved = localStorage.getItem('jobenpay_environment');
      if (saved && (saved === 'SANDBOX' || saved === 'LIVE')) {
        return saved;
      }
    } catch {}
    return getEnvironment() || 'SANDBOX';
  });

  useEffect(() => {
    setClientEnvironment(environment);
    try {
      localStorage.setItem('jobenpay_environment', environment);
    } catch {}
  }, [environment]);

  const setEnvironment = (newEnv) => {
    const upper = String(newEnv || '').toUpperCase();
    if ((upper === 'SANDBOX' || upper === 'LIVE') && upper !== environment) {
      setEnvState(upper);
      setClientEnvironment(upper);
      try {
        localStorage.setItem('jobenpay_environment', upper);
      } catch {}
      if (queryClient) {
        queryClient.invalidateQueries();
      }
    }
  };

  const isLive = environment === 'LIVE';
  const isSandbox = environment === 'SANDBOX';

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment, isLive, isSandbox }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return context;
}

export default EnvironmentContext;
