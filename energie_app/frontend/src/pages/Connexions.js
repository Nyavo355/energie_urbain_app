import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import {
  Plus, RefreshCw, Trash2, Ruler, Save, X, Zap,
  CheckCircle, XCircle, ArrowLeftRight, ArrowRight, Info
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MADAGASCAR_CENTER = [-18.7669, 46.8691];
const MIN_DIST_KM = 1;
const MAX_DIST_KM = 10;

const lineColors = { HTB: '#7c3aed', HTA: '#2563eb', BT: '#64748b' };
const statusColors = { normale: '#16a34a', surchargee: '#dc2626', critique: '#dc2626', excedentaire: '#16a34a' };

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

function ArrowIcon({ color = '#2563eb' }) {
  return L.divIcon({
    html: `<div style="font-size:18px;color:${color};transform:rotate(0deg);">▶</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    className: '',
  });
}

function MidArrow({ from, to, color = '#94a3b8' }) {
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const angle = Math.atan2(to[0] - from[0], to[1] - from[1]) * (180 / Math.PI);
  const icon = L.divIcon({
    html: `<div style="font-size:16px;color:${color};transform:rotate(${angle}deg);line-height:1;">▶</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    className: '',
  });
  return <Marker position={[midLat, midLng]} icon={icon} />;
}

function getTypeForDistance(dist) {
  if (dist > 5) return 'HTB';
  if (dist > 2) return 'HTA';
  return 'BT';
}

export default function Connexions() {
  const [connexions, setConnexions] = useState([]);
  const [zones, setZones] = useState([]);
  const [creating, setCreating] = useState(null);
  const [manual, setManual] = useState(null);
  const [form, setForm] = useState({ capacite_transit_mw: '', pertes_pct: '0', type_ligne: 'HTA', bidirectionnelle: true });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const LIMIT_ZONES = 8;
  const charger = async () => {
    try {
      const [c, z] = await Promise.all([api.getConnexions(), api.getZones()]);
      setConnexions(c); setZones(z.slice(0, LIMIT_ZONES));
    } catch (err) { console.error('Erreur chargement connexions:', err); }
  };
  useEffect(() => { charger(); }, []);

  // Real-time sync: poll + refresh on tab focus
  useEffect(() => {
    const interval = setInterval(charger, 15000);
    const onFocus = () => charger();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  const zonesGeo = useMemo(() => zones.filter(z => z.latitude && z.longitude), [zones]);

  const connexionsExistantes = useMemo(() => {
    const set = new Set();
    connexions.forEach(c => {
      set.add(`${Math.min(c.zone_source_id, c.zone_destination_id)}-${Math.max(c.zone_source_id, c.zone_destination_id)}`);
    });
    return set;
  }, [connexions]);

  const liaisonsPossibles = useMemo(() => {
    const result = [];
    for (let i = 0; i < zonesGeo.length; i++) {
      for (let j = i + 1; j < zonesGeo.length; j++) {
        const a = zonesGeo[i];
        const b = zonesGeo[j];
        const dist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
        if (dist >= MIN_DIST_KM && dist <= MAX_DIST_KM) {
          const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
          const exists = connexionsExistantes.has(key);
          const typeSuggere = getTypeForDistance(dist);
          const capSuggeree = Math.round(Math.min(a.capacite_max_mw, b.capacite_max_mw) * 0.4 * 10) / 10;
          result.push({
            source: a, dest: b,
            distance_km: Math.round(dist * 1000) / 1000,
            type_suggere: typeSuggere,
            capacite_suggeree: capSuggeree,
            exists,
            key,
          });
        }
      }
    }
    return result;
  }, [zonesGeo, connexionsExistantes]);

  // Validation helpers
  const checkDistance = (d) => d >= MIN_DIST_KM && d <= MAX_DIST_KM;
  const checkCapacity = (capa, srcCap, dstCap) => {
    const maxCap = Math.min(srcCap, dstCap);
    return capa && parseFloat(capa) > 0 && parseFloat(capa) <= maxCap;
  };

  const openManual = () => {
    if (zonesGeo.length < 2) { setError('Il faut au moins 2 zones avec coordonnées'); return; }
    setManual({ sourceId: zonesGeo[0].id, destId: zonesGeo[1].id });
    setForm({ capacite_transit_mw: '', pertes_pct: '0.5', type_ligne: 'HTA', bidirectionnelle: true });
    setCreating(null);
    setError(''); setSuccess('');
  };

  const handleCreateClick = (liaison) => {
    setManual(null);
    const typeL = getTypeForDistance(liaison.distance_km);
    setCreating(liaison);
    setForm({
      capacite_transit_mw: liaison.capacite_suggeree,
      pertes_pct: Math.round(liaison.distance_km * 0.3 * 10) / 10,
      type_ligne: typeL,
      bidirectionnelle: true,
    });
    setError(''); setSuccess('');
  };

  const validateForm = (src, dst) => {
    const dist = manual
      ? haversine(src.latitude, src.longitude, dst.latitude, dst.longitude)
      : creating.distance_km;
    if (!checkDistance(dist)) {
      return `Distance ${dist.toFixed(1)} km hors limite (${MIN_DIST_KM}-${MAX_DIST_KM} km). Impossible de connecter ces zones.`;
    }
    if (!form.capacite_transit_mw || parseFloat(form.capacite_transit_mw) <= 0) {
      return 'La capacité de transit doit être supérieure à 0 MW.';
    }
    const minCap = Math.min(src.capacite_max_mw, dst.capacite_max_mw);
    if (parseFloat(form.capacite_transit_mw) > minCap) {
      return `Capacité ${form.capacite_transit_mw} MW dépasse le max des deux zones (${minCap} MW). Réduisez la capacité.`;
    }
    return null;
  };

  const handleSave = async () => {
    if (!creating && !manual) return;
    setSaving(true); setError('');

    let src, dst;
    if (manual) {
      src = zones.find(z => z.id === manual.sourceId);
      dst = zones.find(z => z.id === manual.destId);
    } else {
      src = creating.source;
      dst = creating.dest;
    }
    const errMsg = validateForm(src, dst);
    if (errMsg) { setError(errMsg); setSaving(false); return; }

    const dist = manual
      ? haversine(src.latitude, src.longitude, dst.latitude, dst.longitude)
      : creating.distance_km;

    try {
      await api.creerConnexion({
        zone_source_id: src.id,
        zone_destination_id: dst.id,
        ...form,
        distance_km: Math.round(dist * 1000) / 1000,
      });
      setSuccess('Connexion créée avec succès');
      setTimeout(() => { setCreating(null); setManual(null); charger(); }, 1200);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette connexion ?')) return;
    await api.supprimerConnexion(id);
    charger();
  };

  const isCreating = creating || manual;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={MADAGASCAR_CENTER} zoom={7}
          style={{ height: '100%', width: '100%', zIndex: 1 }}
          scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Zones (drawn first so connections are on top) */}
          {zonesGeo.map(z => {
            const color = statusColors[z.statut] || '#64748b';
            const isCritique = z.statut === 'critique' || z.statut === 'surchargee';
            const radius = Math.max(100, Math.min((z.capacite_max_mw || 50) * 3, 700));
            const isSrc = creating?.source?.id === z.id || manual?.sourceId === z.id;
            const isDst = creating?.dest?.id === z.id || manual?.destId === z.id;
            return (
              <React.Fragment key={z.id}>
                <Circle
                  center={[z.latitude, z.longitude]}
                  radius={z.rayon_km ? z.rayon_km * 1000 : radius}
                  pathOptions={{
                    color: isSrc ? '#2563eb' : isDst ? '#16a34a' : color,
                    fillColor: isSrc ? '#2563eb' : isDst ? '#16a34a' : color,
                    fillOpacity: isSrc || isDst ? 0.25 : 0.1,
                    weight: isSrc || isDst ? 3 : 1.5,
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Existing connections — solid lines (on top of zones) */}
          {connexions.map(c => {
            const src = zones.find(z => z.id === c.zone_source_id);
            const dst = zones.find(z => z.id === c.zone_destination_id);
            if (!src?.latitude || !src?.longitude || !dst?.latitude || !dst?.longitude) return null;
            const color = lineColors[c.type_ligne] || '#64748b';
            return (
              <React.Fragment key={`existing-${c.id}`}>
                <Polyline
                  positions={[[src.latitude, src.longitude], [dst.latitude, dst.longitude]]}
                  pathOptions={{ color, weight: 3, opacity: 0.8 }}
                />
                <MidArrow from={[src.latitude, src.longitude]} to={[dst.latitude, dst.longitude]} color={color} />
                {c.bidirectionnelle && (
                  <MidArrow from={[dst.latitude, dst.longitude]} to={[src.latitude, src.longitude]} color={color} />
                )}
              </React.Fragment>
            );
          })}

          {/* Possible connections — clickable dashed lines (on top of everything) */}
          {liaisonsPossibles.filter(l => !l.exists).map(l => {
            const isSelected = creating?.key === l.key;
            const color = isSelected ? '#2563eb' : '#94a3b8';
            return (
              <React.Fragment key={`possible-${l.key}`}>
                {/* Invisible wide click surface (weight 12) */}
                <Polyline
                  positions={[[l.source.latitude, l.source.longitude], [l.dest.latitude, l.dest.longitude]]}
                  pathOptions={{ color: 'transparent', weight: 12, opacity: 0 }}
                  eventHandlers={{ click: () => handleCreateClick(l) }}
                />
                {/* Visible dashed line */}
                <Polyline
                  positions={[[l.source.latitude, l.source.longitude], [l.dest.latitude, l.dest.longitude]]}
                  pathOptions={{
                    color, weight: isSelected ? 4 : 2.5, opacity: isSelected ? 0.9 : 0.5,
                    dashArray: isSelected ? '8,4' : '6,5',
                  }}
                />
              </React.Fragment>
            );
          })}
          <MapStateSaver storageKey="mapState_connexions" />
        </MapContainer>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '10px 14px',
          fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Légende</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, background: '#94a3b8', borderRadius: 2 }} />
              <span>Liaison possible</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, background: '#2563eb', borderRadius: 2 }} />
              <span>En cours de création</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, background: '#7c3aed', borderRadius: 2 }} />
              <span>HTB existante</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, background: '#2563eb', borderRadius: 2 }} />
              <span>HTA existante</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, background: '#64748b', borderRadius: 2 }} />
              <span>BT existante</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 14px',
          fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <div><strong>{connexions.length}</strong> liaison{connexions.length > 1 ? 's' : ''} existante{connexions.length > 1 ? 's' : ''}</div>
          <div style={{ color: '#64748b' }}><strong>{liaisonsPossibles.filter(l => !l.exists).length}</strong> liaison{liaisonsPossibles.filter(l => !l.exists).length > 1 ? 's' : ''} possible{liaisonsPossibles.filter(l => !l.exists).length > 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0',
        overflowY: 'auto', flexShrink: 0,
      }}>
        {isCreating ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={16} /> Nouvelle liaison
              </h3>
              <button onClick={() => { setCreating(null); setManual(null); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>

            {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}><XCircle size={14} /> {error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}><CheckCircle size={14} /> {success}</div>}

            {/* Connection preview */}
            {(() => {
              const src = creating ? creating.source : zones.find(z => z.id === manual?.sourceId);
              const dst = creating ? creating.dest : zones.find(z => z.id === manual?.destId);
              if (!src || !dst) return null;

              // Live validation
              const distVal = manual
                ? haversine(src.latitude, src.longitude, dst.latitude, dst.longitude)
                : creating.distance_km;
              const distOk = checkDistance(distVal);
              const capaOk = checkCapacity(form.capacite_transit_mw, src.capacite_max_mw, dst.capacite_max_mw);
              const allOk = distOk && capaOk;

              return <>
                {/* Zone info */}
                <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, color: '#2563eb' }}>{src.code}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{src.nom}</div>
                    </div>
                    <ArrowLeftRight size={20} style={{ color: '#94a3b8' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, color: '#16a34a' }}>{dst.code}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{dst.nom}</div>
                    </div>
                  </div>
                </div>

                {/* Manual mode: zone selectors */}
                {manual && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Zone source</label>
                      <select className="form-control" value={manual.sourceId}
                        onChange={e => setManual({ ...manual, sourceId: parseInt(e.target.value) })}>
                        {zonesGeo.map(z => <option key={z.id} value={z.id}>{z.code} — {z.nom}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Zone destination</label>
                      <select className="form-control" value={manual.destId}
                        onChange={e => setManual({ ...manual, destId: parseInt(e.target.value) })}>
                        {zonesGeo.filter(z => z.id !== manual.sourceId).map(z =>
                          <option key={z.id} value={z.id}>{z.code} — {z.nom}</option>
                        )}
                      </select>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: 6, borderRadius: 4 }}>
                      Distance : <strong>{distVal.toFixed(2)} km</strong>
                    </div>
                  </div>
                )}

                {/* Distance rule */}
                <div style={{
                  background: distOk ? '#f0fdf4' : '#fef2f2', borderRadius: 6, padding: '8px 10px',
                  marginBottom: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between',
                  border: `1px solid ${distOk ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  <span>Distance <strong>{distVal.toFixed(2)} km</strong></span>
                  <span style={{ color: distOk ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {distOk ? '✓ Valide (1-10 km)' : `✗ ${distVal < MIN_DIST_KM ? 'Trop court' : 'Trop long'} (1-10 km)`}
                  </span>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                      Capacité de transit (MW) *
                    </label>
                    <input className="form-control" type="number" step="0.1" min="0.1" required
                      value={form.capacite_transit_mw}
                      onChange={e => setForm({ ...form, capacite_transit_mw: e.target.value })} />
                    <div style={{ fontSize: 11, color: capaOk ? '#16a34a' : '#d97706', marginTop: 2 }}>
                      {capaOk
                        ? `✓ ≤ ${Math.min(src.capacite_max_mw, dst.capacite_max_mw)} MW (max des deux zones)`
                        : `Max autorisé : ${Math.min(src.capacite_max_mw, dst.capacite_max_mw)} MW`}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Pertes (%)</label>
                    <input className="form-control" type="number" step="0.1" min="0" max="100"
                      value={form.pertes_pct}
                      onChange={e => setForm({ ...form, pertes_pct: e.target.value })} />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Estimation : ~{distVal.toFixed(1)} km × 0.3% = {(distVal * 0.3).toFixed(1)}%
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Type de ligne</label>
                    <select className="form-control" value={form.type_ligne}
                      onChange={e => setForm({ ...form, type_ligne: e.target.value })}>
                      <option value="HTB">HTB — Haute Tension B ({'>'}5 km)</option>
                      <option value="HTA">HTA — Haute Tension A (2-5 km)</option>
                      <option value="BT">BT — Basse Tension ({'<'}2 km)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.bidirectionnelle}
                        onChange={e => setForm({ ...form, bidirectionnelle: e.target.checked })} />
                      Bidirectionnelle
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button className="btn btn-secondary" onClick={() => { setCreating(null); setManual(null); }} style={{ flex: 1 }}>
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={handleSave}
                    disabled={saving || !allOk} style={{ flex: 1 }}>
                    {saving ? <><RefreshCw size={15} className="spinner-sm" /> Enregistrement...</>
                      : <><Save size={15} /> Créer la liaison</>}
                  </button>
                </div>
              </>;
            })()}
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={16} color="#1e3a5f" /> Connexions existantes
            </h3>

            {connexions.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                <Info size={30} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>Aucune connexion</p>
                <p style={{ fontSize: 12 }}>Cliquez sur un trait pointillé sur la carte ou créez manuellement</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {connexions.map(c => {
                  const src = zones.find(z => z.id === c.zone_source_id);
                  const dst = zones.find(z => z.id === c.zone_destination_id);
                  return (
                    <div key={c.id} style={{
                      padding: 10, borderRadius: 8, background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {src?.code || '?'} <ArrowRight size={12} style={{ color: '#94a3b8' }} /> {dst?.code || '?'}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {c.type_ligne} · {c.distance_km || '-'} km · {c.capacite_transit_mw} MW
                          </div>
                        </div>
                        <button onClick={() => handleDelete(c.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Possible liaisons list */}
            {liaisonsPossibles.filter(l => !l.exists).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: '#64748b' }}>
                  Liaisons possibles ({liaisonsPossibles.filter(l => !l.exists).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {liaisonsPossibles.filter(l => !l.exists).slice(0, 5).map(l => (
                    <div key={l.key} onClick={() => handleCreateClick(l)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                      <span>{l.source.code} → {l.dest.code}</span>
                      <span style={{ color: '#94a3b8' }}>{l.distance_km} km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={openManual} style={{ flex: 1 }}>
                <Plus size={12} /> Créer manuellement
              </button>
              <button className="btn btn-secondary btn-sm" onClick={charger} style={{ flex: 1 }}>
                <RefreshCw size={12} /> Actualiser
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
