import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from './AuthProvider.jsx';
import { Skeleton } from '../components/primitives.jsx';

export function RequireAuth({ children }) {
  const auth = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (auth.isPending) {
    return <main aria-label={t('components.loading')}><Skeleton className="pageSkeleton" /></main>;
  }
  if (!auth.user) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }
  return children;
}

export function RequireRole({ roles, children }) {
  const auth = useAuth();
  if (!roles.includes(auth.role)) return <Navigate replace to="/coming-soon" />;
  return children;
}
