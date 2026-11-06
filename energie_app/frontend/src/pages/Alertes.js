import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import {
  BellRing, AlertTriangle, AlertCircle, CheckCircle, Eye, RefreshCw,
  MapPin, Zap, BarChart3, Activity, ArrowRight
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MADAGASCAR_CENTER = [-18.7669, 46.8691];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const niveauIcon = {
  warning: <AlertTriangle size={14} />,
  critical: <AlertCircle size={14} />,
  emergency: <BellRing size={14} />,
};
const niveauLabel = { warning: 'Avertissement', critical: 'Critique', emergency: 'Urgence' };
const typeLabel = { surcharge: 'Surcharge', critique: 'Zone Critique', depassement_transit: 'Dépassement Transit' };

const statusColors = { normale: '#16a34a', surchargee: '#dc2626', critique: '#dc2626', excedentaire: '#16a34a' };

function MapStateSaver({ storageKey }) {
  const map = useMap();
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const { center, zoom } = JSON.parse(saved);
        if (center && zoom != null) map.setView(center, zoom, { animate: false });
      } catch (_) {}
    }
    const save = () => {
      const c = map.getCenter();
      localStorage.setItem(storageKey, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }));
    };
    map.on('moveend', save);
    return () => map.off('moveend', save);
  }, [map, storageKey]);
  return null;
}

function AutoCenter({ zone }) {
  const map = useMap();
  const prevId = useRef(null);
  useEffect(() => {
    if (zone?.latitude && zone?.longitude && zone.id !== prevId.current) {
      map.setView([zone.latitude, zone.longitude], 11, { animate: true });
      prevId.current = zone.id;
    }
  }, [zone, map]);
  return null;
}

export default function Alertes() {
  const [alertes, setAlertes] = useState([]);
  const [resolues, setResolues] = useState([]);
  const [zones, setZones] = useState([]);
  const [tab, setTab] = useState('actives');
  const [viewMode, setViewMode] = useState('table');
  const [selectedAlerte, setSelectedAlerte] = useState(null);
  const [loading, setLoading] = useState(true);

  const LIMIT_ZONES = 8;
  const charger = async () => {
    try {
      const [act, res, z] = await Promise.all([api.getAlertes(false), api.getAlertes(true), api.getZones()]);
      setAlertes(act); setResolues(res); setZones(z.slice(0, LIMIT_ZONES)); setLoading(false);
    } catch (err) { console.error('Erreur chargement alertes:', err); setLoading(false); }
  };
  useEffect(() => { charger(); const t = setInterval(charger, 15000); return () => clearInterval(t); }, []);

  const currentList = tab === 'actives' ? alertes : resolues;

  const zonesMap = useMemo(() => {
    const map = {};
    zones.forEach(z => { map[z.id] = z; });
    return map;
  }, [zones]);

  const zonesAvecStatut = useMemo(() => {
    return zones.map(z => {
      const alerte = currentList.find(a => a.zone_id === z.id) || alertes.find(a => a.zone_id === z.id);
      const taux = alerte?.taux_charge_pct ?? (z.capacite_max_mw > 0 ? ((z.consommation_mw || z.capacite_max_mw * 0.6) / z.capacite_max_mw) * 100 : 0);
      const conso = (taux / 100) * z.capacite_max_mw;
      let statut = z.statut || 'normale';
      if (alerte) {
        statut = alerte.type === 'critique' || (taux >= 100) ? 'critique' : 'surchargee';
      }
      return { ...z, taux, conso, statut, hasAlerte: !!alerte };
    });
  }, [zones, currentList, alertes]);

  const zonesProches = useMemo(() => {
    if (!selectedAlerte) return [];
    const zone = zonesMap[selectedAlerte.zone_id];
    if (!zone?.latitude || !zone?.longitude) return [];
    return zonesAvecStatut
      .filter(z => z.id !== selectedAlerte.zone_id && z.latitude && z.longitude)
      .map(z => ({ ...z, dist: haversine(zone.latitude, zone.longitude, z.latitude, z.longitude) }))
      .filter(z => z.dist <= 15)
      .sort((a, b) => a.dist - a.dist)
      .slice(0, 10);
  }, [selectedAlerte, zonesMap, zonesAvecStatut]);

  const acquitter = async (id) => { await api.acquitterAlerte(id); charger(); };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Left / Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          <button onClick={() => setTab('actives')}
            style={{
              flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
              background: tab === 'actives' ? '#1e3a5f' : 'transparent',
              color: tab === 'actives' ? '#fff' : '#64748b', fontWeight: tab === 'actives' ? 600 : 400, fontSize: 13,
            }}>
            <AlertTriangle size={14} /> Actives ({alertes.length})
          </button>
          <button onClick={() => setTab('resolues')}
            style={{
              flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
              background: tab === 'resolues' ? '#1e3a5f' : 'transparent',
              color: tab === 'resolues' ? '#fff' : '#64748b', fontWeight: tab === 'resolues' ? 600 : 400, fontSize: 13,
            }}>
            <CheckCircle size={14} /> Résolues ({resolues.length})
          </button>
          <button onClick={() => setViewMode(viewMode === 'table' ? 'map' : 'table')}
            style={{
              padding: '10px 16px', border: 'none', cursor: 'pointer', marginLeft: 'auto',
              background: viewMode === 'map' ? '#e0f2fe' : 'transparent',
              color: viewMode === 'map' ? '#0369a1' : '#64748b', fontWeight: 400, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <MapPin size={14} /> {viewMode === 'table' ? 'Carte' : 'Tableau'}
          </button>
        </div>

        {viewMode === 'table' ? (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <RefreshCw size={24} className="spinner-sm" />
              </div>
            ) : currentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <CheckCircle size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p>Aucune alerte {tab === 'actives' ? 'active' : 'résolue'}</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Zone</th><th>Type</th><th>Niveau</th><th>Taux</th><th>Message</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.map(a => {
                    const z = zonesMap[a.zone_id];
                    return (
                      <tr key={a.id}
                        onClick={() => { setSelectedAlerte(a); setViewMode('map'); }}
                        style={{ cursor: 'pointer' }}>
                        <td><strong>{z?.code || '—'}</strong></td>
                        <td><span className="badge badge-info">{typeLabel[a.type] || a.type}</span></td>
                        <td>{niveauIcon[a.niveau]} {niveauLabel[a.niveau] || a.niveau}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(a.taux_charge_pct || 0, 100)}%`, height: '100%',
                                background: (a.taux_charge_pct || 0) >= 100 ? '#dc2626' : '#d97706',
                                borderRadius: 3,
                              }} />
                            </div>
                            <span>{(a.taux_charge_pct || 0).toFixed(1)}%</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{new Date(a.horodatage || a.date_creation).toLocaleString('fr-FR')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {tab === 'actives' && (
                              <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); acquitter(a.id); }} title="Acquitter"><Eye size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer center={MADAGASCAR_CENTER} zoom={7}
              style={{ height: '100%', width: '100%', zIndex: 1 }}
              scrollWheelZoom={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* All zones */}
              {zonesAvecStatut.filter(z => z.latitude && z.longitude).map(z => {
                const isSelected = selectedAlerte?.zone_id === z.id;
                const color = isSelected ? '#2563eb' : z.hasAlerte ? '#dc2626' : '#16a34a';
                const radius = Math.max(120, Math.min((z.capacite_max_mw || 50) * 3, 700));
                return (
                  <Circle key={z.id}
                    center={[z.latitude, z.longitude]}
                    radius={radius}
                    pathOptions={{
                      color, fillColor: color,
                      fillOpacity: isSelected ? 0.35 : z.hasAlerte ? 0.25 : 0.1,
                      weight: isSelected ? 3 : 1.5,
                    }}
                  />
                );
              })}

              {selectedAlerte && (() => {
                const z = zonesMap[selectedAlerte.zone_id];
                if (!z?.latitude || !z?.longitude) return null;
                return (
                  <>
                    <AutoCenter zone={z} />
                    {/* Lines to nearby zones */}
                    {zonesProches.filter(p => p.latitude && p.longitude).map(p => (
                      <Polyline key={`line-${p.id}`}
                        positions={[[z.latitude, z.longitude], [p.latitude, p.longitude]]}
                        pathOptions={{
                          color: p.statut === 'critique' || p.statut === 'surchargee' ? '#dc2626' : '#16a34a',
                          weight: 1.5, opacity: 0.4, dashArray: '5,5',
                        }}
                      />
                    ))}
                  </>
                );
              })()}

              <MapStateSaver storageKey="mapState_alertes" />
            </MapContainer>

            {/* Legend */}
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 1000,
              background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 12px',
              fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Légende</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
                  <span>Zone normale</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626' }} />
                  <span>Zone critique</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: '#2563eb', opacity: 0.6 }} />
                  <span>Zone sélectionnée</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 2, background: '#16a34a', borderRadius: 1 }} />
                  <span>Liaison zone normale</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 2, background: '#dc2626', borderRadius: 1 }} />
                  <span>Liaison zone critique</span>
                </div>
              </div>
            </div>

            {selectedAlerte && (
              <div style={{
                position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 1000,
                background: '#fff', borderRadius: 8, padding: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>{zonesMap[selectedAlerte.zone_id]?.code} — {selectedAlerte.type}</strong>
                  <span className={`badge badge-${selectedAlerte.niveau === 'emergency' ? 'emergency' : selectedAlerte.niveau === 'critical' ? 'critical' : 'warning'}`}>
                    {niveauLabel[selectedAlerte.niveau]}
                  </span>
                </div>
                <div style={{ color: '#6b7280', marginBottom: 8 }}>{selectedAlerte.message}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Taux : {(selectedAlerte.taux_charge_pct || 0).toFixed(1)}%</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => acquitter(selectedAlerte.id)}><Eye size={12} /> Acquitter</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel — nearby zones when alert selected on map */}
      {viewMode === 'map' && selectedAlerte && zonesProches.length > 0 && (
        <div style={{
          width: 320, background: '#fff', borderLeft: '1px solid #e2e8f0',
          overflowY: 'auto', flexShrink: 0, padding: 16,
        }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} /> Zones à proximité
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {zonesProches.map(z => {
              const isAlert = z.statut === 'critique' || z.statut === 'surchargee';
              const seuil = (z.taux / (z.capacite_max_mw || 1)) * 100;
              return (
                <div key={z.id} style={{
                  padding: 10, borderRadius: 6,
                  background: isAlert ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${isAlert ? '#fecaca' : '#bbf7d0'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{z.code}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 8, fontSize: 11,
                      background: isAlert ? '#fee2e2' : '#dcfce7',
                      color: isAlert ? '#dc2626' : '#16a34a', fontWeight: 600,
                    }}>
                      {isAlert ? 'CRITIQUE' : 'NORMAL'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Taux : {z.taux?.toFixed(1)}% — Seuil : {z.seuil_alerte_pct || 80}%
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: '#64748b' }}>
                    <Activity size={12} /> {(z.taux / (z.capacite_max_mw || 1) * 100).toFixed(1)}% du seuil
                    <BarChart3 size={12} /> {(z.taux > (z.seuil_alerte_pct || 80))
                      ? `${(z.taux - (z.seuil_alerte_pct || 80)).toFixed(1)}% au-dessus`
                      : `${((z.seuil_alerte_pct || 80) - z.taux).toFixed(1)}% en dessous`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <button onClick={charger} style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 1100,
        width: 44, height: 44, borderRadius: 22, border: 'none',
        background: '#1e3a5f', color: '#fff', cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} title="Actualiser">
        <RefreshCw size={18} />
      </button>
    </div>
  );
}
