import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import {
  MapPin, Zap, AlertTriangle, AlertCircle, CheckCircle,
  BarChart3, RefreshCw, Activity,
  Droplets, Ruler
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

function getStatusColor(statut) {
  return statut === 'critique' || statut === 'surchargee' ? '#dc2626' : '#16a34a';
}

function getStatusBadge(statut) {
  const colors = {
    normale: { bg: '#dcfce7', color: '#16a34a', label: 'Normale' },
    surchargee: { bg: '#fee2e2', color: '#dc2626', label: 'Surchargée' },
    critique: { bg: '#fee2e2', color: '#dc2626', label: 'Critique' },
    excedentaire: { bg: '#dcfce7', color: '#16a34a', label: 'Excédentaire' },
  };
  const c = colors[statut] || { bg: '#f1f5f9', color: '#64748b', label: statut };
  return <span style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{c.label}</span>;
}

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

export default function Analyse() {
  const [zones, setZones] = useState([]);
  const [connexions, setConnexions] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [statutZones, setStatutZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('carte');
  const mapRef = useRef(null);

  const charger = async () => {
    try {
      const [z, c, a, s] = await Promise.all([
        api.getZones(),
        api.getConnexions(),
        api.getAlertes(false),
        api.getStatutZones(),
      ]);
      setZones(z.slice(0, 8));
      setConnexions(c);
      setAlertes(a);
      setStatutZones(s);
    } catch (err) { console.error('Erreur chargement analyse:', err); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await charger();
    setRefreshing(false);
  };

  useEffect(() => { (async () => { setLoading(true); await charger(); setLoading(false); })(); }, []);

  // Real-time sync: poll + refresh on tab focus
  useEffect(() => {
    const interval = setInterval(charger, 15000);
    const onFocus = () => charger();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  const handleCenter = () => {
    if (selectedZone?.latitude && selectedZone?.longitude && mapRef.current) {
      mapRef.current.setView([selectedZone.latitude, selectedZone.longitude], 11, { animate: true });
    }
  };

  const zonesAvecConso = useMemo(() => {
    const statutMap = {};
    statutZones.forEach(s => { statutMap[s.zone_id] = s; });
    return zones.map(z => {
      const alerte = alertes.find(a => a.zone_id === z.id);
      const alerteTaux = alerte?.taux_charge_pct;
      if (alerteTaux != null) {
        const conso = (alerteTaux / 100) * z.capacite_max_mw;
        const taux = z.capacite_max_mw > 0 ? (conso / z.capacite_max_mw) * 100 : 0;
        const statut = getStatutFromTaux(taux, z.seuil_alerte_pct || 80);
        return { ...z, conso, taux, statut };
      }
      const sz = statutMap[z.id];
      if (sz) {
        return { ...z, conso: sz.consommation_mw, taux: sz.taux_charge_pct, statut: sz.statut };
      }
      const conso = z.capacite_max_mw * 0.6;
      const taux = z.capacite_max_mw > 0 ? (conso / z.capacite_max_mw) * 100 : 0;
      const statut = getStatutFromTaux(taux, z.seuil_alerte_pct || 80);
      return { ...z, conso, taux, statut };
    });
  }, [zones, alertes, statutZones]);

  const selectedData = useMemo(() => {
    if (!selectedZone) return null;
    return zonesAvecConso.find(z => z.id === selectedZone.id);
  }, [selectedZone, zonesAvecConso]);

  const zonesProches = useMemo(() => {
    if (!selectedZone) return [];
    return zonesAvecConso
      .filter(z => z.id !== selectedZone.id && z.latitude && z.longitude && selectedZone.latitude && selectedZone.longitude)
      .map(z => ({ ...z, dist: haversine(selectedZone.latitude, selectedZone.longitude, z.latitude, z.longitude) }))
      .filter(z => z.dist <= 15)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  }, [selectedZone, zonesAvecConso]);

  const alertesActives = useMemo(() => {
    return zonesAvecConso.filter(z => z.statut === 'critique' || z.statut === 'surchargee');
  }, [zonesAvecConso]);

  const handleSelectZone = (z) => {
    setSelectedZone(z.id === selectedZone?.id ? null : z);
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          {['carte', 'alertes'].map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'carte') charger(); }}
              style={{
                flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: tab === t ? '#1e3a5f' : 'transparent',
                color: tab === t ? '#fff' : '#64748b',
                fontWeight: tab === t ? 600 : 400, fontSize: 13,
                transition: 'all 0.15s',
                borderBottom: tab === t ? '2px solid #1e3a5f' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {t === 'carte' ? <MapPin size={15} /> : <AlertTriangle size={15} />}
              {t === 'carte' ? 'Carte interactive' : 'Alertes'}
            </button>
          ))}
        </div>

        {/* Map view */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            whenCreated={(m) => { mapRef.current = m; }}
            center={MADAGASCAR_CENTER}
            zoom={7}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Connexions */}
            {connexions.filter(c => {
              const s = zones.find(z => z.id === c.zone_source_id);
              const d = zones.find(z => z.id === c.zone_destination_id);
              return s?.latitude && s?.longitude && d?.latitude && d?.longitude;
            }).map(c => {
              const s = zones.find(z => z.id === c.zone_source_id);
              const d = zones.find(z => z.id === c.zone_destination_id);
              return (
                <Polyline key={`conn-${c.id}`}
                  positions={[[s.latitude, s.longitude], [d.latitude, d.longitude]]}
                  pathOptions={{ color: '#94a3b8', weight: 1.5, opacity: 0.4 }}
                />
              );
            })}

            {/* Zones */}
            {zonesAvecConso.filter(z => z.latitude && z.longitude).map(z => {
              const isSelected = selectedZone?.id === z.id;
              const isAlert = z.statut === 'critique' || z.statut === 'surchargee';
              const color = isSelected ? '#2563eb' : getStatusColor(z.statut);
              const fillOp = isSelected ? 0.35 : 0.15;
              const radius = Math.max(120, Math.min((z.capacite_max_mw || 50) * 3, 700));

              return (
                <React.Fragment key={z.id}>
                  <Circle
                    center={[z.latitude, z.longitude]}
                    radius={radius}
                    pathOptions={{
                      color, fillColor: color,
                      fillOpacity: fillOp, weight: isSelected ? 3 : 1.5,
                    }}
                    eventHandlers={{ click: () => handleSelectZone(z) }}
                  />
                  <Circle
                    center={[z.latitude, z.longitude]}
                    radius={isSelected ? radius + 40 : 0}
                    pathOptions={{
                      color: '#2563eb', fillColor: '#2563eb',
                      fillOpacity: 0, weight: 2, dashArray: '4,4',
                    }}
                    eventHandlers={{ click: () => handleSelectZone(z) }}
                  />
                </React.Fragment>
              );
            })}

          <MapStateSaver storageKey="mapState_analyse" />
          </MapContainer>

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
            background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 12px',
            fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Légende</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
                <span>Zone normale/excédentaire</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626' }} />
                <span>Zone critique/surchargée</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: '#2563eb' }} />
                <span>Zone sélectionnée</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 20, height: 2, background: '#94a3b8', borderRadius: 1 }} />
                <span>Liaison réseau</span>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, display: 'flex', gap: 6 }}>
            {loading && (
              <div style={{ background: '#fff', padding: '8px 16px', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={14} className="spinner-sm" /> Chargement...
              </div>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Actualiser">
              <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Alertes counter */}
          {alertesActives.length > 0 && tab === 'carte' && (
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000 }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} style={{ color: '#dc2626' }} />
                <span><strong>{alertesActives.length}</strong> zone{alertesActives.length > 1 ? 's' : ''} critique{alertesActives.length > 1 ? 's' : ''}</span>
                <button onClick={() => setTab('alertes')} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                  Voir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0',
        overflowY: 'auto', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {tab === 'carte' && (
          <>
            {!selectedZone ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                <MapPin size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>Sélectionnez une zone sur la carte pour voir ses informations</p>
              </div>
            ) : (
              <ZoneDetail
                zone={selectedData}
                zonesProches={zonesProches}
                onCenter={handleCenter}
              />
            )}
          </>
        )}

        {tab === 'alertes' && (
          <AlertesPanel
            alertesActives={alertesActives}
            zonesAvecConso={zonesAvecConso}
            onSelectZone={(z) => { setSelectedZone(z); setTab('carte'); }}
          />
        )}
      </div>
    </div>
  );
}

function getStatutFromTaux(taux, seuil) {
  if (taux >= 100) return 'critique';
  if (taux >= seuil) return 'surchargee';
  if (taux < 50) return 'excedentaire';
  return 'normale';
}

function ZoneDetail({ zone, zonesProches, onCenter }) {
  if (!zone) return null;
  const isAlert = zone.statut === 'critique' || zone.statut === 'surchargee';

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={16} color="#1e3a5f" /> {zone.code}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{zone.nom} — {zone.ville}</p>
          </div>
          {getStatusBadge(zone.statut)}
        </div>
        <button onClick={onCenter} style={{
          marginTop: 8, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6,
          background: '#f8fafc', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          color: '#374151',
        }}>
          <MapPin size={13} /> Centrer sur la carte
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={12} /> Consommation
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{zone.conso?.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>MW</span></div>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={12} /> Capacité max
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{zone.capacite_max_mw} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>MW</span></div>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <BarChart3 size={12} /> Taux de charge
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: isAlert ? '#dc2626' : '#16a34a' }}>
            {zone.taux?.toFixed(1)}%
          </div>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Droplets size={12} /> Seuil alerte
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{zone.seuil_alerte_pct || 80}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
          <span>Charge</span>
          <span>{zone.taux?.toFixed(1)}%</span>
        </div>
        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: `${Math.min(zone.taux, 100)}%`,
            background: isAlert ? '#dc2626' : '#16a34a',
            transition: 'width 0.5s',
          }} />
        </div>
      </div>

      {/* Nearby zones */}
      {zonesProches.length > 0 && (
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ruler size={14} /> Zones à proximité ({zonesProches.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {zonesProches.map(z => (
              <div key={z.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: 6, background: '#f8fafc',
                border: '1px solid #f1f5f9',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{z.code}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{z.dist?.toFixed(1)} km — {z.conso?.toFixed(1)}/{z.capacite_max_mw} MW</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {getStatusBadge(z.statut)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertesPanel({ alertesActives, zonesAvecConso, onSelectZone }) {
  if (alertesActives.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
        <CheckCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <p style={{ fontSize: 14 }}>Aucune zone critique ou surchargée actuellement</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={18} color="#dc2626" />
        Zones critiques ({alertesActives.length})
      </h3>

      {alertesActives.map(z => (
        <div key={z.id} style={{
          padding: 12, marginBottom: 10, borderRadius: 8,
          background: '#fef2f2', border: '1px solid #fecaca',
          cursor: 'pointer',
        }} onClick={() => onSelectZone(z)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{z.code}</span>
              <span style={{ color: '#64748b', fontSize: 12, marginLeft: 6 }}>{z.nom}</span>
            </div>
            {getStatusBadge(z.statut)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Taux : <strong style={{ color: z.taux >= 100 ? '#dc2626' : '#d97706' }}>{z.taux?.toFixed(1)}%</strong>
            &nbsp;— Capacité : {z.capacite_max_mw} MW
            &nbsp;— Seuil : {z.seuil_alerte_pct || 80}%
          </div>
        </div>
      ))}
    </div>
  );
}



