import React, { useState, useEffect, lazy, Suspense } from 'react';
import { clearAuthSession, logoutSuperadmin } from './services/superadminApi';
import { DashboardSkeleton } from './components/ui/SkeletonLoader';
import { useTheme } from './hooks/useTheme';

const SuperadminLoginPage = lazy(() => import('./pages/SuperadminLoginPage').then(m => ({ default: m.SuperadminLoginPage })));
const SuperadminPortalPage = lazy(() => import('./pages/SuperadminPortalPage').then(m => ({ default: m.SuperadminPortalPage })));

function App() {
  const { theme, toggleTheme } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('jptl_superadmin_auth') === 'true';
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener('superadmin-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('superadmin-unauthorized', handleUnauthorized);
    };
  }, []);

  return (
    <Suspense fallback={<div className="p-8 min-h-screen bg-app text-ink"><DashboardSkeleton /></div>}>
      {!isAuthenticated ? (
        <SuperadminLoginPage
          onLoginSuccess={() => setIsAuthenticated(true)}
        />
      ) : (
        <SuperadminPortalPage
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={async () => {
            await logoutSuperadmin();
            setIsAuthenticated(false);
          }}
        />
      )}
    </Suspense>
  );
}

export default App;
