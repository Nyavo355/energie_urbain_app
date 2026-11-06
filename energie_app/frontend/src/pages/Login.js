import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bolt, Mail, Lock, Shield, Clock, Radio,
  BarChart3, AlertCircle, LogIn
} from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('admin@energie.mg');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-hero-overlay" />
        <div className="login-hero-content">
          <div className="hero-badge">
            <Bolt size={14} /> Système de pilotage v2.0
          </div>
          <div className="hero-energy-icon">
            <Bolt size={64} style={{ color: '#fbbf24' }} />
          </div>
          <h1 className="hero-title">Énergie Urbaine</h1>
          <p className="hero-subtitle">Système Intelligent de Rééquilibrage du Réseau Électrique</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <Clock size={20} />
              <span className="hero-stat-value">24/7</span>
              <span className="hero-stat-label">Supervision</span>
            </div>
            <div className="hero-stat">
              <Radio size={20} />
              <span className="hero-stat-value">Temps réel</span>
              <span className="hero-stat-label">Analyse charge</span>
            </div>
            <div className="hero-stat">
              <BarChart3 size={20} />
              <span className="hero-stat-value">Multi-algo</span>
              <span className="hero-stat-label">Rééquilibrage</span>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-section">
        <div className="login-form-container">
          <div className="login-form-header">
            <div className="login-form-icon">
              <Bolt size={28} style={{ color: '#2d5a9e' }} />
            </div>
            <h2 className="login-form-title">Connexion</h2>
            <p className="login-form-desc">Accédez à votre espace de pilotage</p>
          </div>

          {error && (
            <div className="login-error slide-up">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="login-input-group slide-up">
              <label className="login-label">Adresse email</label>
              <div className="login-input-wrap">
                <Mail size={18} className="login-input-icon" />
                <input
                  type="email" className="login-input"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@energie.mg" required
                />
              </div>
            </div>

            <div className="login-input-group slide-up">
              <label className="login-label">Mot de passe</label>
              <div className="login-input-wrap">
                <Lock size={18} className="login-input-icon" />
                <input
                  type="password" className="login-input"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                />
              </div>
            </div>

            <button type="submit" className="login-submit slide-up" disabled={loading}>
              {loading ? (
                <span className="login-submit-loading">
                  <span className="spinner-sm" /> Connexion en cours...
                </span>
              ) : (
                <span className="login-submit-text">
                  <LogIn size={18} /> Accéder au tableau de bord
                </span>
              )}
            </button>
          </form>

          <div className="login-footer fade-in">
            <Shield size={14} />
            <span>Environnement sécurisé — Accès réservé au personnel autorisé</span>
          </div>
        </div>
      </div>
    </div>
  );
}
