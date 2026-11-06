import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import {
  LayoutDashboard, MapPin, Zap, ClipboardList, AlertTriangle,
  RefreshCw, FileText, Users, Settings, LogOut, Sun, Moon,
  ChevronLeft, ChevronRight, Bolt
} from 'lucide-react';

const iconMap = {
  dashboard: LayoutDashboard,
  zones: MapPin,
  connexions: Zap,
  releves: ClipboardList,
  alertes: AlertTriangle,
  simulations: RefreshCw,
  rapports: FileText,
  utilisateurs: Users,
  parametres: Settings,
};

const navByRole = {
  [ROLES.ADMIN]: [
    { path: '/', icon: 'dashboard', label: 'Dashboard', section: 'Supervision' },
    { path: '/zones', icon: 'zones', label: 'Zones', section: 'Infrastructure' },
    { path: '/connexions', icon: 'connexions', label: 'Réseau électrique', section: null },
    { path: '/utilisateurs', icon: 'utilisateurs', label: 'Utilisateurs', section: 'Administration' },
    { path: '/parametres', icon: 'parametres', label: 'Paramètres', section: null },
  ],
  [ROLES.GESTIONNAIRE]: [
    { path: '/', icon: 'dashboard', label: 'Tableau de bord', section: 'Supervision' },
    { path: '/releves', icon: 'releves', label: 'Relevés', section: 'Opérations' },
    { path: '/analyse', icon: 'zones', label: 'Carte interactive', section: 'Analyse' },
    { path: '/alertes', icon: 'alertes', label: 'Alertes', section: 'Analyse' },
    { path: '/simulations', icon: 'simulations', label: 'Simulations', section: 'Analyse' },
    { path: '/rapports', icon: 'rapports', label: 'Rapports', section: 'Rapports' },
  ],
};

const pageTitles = {
  '/': { [ROLES.ADMIN]: 'Dashboard Administration', [ROLES.GESTIONNAIRE]: 'Tableau de bord énergétique' },
  '/zones': 'Gestion des Zones',
  '/connexions': 'Réseau Électrique',
  '/releves': 'Relevés de Consommation',
  '/analyse': 'Analyse & Carte Interactive',
  '/alertes': 'Alertes & Détection Critique',
  '/simulations': 'Simulations de Rééquilibrage',
  '/rapports': 'Rapports & Export',
  '/utilisateurs': 'Gestion des Utilisateurs',
  '/parametres': 'Paramètres Système',
};

function NavIcon({ name, size = 20 }) {
  const Icon = iconMap[name];
  return Icon ? <Icon size={size} /> : null;
}

export default function Layout() {
  const { user, logout, role } = useAuth();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const resizing = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem('sidebarWidth');
    if (saved) setSidebarWidth(parseInt(saved));
  }, []);

  const handleMouseDown = (e) => {
    resizing.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startW = sidebarWidth;

    const handleMouseMove = (e) => {
      if (!resizing.current) return;
      const newW = Math.max(180, Math.min(400, startW + e.clientX - startX));
      setSidebarWidth(newW);
    };

    const handleMouseUp = () => {
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', sidebarWidth);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const navItems = navByRole[role] || navByRole[ROLES.GESTIONNAIRE];
  let lastSection = null;

  const title = pageTitles[location.pathname];
  const pageTitle = typeof title === 'object' ? (title[role] || 'Page') : (title || 'Page');

  return (
    <div className={`layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className="sidebar" style={{ width: sidebarOpen ? sidebarWidth : 60 }}>
        <div className="sidebar-brand">
          <Bolt size={28} style={{ color: '#fbbf24' }} />
          {sidebarOpen && <><h2>Énergie Urbaine</h2><p>Rééquilibrage du réseau</p></>}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <React.Fragment key={item.path}>
                {showSection && sidebarOpen && <div className="nav-section">{item.section}</div>}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <span className="icon"><NavIcon name={item.icon} size={sidebarOpen ? 20 : 22} /></span>
                  {sidebarOpen && <span>{item.label}</span>}
                </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.nom?.[0]?.toUpperCase() || '?'}
            </div>
            {sidebarOpen && <div>
              <div className="user-name">{user?.nom}</div>
              <div className="user-role">{role}</div>
            </div>}
          </div>
          <button className="btn-logout" onClick={logout} title="Déconnexion">
            <LogOut size={16} /> {sidebarOpen && 'Déconnexion'}
          </button>
          <button className="btn-darkmode" onClick={() => setDark(d => !d)} title={dark ? 'Mode clair' : 'Mode sombre'}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {sidebarOpen && (dark ? 'Mode clair' : 'Mode sombre')}
          </button>
        </div>

        {/* Resize handle */}
        {sidebarOpen && (
          <div
            onMouseDown={handleMouseDown}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 4,
              cursor: 'ew-resize', zIndex: 100,
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            className="sidebar-resize-handle"
          />
        )}
      </aside>

      <div className="main-content">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-toggle-sidebar" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Réduire' : 'Agrandir'}>
              {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
            <h1>{pageTitle}</h1>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <div className="page-content fade-in">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
