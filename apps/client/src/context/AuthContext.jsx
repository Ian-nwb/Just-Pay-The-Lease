import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, tokenStorage } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => tokenStorage.getUser());
  const [token, setToken] = useState(() => tokenStorage.getToken());
  const [loading, setLoading] = useState(true);

  // Any 401 from the API (see services/api.js) ends the local session.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('jptl-session-expired', onExpired);
    return () => window.removeEventListener('jptl-session-expired', onExpired);
  }, []);

  // Validate session on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const savedToken = tokenStorage.getToken();
      if (!savedToken) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const freshUser = await authApi.getMe();
        if (isMounted && freshUser) {
          setUser(freshUser);
          setToken(savedToken);
        }
      } catch (err) {
        console.warn('Session expired or invalid, clearing authentication state:', err.message);
        if (isMounted) {
          tokenStorage.clearAuth();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password, portal) => {
    const res = await authApi.login({ email, password, portal });
    if (res.twoFactorRequired) return res;
    setUser(res.user);
    setToken(res.token);
    return res;
  };

  const completeTwoFactor = async (challengeToken, code, email) => {
    const res = await authApi.verifyTwoFactor({ challengeToken, code, email });
    setUser(res.user);
    setToken(res.token);
    return res;
  };

  const signup = async (data) => {
    return authApi.signup(data);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setToken(null);
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const updated = { ...prev, ...updatedFields };
      tokenStorage.setUser(updated);
      return updated;
    });
  };

  const value = {
    user,
    token,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    completeTwoFactor,
    signup,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
