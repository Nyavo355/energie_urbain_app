// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '../services/api';

export const ROLES = {
  ADMIN: 'Administrateur',
  GESTIONNAIRE: 'Gestionnaire',
};

export const ROUTE_ROLES = {
  '/': [ROLES.ADMIN, ROLES.GESTIONNAIRE],
  '/zones': [ROLES.ADMIN],
  '/connexions': [ROLES.ADMIN],
  '/releves': [ROLES.GESTIONNAIRE],
  '/alertes': [ROLES.GESTIONNAIRE],
  '/analyse': [ROLES.GESTIONNAIRE],
  '/simulations': [ROLES.GESTIONNAIRE],
  '/rapports': [ROLES.GESTIONNAIRE],
  '/utilisateurs': [ROLES.ADMIN],
  '/parametres': [ROLES.ADMIN],
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const role = user?.role?.nom || null;

  const roleData = useMemo(() => ({
    role,
    isAdmin: role === ROLES.ADMIN,
    isGestionnaire: role === ROLES.GESTIONNAIRE,
    hasRole: (...roles) => roles.includes(role),
  }), [role]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('token', data.access_token);
    setUser(data.utilisateur);
    return data.utilisateur;
  };

  const logout = async () => {
    try { await api.logout(); } catch (_) {}
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, ...roleData }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
