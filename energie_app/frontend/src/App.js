// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './styles/animations.css';
import { AuthProvider, useAuth, ROUTE_ROLES } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Zones from './pages/Zones';
import Connexions from './pages/Connexions';
import Releves from './pages/Releves';
import Analyse from './pages/Analyse';
import Alertes from './pages/Alertes';
import Simulations from './pages/Simulations';
import Rapports from './pages/Rapports';
import Utilisateurs from './pages/Utilisateurs';
import Parametres from './pages/Parametres';
import './App.css';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ children, roles }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(...roles)) return <Navigate to="/" replace />;
  return children;
}

function ProtectedRoute({ path, children }) {
  const allowed = ROUTE_ROLES[path] || null;
  if (!allowed) return children;
  return <RoleRoute roles={allowed}>{children}</RoleRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="zones" element={<ProtectedRoute path="/zones"><Zones /></ProtectedRoute>} />
            <Route path="connexions" element={<ProtectedRoute path="/connexions"><Connexions /></ProtectedRoute>} />
            <Route path="releves" element={<ProtectedRoute path="/releves"><Releves /></ProtectedRoute>} />
            <Route path="alertes" element={<ProtectedRoute path="/alertes"><Alertes /></ProtectedRoute>} />
            <Route path="analyse" element={<ProtectedRoute path="/analyse"><Analyse /></ProtectedRoute>} />
            <Route path="simulations" element={<ProtectedRoute path="/simulations"><Simulations /></ProtectedRoute>} />
            <Route path="rapports" element={<ProtectedRoute path="/rapports"><Rapports /></ProtectedRoute>} />
            <Route path="utilisateurs" element={<ProtectedRoute path="/utilisateurs"><Utilisateurs /></ProtectedRoute>} />
            <Route path="parametres" element={<ProtectedRoute path="/parametres"><Parametres /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
