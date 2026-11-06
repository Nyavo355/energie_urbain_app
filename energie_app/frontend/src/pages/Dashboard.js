import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Map, BellRing, Zap, BarChart3, Factory, CheckCircle, AlertTriangle,
  AlertCircle, Droplets, RefreshCw, Activity, Users, Settings,
  ClipboardList, FileText, ArrowRight, TrendingUp, PieChart
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePie, Pie, Cell, Legend
} from 'recharts';

const statusIcons = {
  normale: <CheckCircle size={14} />,
  surchargee: <AlertTriangle size={14} />,
  critique: <AlertCircle size={14} />,
  excedentaire: <Droplets size={14} />,
};
const statusLabels = {
  normale: 'Normale', surchargee: 'Surchargée', critique: 'Critique', excedentaire: 'Excédentaire',
};
const statusColors = {
  normale: '#16a34a', surchargee: '#dc2626', critique: '#dc2626', excedentaire: '#16a34a',
};

function StatusBadge({ statut }) {
  return (
    <span className={`badge badge-${statut}`}>
      {statusIcons[statut]} {statusLabels[statut] || statut}
    </span>
  );
}

export default function Dashboard() {
  const { user, role, isAdmin, isGestionnaire } = useAuth();
  const [resume, setResume] = useState(null);
  const [statuts, setStatuts] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [consoHoraire, setConsoHoraire] = useState([]);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    try {
      const [res, stat, al, conso] = await Promise.all([
        api.getResume(), api.getStatutZones(), api.getAlertes(false), api.getConsommationParHeure(24)
      ]);
      setResume(res);
      setStatuts(stat);
      setAlertes(al.slice(0, 5));
      setConsoHoraire(conso);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); const t = setInterval(charger, 30000); return () => clearInterval(t); }, [charger]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  const nbZones = resume?.nb_zones || 0;
  const nbCritiques = resume?.nb_zones_critiques || 0;
  const nbAlertes = resume?.nb_alertes_actives || 0;
  const chargeGlobale = resume?.charge_globale_pct || 0;
  const consoTotale = resume?.charge_totale_mw || 0;
  const capaciteTotale = resume?.capacite_totale_mw || 0;

  const chargeColor = chargeGlobale >= 90 ? '#dc2626' : chargeGlobale >= 70 ? '#d97706' : '#16a34a';
  const stats = ['normale', 'surchargee', 'critique', 'excedentaire'].map(s => ({
    key: s,
    count: statuts.filter(z => z.statut === s).length,
    pct: statuts.length > 0 ? (statuts.filter(z => z.statut === s).length / statuts.length * 100) : 0,
    color: statusColors[s],
  }));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          {isAdmin ? 'Dashboard Administration' : 'Tableau de bord énergétique'}
        </h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          &nbsp;·&nbsp;
          {isAdmin ? 'Supervision générale du réseau' : 'Surveillance et analyse du réseau électrique'}
        </p>
      </div>

      {/* Alert banner */}
      {nbAlertes > 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '14px 18', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <BellRing size={22} style={{ color: '#dc2626', flexShrink: 0 }} />
          <div>
            <strong style={{ color: '#dc2626', fontSize: 14 }}>{nbAlertes} alerte{nbAlertes > 1 ? 's' : ''} active{nbAlertes > 1 ? 's' : ''}</strong>
            <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>
              {nbCritiques} zone{nbCritiques > 1 ? 's' : ''} critique{nbCritiques > 1 ? 's' : ''} — Consultez les alertes pour plus de détails.
            </span>
          </div>
          <a href="/alertes" style={{ marginLeft: 'auto', color: '#dc2626', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Voir les alertes →
          </a>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Zones surveillées', value: nbZones, color: '#2d5a9e', icon: <Map size={20} /> },
          { label: 'Capacité totale', value: `${capaciteTotale.toFixed(0)} MW`, color: '#7c3aed', icon: <Factory size={20} /> },
          { label: 'Consommation', value: `${consoTotale.toFixed(0)} MW`, color: '#0ea5e9', icon: <BarChart3 size={20} /> },
          { label: 'Charge réseau', value: `${chargeGlobale.toFixed(0)}%`, color: chargeColor, icon: <Zap size={20} /> },
          { label: 'Zones critiques', value: nbCritiques, color: nbCritiques > 0 ? '#dc2626' : '#16a34a', icon: <AlertCircle size={20} /> },
          { label: 'Alertes actives', value: nbAlertes, color: nbAlertes > 0 ? '#d97706' : '#16a34a', icon: <BellRing size={20} /> },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: '#fff', borderRadius: 10, padding: 16,
            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
              <div style={{ color: kpi.color, opacity: 0.6 }}>{kpi.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charge bar */}
      <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Charge globale du réseau</span>
          <span style={{ fontSize: 13, color: chargeColor, fontWeight: 700 }}>{chargeGlobale.toFixed(1)}%</span>
        </div>
        <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            height: '100%', borderRadius: 6,
            width: `${Math.min(chargeGlobale, 100)}%`,
            background: `linear-gradient(90deg, #16a34a 0%, ${chargeGlobale > 70 ? '#d97706' : '#16a34a'} 60%, ${chargeColor} 100%)`,
            transition: 'width 0.8s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
          <span>0%</span>
          <span>50%</span>
          <span style={{ color: chargeGlobale > 70 ? chargeColor : '#94a3b8' }}>Seuil: {resume?.seuil_alerte_global || 80}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Main grid: table + alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginBottom: 24 }}>
        {/* Zone status table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} /> État des zones
            </span>
            <button className="btn btn-secondary btn-sm" onClick={charger}><RefreshCw size={13} /> Rafraîchir</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 500 }}>Zone</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 500 }}>Consommation</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 500 }}>Capacité</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 500 }}>Charge</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 500 }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {statuts.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Aucune donnée de zone disponible</td></tr>
                ) : statuts.map(z => (
                  <tr key={z.zone_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '10px 14px' }}><strong>{z.zone_code}</strong> – {z.zone_nom}</td>
                    <td style={{ padding: '10px 14px' }}>{z.consommation_mw.toFixed(1)} MW</td>
                    <td style={{ padding: '10px 14px' }}>{z.capacite_mw.toFixed(1)} MW</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(z.taux_charge_pct, 100)}%`, height: '100%',
                            background: z.statut === 'critique' || z.statut === 'surchargee' ? '#dc2626' : '#16a34a',
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{z.taux_charge_pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge statut={z.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts sidebar */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellRing size={16} color={nbAlertes > 0 ? '#dc2626' : '#16a34a'} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Alertes récentes</span>
            {nbAlertes > 0 && <span style={{ marginLeft: 'auto', background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{nbAlertes}</span>}
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {alertes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                <CheckCircle size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: 13 }}>Aucune alerte active</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Le réseau fonctionne normalement</p>
              </div>
            ) : alertes.map(a => (
              <div key={a.id} style={{
                padding: '12px 18px', borderBottom: '1px solid #f8fafc',
                borderLeft: `3px solid ${a.niveau === 'emergency' ? '#dc2626' : a.niveau === 'critical' ? '#d97706' : '#f59e0b'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.zone_nom || 'Zone inconnue'}</div>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: a.niveau === 'emergency' ? '#fee2e2' : a.niveau === 'critical' ? '#fef3c7' : '#fef9c3',
                    color: a.niveau === 'emergency' ? '#dc2626' : a.niveau === 'critical' ? '#d97706' : '#92400e',
                    fontWeight: 600,
                  }}>
                    {a.niveau}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
            ))}
          </div>
          {alertes.length > 0 && (
            <a href="/alertes" style={{
              display: 'block', padding: '10px 18px', textAlign: 'center',
              fontSize: 13, color: '#2d5a9e', textDecoration: 'none', fontWeight: 500,
              borderTop: '1px solid #f1f5f9',
            }}>
              Voir toutes les alertes →
            </a>
          )}
        </div>
      </div>

      {/* Status distribution */}
      <div style={{ background: '#fff', borderRadius: 10, padding: 18, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={16} /> Répartition des zones par statut
        </h3>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Stacked bar */}
          <div style={{ flex: 1 }}>
            <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {stats.filter(s => s.count > 0).map(s => (
                <div key={s.key} style={{
                  width: `${s.pct}%`, height: '100%',
                  background: s.color, opacity: 0.8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#fff', fontWeight: 600,
                  minWidth: s.pct > 10 ? undefined : 0,
                }}>
                  {s.pct > 10 ? `${s.pct.toFixed(0)}%` : ''}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {stats.map(s => (
                <div key={s.key} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: '#f8fafc' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{statusLabels[s.key]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Actions rapides</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {isGestionnaire && (
                <>
                  <a href="/analyse" style={quickActionStyle}>
                    <Map size={15} /> Carte interactive
                  </a>
                  <a href="/releves" style={quickActionStyle}>
                    <ClipboardList size={15} /> Saisir un relevé
                  </a>
                  <a href="/simulations" style={quickActionStyle}>
                    <Zap size={15} /> Lancer simulation
                  </a>
                </>
              )}
              {isAdmin && (
                <>
                  <a href="/zones" style={quickActionStyle}>
                    <Map size={15} /> Gérer les zones
                  </a>
                  <a href="/connexions" style={quickActionStyle}>
                    <Zap size={15} /> Gérer le réseau
                  </a>
                  <a href="/utilisateurs" style={quickActionStyle}>
                    <Users size={15} /> Gérer utilisateurs
                  </a>
                  <a href="/parametres" style={quickActionStyle}>
                    <Settings size={15} /> Paramètres système
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Line chart: consommation par heure */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={16} color="#2d5a9e" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Tendance consommation (24h)</span>
          </div>
          {consoHoraire.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={consoHoraire.map(d => ({ ...d, heure: new Date(d.horodatage).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="heure" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" MW" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="consommation_mw" stroke="#2d5a9e" strokeWidth={2} dot={{ r: 2, fill: '#2d5a9e' }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
              <BarChart3 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Aucune donnée horaire disponible</p>
            </div>
          )}
        </div>

        {/* Pie chart: répartition statuts */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <PieChart size={16} color="#7c3aed" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Répartition par statut</span>
          </div>
          {statuts.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RePie>
                <Pie
                  data={stats.filter(s => s.count > 0)}
                  dataKey="count"
                  nameKey="key"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  paddingAngle={4}
                >
                  {stats.filter(s => s.count > 0).map(s => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                <Legend
                  formatter={(val) => <span style={{ fontSize: 12, color: '#374151' }}>{statusLabels[val]}</span>}
                  iconSize={10}
                />
              </RePie>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
              <PieChart size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Aucune donnée de statut</p>
            </div>
          )}
        </div>
      </div>

      {/* Bar chart: consommation vs capacité par zone */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BarChart3 size={16} color="#0ea5e9" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Consommation vs Capacité par zone</span>
        </div>
        {statuts.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statuts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="zone_code" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit=" MW" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
              <Legend formatter={(val) => <span style={{ fontSize: 12, color: '#374151' }}>{val}</span>} iconSize={10} />
              <Bar dataKey="consommation_mw" name="Consommation" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Bar dataKey="capacite_mw" name="Capacité" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            <BarChart3 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Aucune donnée de zone disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}

const quickActionStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderRadius: 6, fontSize: 13,
  background: '#f8fafc', color: '#374151',
  textDecoration: 'none', border: '1px solid #f1f5f9',
  transition: 'all 0.15s',
};
