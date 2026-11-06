import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import {
  RefreshCw, ClipboardList, CheckCircle, XCircle, Zap, AlertCircle,
  X, ArrowRight, Eye, Target, Play, Trash2
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

const STEPS = [
  { id: 'connexions', label: 'Analyse des connexions réseau', icon: '🔌' },
  { id: 'distances', label: 'Calcul des distances entre zones', icon: '📏' },
  { id: 'capacites', label: 'Vérification des capacités de ligne', icon: '⚡' },
  { id: 'chemin', label: 'Recherche du meilleur chemin', icon: '🔍' },
  { id: 'pertes', label: 'Évaluation des pertes estimées', icon: '📊' },
  { id: 'finalisation', label: 'Finalisation du plan', icon: '✅' },
];
const STEP_DELAYS = [1000, 1200, 1400, 1800, 1400, 0];

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

const lineColors = { HTB: '#7c3aed', HTA: '#2563eb', BT: '#64748b' };

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

export default function Simulations() {
  const [viewMode, setViewMode] = useState('simulation');
  const [zones, setZones] = useState([]);
  const [statuts, setStatuts] = useState([]);
  const [connexions, setConnexions] = useState([]);
  const [graphe, setGraphe] = useState(null);
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Simulation workflow
  const [selCritical, setSelCritical] = useState(null);
  const [transferEnergy, setTransferEnergy] = useState('');
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simError, setSimError] = useState('');
  const [stepStatuses, setStepStatuses] = useState([]);
  const [detailModal, setDetailModal] = useState(null);
  const [validerModal, setValiderModal] = useState(null);
  const [algorithme, setAlgorithme] = useState('dijkstra');

  const progressTimer = useRef(null);

  const charger = useCallback(async () => {
    try {
      const [z, s, c, g, sims] = await Promise.all([
        api.getZones(),
        api.getStatutZones(),
        api.getConnexions(),
        api.getGraphe(),
        api.getSimulations(),
      ]);
      setZones(z.slice(0, 8));
      setStatuts(s);
      setConnexions(c);
      setGraphe(g);
      setSimulations(sims);
    } catch (err) { console.error('Erreur chargement:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Real-time sync: poll + refresh on tab focus
  useEffect(() => {
    const interval = setInterval(charger, 15000);
    const onFocus = () => charger();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  // Merge zones + statuts
  const zonesData = useMemo(() => {
    const smap = {};
    statuts.forEach(s => { smap[s.zone_id] = s; });
    return zones.map(z => {
      const st = smap[z.id];
      return {
        ...z,
        consommation_mw: st?.consommation_mw || 0,
        taux_charge_pct: st?.taux_charge_pct || 0,
        statut: st?.statut || 'normale',
      };
    });
  }, [zones, statuts]);

  // Critical zones
  const zonesCritiques = useMemo(() =>
    zonesData.filter(z => z.statut === 'critique' || z.statut === 'surchargee'),
    [zonesData]
  );

  // Need energy to bring critical zone back to normal
  const besoinNormal = useMemo(() => {
    if (!selCritical) return 0;
    const seuil = selCritical.seuil_alerte_pct || 80;
    const consoOk = selCritical.capacite_max_mw * seuil / 100;
    return Math.max(0, selCritical.consommation_mw - consoOk);
  }, [selCritical]);

  // Potential source zones (any zone with spare capacity to help critical)
  const zonesSources = useMemo(() => {
    if (!selCritical) return [];
    return zonesData.filter(z =>
      z.id !== selCritical.id &&
      z.consommation_mw < z.capacite_max_mw
    );
  }, [zonesData, selCritical]);

  // Map noeuds: highlight selected zones
  const noeudsMap = useMemo(() => {
    const noeuds = graphe?.noeuds || [];
    if (!selCritical) return noeuds;
    const resultSrcIds = new Set();
    if (simResult?.transferts) {
      simResult.transferts.filter(t => {
        const destId = t.zone_destination?.id || t.zone_destination_id;
        return destId === selCritical.id;
      }).forEach(t => {
        resultSrcIds.add(t.zone_source?.id || t.zone_source_id);
      });
    }
    return noeuds.map(n => ({
      ...n,
      _highlight: n.id === selCritical.id ? 'destination' :
                  resultSrcIds.has(n.id) ? 'source' :
                  zonesCritiques.some(z => z.id === n.id) ? 'other-critical' : 'normal',
    }));
  }, [graphe, selCritical, zonesCritiques, simResult]);

  // Simulation result transfers for selected critical zone
  const resultTransfers = useMemo(() => {
    if (!simResult?.transferts || !selCritical) return [];
    return simResult.transferts.filter(t => {
      const destId = t.zone_destination?.id || t.zone_destination_id;
      return destId === selCritical.id;
    }).map(t => {
      const srcId = t.zone_source?.id || t.zone_source_id;
      const src = zonesData.find(z => z.id === srcId);
      const dstStat = statuts.find(s => s.zone_id === selCritical.id);
      const consoBefore = dstStat?.consommation_mw || selCritical.consommation_mw || 0;
      const consoAfter = Math.max(0, consoBefore - t.quantite_mw);
      const nouveauTaux = selCritical.capacite_max_mw > 0
        ? (consoAfter / selCritical.capacite_max_mw) * 100 : 0;
      const dist = src?.latitude && selCritical.latitude
        ? haversine(src.latitude, src.longitude, selCritical.latitude, selCritical.longitude) : 0;
      return { ...t, sourceZone: src, distance_km: dist, nouveau_taux: nouveauTaux };
    });
  }, [simResult, selCritical, zonesData, statuts]);

  // Run progress animation, returns promise that resolves when all steps shown
  const runProgress = useCallback(() => {
    return new Promise((resolve) => {
      let idx = 0;
      const initial = STEPS.map(() => 'pending');
      setStepStatuses(initial);

      const advance = () => {
        if (idx >= STEPS.length) {
          resolve();
          return;
        }
        setStepStatuses(prev => prev.map((s, i) => i === idx ? 'running' : i < idx ? 'done' : 'pending'));
        if (idx < STEPS.length - 1) {
          progressTimer.current = setTimeout(() => {
            idx++;
            advance();
          }, STEP_DELAYS[idx]);
        } else {
          // Last step: mark done and resolve after brief pause
          setTimeout(() => {
            setStepStatuses(prev => prev.map((s, i) => i <= idx ? 'done' : s));
            resolve();
          }, 600);
        }
      };
      advance();
    });
  }, []);

  const handleLancer = async () => {
    if (!selCritical) return;
    setSimRunning(true);
    setSimResult(null);
    setSimError('');
    setDetailModal(null);

    try {
      // Run full animation first, then call API
      await runProgress();

      const now = new Date();
      const result = await api.lancerSimulation({
        algorithme,
        horodatage_analyse: now.toISOString().slice(0, 16) + ':00',
        zone_critique_id: selCritical.id,
        quantite_mw: parseFloat(transferEnergy) || 0,
      });
      setStepStatuses(prev => prev.map(() => 'done'));
      setSimResult(result);
    } catch (err) {
      setStepStatuses(prev => prev.map(s => s === 'running' ? 'error' : s));
      setSimError(err.message);
    }
    setSimRunning(false);
  };

  const handleValider = async (e) => {
    e.preventDefault();
    try {
      await api.validerSimulation(validerModal.id, validerModal);
      setValiderModal(null);
      charger();
    } catch (err) { setSimError(err.message); }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await charger();
    setLoading(false);
  };

  const resetSelection = () => {
    setSelCritical(null);
    setTransferEnergy('');
    setSimResult(null);
    setSimError('');
    setStepStatuses([]);
  };

  // Show step icon
  const stepIcon = (status) => {
    if (status === 'done') return <CheckCircle size={16} color="#16a34a" />;
    if (status === 'error') return <XCircle size={16} color="#dc2626" />;
    if (status === 'running') return <RefreshCw size={16} color="#2563eb" className="spinner-sm" />;
    return <div style={{ width: 16, height: 16, border: '2px solid #e2e8f0', borderRadius: 8 }} />;
  };

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Left: Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={MADAGASCAR_CENTER}
          zoom={7}
          style={{ height: '100%', width: '100%', zIndex: 1 }}
          scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Connections */}
          {connexions.filter(c => {
            const s = zonesData.find(z => z.id === c.zone_source_id);
            const d = zonesData.find(z => z.id === c.zone_destination_id);
            return s?.latitude && s?.longitude && d?.latitude && d?.longitude;
          }).map(c => {
            const s = zonesData.find(z => z.id === c.zone_source_id);
            const d = zonesData.find(z => z.id === c.zone_destination_id);
            const isActive = resultTransfers.some(t =>
              (t.zone_source?.id === c.zone_source_id || t.zone_source_id === c.zone_source_id) &&
              (t.zone_destination?.id === c.zone_destination_id || t.zone_destination_id === c.zone_destination_id)
            );
            return (
              <Polyline key={`conn-${c.id}`}
                positions={[[s.latitude, s.longitude], [d.latitude, d.longitude]]}
                pathOptions={{
                  color: isActive ? '#f59e0b' : lineColors[c.type_ligne] || '#94a3b8',
                  weight: isActive ? 4 : 1.5, opacity: isActive ? 0.9 : 0.3,
                  dashArray: isActive ? null : '4,4',
                }}
              />
            );
          })}

          {/* Zones */}
          {noeudsMap.filter(n => n.latitude && n.longitude).map(n => {
            const isDest = n._highlight === 'destination';
            const isSrc = n._highlight === 'source';
            const isOtherCritical = n._highlight === 'other-critical';
            let color, fillOp, weight, radius;
            if (isDest) { color = '#dc2626'; fillOp = 0.35; weight = 4; }
            else if (isSrc) { color = '#16a34a'; fillOp = 0.35; weight = 4; }
            else if (isOtherCritical) { color = '#dc2626'; fillOp = 0.1; weight = 1.5; }
            else { color = '#94a3b8'; fillOp = 0.05; weight = 1; }
            radius = Math.max(120, Math.min((n.capacite_max_mw || n.capacite_mw || 50) * 3, 700));
            return (
              <React.Fragment key={n.id}>
                <Circle
                  center={[n.latitude, n.longitude]}
                  radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: fillOp, weight }}
                  eventHandlers={{ click: () => {
                    const z = zonesData.find(zz => zz.id === n.id);
                    if (z && (z.statut === 'critique' || z.statut === 'surchargee') && !simRunning) {
                      resetSelection();
                      setSelCritical(z);
                    }
                  }}}
                />
                {isDest && (
                  <Circle
                    center={[n.latitude, n.longitude]}
                    radius={radius + 50}
                    pathOptions={{
                      color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0, weight: 2, dashArray: '6,3',
                    }}
                  />
                )}
                {isSrc && (
                  <Circle
                    center={[n.latitude, n.longitude]}
                    radius={radius + 50}
                    pathOptions={{
                      color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0, weight: 2, dashArray: '6,3',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Result transfer paths */}
          {resultTransfers.map((t, i) => {
            const src = t.sourceZone || t.zone_source;
            const dstId = t.zone_destination?.id || t.zone_destination_id;
            const dst = zonesData.find(z => z.id === dstId);
            if (!src?.latitude || !src?.longitude || !dst?.latitude || !dst?.longitude) return null;
            const midLat = (src.latitude + dst.latitude) / 2;
            const midLng = (src.longitude + dst.longitude) / 2;
            return (
              <React.Fragment key={`result-${i}`}>
                <Polyline
                  positions={[[src.latitude, src.longitude], [dst.latitude, dst.longitude]]}
                  pathOptions={{ color: '#22c55e', weight: 5, opacity: 0.9 }}
                />
                <Circle
                  center={[midLat, midLng]}
                  radius={50}
                  pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8, weight: 0 }}
                />
                <Circle
                  center={[dst.latitude, dst.longitude]}
                  radius={Math.max(120, Math.min((dst.capacite_max_mw || 50) * 3, 700)) + 80}
                  pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.08, weight: 2 }}
                />
              </React.Fragment>
            );
          })}

          <MapStateSaver storageKey="mapState_simulations" />
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
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626', border: '2px solid #dc2626' }} />
              <span>Zone critique sélectionnée</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
              <span>Zone source proposée</span>
            </div>
            <div style={{ width: 20, height: 3, background: '#22c55e', borderRadius: 2, marginLeft: 0 }} />
            <span style={{ marginLeft: 26, marginTop: -14 }}>Chemin de transfert</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#94a3b8', opacity: 0.4 }} />
              <span>Autre zone</span>
            </div>
          </div>
        </div>

        {/* Step progress overlay */}
        {stepStatuses.length > 0 && simRunning && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '14px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12, minWidth: 320,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, textAlign: 'center' }}>
              <RefreshCw size={14} className="spinner-sm" style={{ marginRight: 6 }} />
              Simulation en cours...
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STEPS.map((s, i) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                  borderRadius: 6,
                  background: stepStatuses[i] === 'running' ? '#e0f2fe' :
                             stepStatuses[i] === 'done' ? '#f0fdf4' : '#f8fafc',
                  color: stepStatuses[i] === 'done' ? '#16a34a' :
                         stepStatuses[i] === 'error' ? '#dc2626' : '#64748b',
                }}>
                  {stepIcon(stepStatuses[i])}
                  <span style={{ fontWeight: stepStatuses[i] === 'running' ? 600 : 400 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sim error */}
        {simError && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px',
            color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, maxWidth: 300,
          }}>
            <AlertCircle size={14} /> {simError}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div style={{
        width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0',
        overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
          <button onClick={() => setViewMode('simulation')}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
              background: viewMode === 'simulation' ? '#1e3a5f' : 'transparent',
              color: viewMode === 'simulation' ? '#fff' : '#64748b',
              fontWeight: viewMode === 'simulation' ? 600 : 400, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            <Play size={14} /> Simulation
          </button>
          <button onClick={() => setViewMode('historique')}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
              background: viewMode === 'historique' ? '#1e3a5f' : 'transparent',
              color: viewMode === 'historique' ? '#fff' : '#64748b',
              fontWeight: viewMode === 'historique' ? 600 : 400, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            <ClipboardList size={14} /> Historique
          </button>
          <button onClick={handleRefresh} style={{
            padding: '10px', border: 'none', cursor: 'pointer', background: 'transparent',
            color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="Actualiser">
            <RefreshCw size={14} />
          </button>
        </div>

        {viewMode === 'historique' ? (
          <HistoriquePanel
            simulations={simulations}
            onSelect={(s) => setDetailModal(s)}
            onValider={(s) => setValiderModal(s)}
            onDelete={async (id) => { await api.supprimerSimulation(id); charger(); }}
          />
        ) : (
          <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
            {/* Step 1: Select critical zone */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Target size={14} color="#dc2626" /> 1. Zone critique
              </h4>
              {zonesCritiques.length === 0 ? (
                <div style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6, padding: 10, background: '#f0fdf4', borderRadius: 8 }}>
                  <CheckCircle size={14} /> Aucune zone critique — réseau équilibré
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {zonesCritiques.map(z => (
                    <div key={z.id} onClick={() => { resetSelection(); setSelCritical(z); }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        background: selCritical?.id === z.id ? '#fef2f2' : '#f8fafc',
                        border: selCritical?.id === z.id ? '1px solid #fecaca' : '1px solid transparent',
                      }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{z.code}</span>
                        <span style={{ color: '#64748b', marginLeft: 4 }}>{z.nom}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>{z.taux_charge_pct.toFixed(1)}%</span>
                        {getStatusBadge(z.statut)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Energy */}
            {selCritical && !simResult && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={14} color="#d97706" /> 2. Énergie à transférer
                </h4>

                {/* Pre-flight: no source zones available */}
                {zonesSources.length === 0 ? (
                  <div style={{
                    padding: 14, background: '#fffbeb', borderRadius: 8, fontSize: 13,
                    border: '1px solid #fde68a', color: '#92400e', marginBottom: 12,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ fontWeight: 600 }}>⚠ Aucune zone source disponible</div>
                    <div style={{ fontSize: 12 }}>
                      Aucune autre zone n'a de capacité de réserve pour alimenter <strong>{selCritical.code}</strong>.
                      Vérifiez les relevés des autres zones.
                    </div>
                    <button onClick={handleRefresh}
                      className="btn btn-sm btn-secondary" style={{ alignSelf: 'flex-start' }}>
                      <RefreshCw size={12} /> Actualiser
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#16a34a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={12} /> {zonesSources.length} zone(s) source(s) potentielle(s) disponible(s)
                  </div>
                )}

                <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    <span>Besoin estimé pour normaliser <strong>{selCritical.code}</strong> :</span>
                    <strong style={{ color: '#dc2626', fontSize: 16, marginLeft: 6 }}>{besoinNormal.toFixed(1)} MW</strong>
                  </div>
                  <input type="range" min="0" max={Math.max(besoinNormal, 1).toFixed(1)} step="0.5"
                    value={Math.min(parseFloat(transferEnergy) || 0, Math.max(besoinNormal, 1))}
                    onChange={e => setTransferEnergy(e.target.value)}
                    style={{ width: '100%', margin: '8px 0' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="form-control" type="number" step="0.5" min="0"
                      max={Math.max(besoinNormal, 1).toFixed(1)}
                      value={transferEnergy}
                      onChange={e => setTransferEnergy(e.target.value)}
                      style={{ width: 100, fontSize: 14, fontWeight: 700, textAlign: 'center' }}
                    />
                    <span style={{ fontWeight: 600 }}>MW</span>
                    {parseFloat(transferEnergy) >= besoinNormal * 0.95 && (
                      <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500, marginLeft: 'auto' }}>
                        ✅ Zone normale
                      </span>
                    )}
                  </div>
                </div>

                {/* Algorithm selector */}
                <div style={{ marginBottom: 12, marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                    Algorithme
                  </label>
                  <select className="form-control" value={algorithme}
                    onChange={e => setAlgorithme(e.target.value)}>
                    <option value="dijkstra">Dijkstra — Précise (moins de pertes)</option>
                    <option value="greedy">Glouton — Rapide (priorise les zones urgentes)</option>
                    <option value="bellman_ford">Bellman-Ford — Chemins alternatifs</option>
                  </select>
                </div>

                {/* Launch */}
                <button onClick={handleLancer}
                  disabled={simRunning || !transferEnergy || parseFloat(transferEnergy) <= 0 || zonesSources.length === 0}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: 14, marginTop: 12 }}>
                  {simRunning ? (
                    <><RefreshCw size={16} className="spinner-sm" /> Calcul en cours...</>
                  ) : (
                    <><Play size={16} /> Lancer la simulation ({transferEnergy || 0} MW)</>
                  )}
                </button>
              </div>
            )}

            {/* Results */}
            {simResult && !simRunning && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <CheckCircle size={18} color="#16a34a" />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Solution proposée</span>
                </div>

                {resultTransfers.length === 0 ? (
                  <div style={{ padding: 16, background: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#92400e', textAlign: 'center', border: '1px solid #fde68a' }}>
                    <AlertCircle size={24} style={{ marginBottom: 6 }} />
                    <p style={{ fontWeight: 600 }}>Aucun transfert possible</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                      {zonesSources.length === 0
                        ? 'Aucune zone avec capacité de réserve. Saisissez d\'abord des relevés.'
                        : 'L\'algorithme n\'a pas trouvé de chemin optimal. Vérifiez les connexions réseau et les capacités de ligne.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {resultTransfers.map((t, i) => {
                      const src = t.sourceZone;
                      const dist = t.distance_km;
                      return (
                        <div key={i} style={{
                          background: '#f0fdf4', borderRadius: 10, padding: 14,
                          border: '1px solid #bbf7d0',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ArrowRight size={14} color="#16a34a" />
                            {src?.code || t.zone_source?.code} → {selCritical?.code}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: '#fff', borderRadius: 6, padding: 8 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Source</div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{src?.nom || '—'}</div>
                            </div>
                            <div style={{ background: '#fff', borderRadius: 6, padding: 8 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Énergie transférée</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{t.quantite_mw} MW</div>
                            </div>
                            <div style={{ background: '#fff', borderRadius: 6, padding: 8 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Distance estimée</div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{dist.toFixed(1)} km</div>
                            </div>
                            <div style={{ background: '#fff', borderRadius: 6, padding: 8 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Pertes estimées</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>{t.pertes_estimees_mw?.toFixed(3) || 0} MW</div>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, background: '#fff', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 10, color: '#64748b' }}>Taux de charge après transfert</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: t.nouveau_taux < (selCritical?.seuil_alerte_pct || 80) ? '#16a34a' : '#d97706' }}>
                              {t.nouveau_taux.toFixed(1)}%
                            </div>
                          </div>
                          <button onClick={() => setDetailModal(simResult)}
                            style={{
                              marginTop: 10, width: '100%', padding: '8px', border: '1px solid #bbf7d0',
                              borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12,
                              color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                            <Eye size={14} /> Voir les détails complets
                          </button>
                        </div>
                      );
                    })}

                    {/* Validate / Reject buttons */}
                    {simResult?.id && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => setValiderModal({ id: simResult.id, decision: 'approuvee', commentaire: '' })}
                          className="btn btn-primary" style={{ flex: 1 }}>
                          <CheckCircle size={14} /> Approuver
                        </button>
                        <button onClick={() => setValiderModal({ id: simResult.id, decision: 'rejetee', commentaire: '' })}
                          className="btn btn-secondary" style={{ flex: 1 }}>
                          <XCircle size={14} /> Rejeter
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reset */}
            {simResult && !simRunning && (
              <button onClick={resetSelection} style={{
                marginTop: 12, width: '100%', padding: '8px', border: '1px solid #e2e8f0',
                borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 12,
                color: '#64748b',
              }}>
                Nouvelle simulation
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={18} /> Détails complets de la simulation
              </span>
              <button className="modal-close" onClick={() => setDetailModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {detailModal.transferts?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {detailModal.transferts.map((t, i) => {
                    const src = zonesData.find(z => z.id === (t.zone_source?.id || t.zone_source_id));
                    const dst = zonesData.find(z => z.id === (t.zone_destination?.id || t.zone_destination_id));
                    const dist = src?.latitude && dst?.latitude
                      ? haversine(src.latitude, src.longitude, dst.latitude, dst.longitude) : 0;
                    return (
                      <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
                        <h5 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
                          Transfert {i + 1} : {src?.code || t.source} → {dst?.code || t.destination}
                        </h5>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                          <div><span style={{ color: '#64748b' }}>Zone source :</span> <strong>{src?.nom || t.source}</strong></div>
                          <div><span style={{ color: '#64748b' }}>Zone destination :</span> <strong>{dst?.nom || t.destination}</strong></div>
                          <div><span style={{ color: '#64748b' }}>Quantité :</span> <strong>{t.quantite_mw} MW</strong></div>
                          <div><span style={{ color: '#64748b' }}>Pertes :</span> <strong>{(t.pertes_estimees_mw || 0).toFixed(3)} MW</strong></div>
                          <div><span style={{ color: '#64748b' }}>Distance :</span> <strong>{dist.toFixed(1)} km</strong></div>
                          <div><span style={{ color: '#64748b' }}>Coût chemin :</span> <strong>{t.cout_chemin || '—'}</strong></div>
                        </div>
                        {t.chemin_json && (
                          <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Chemin emprunté :</div>
                            <div>{t.chemin_json.join(' → ')}</div>
                          </div>
                        )}
                        {t.nouveau_taux != null && (
                          <div style={{ marginTop: 8, padding: 8, background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
                            Taux de charge après transfert : <strong style={{ color: '#16a34a' }}>{t.nouveau_taux.toFixed(1)}%</strong>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{
                    background: '#f0fdf4', borderRadius: 8, padding: 12, border: '1px solid #bbf7d0',
                    display: 'flex', justifyContent: 'space-between', fontSize: 13,
                  }}>
                    <span>Total énergie redistribuée</span>
                    <strong>{detailModal.transferts.reduce((s, t) => s + (t.quantite_mw || 0), 0).toFixed(1)} MW</strong>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#64748b', textAlign: 'center' }}>Aucun transfert proposé</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetailModal(null)}>Fermer</button>
              {(detailModal.statut === 'complete') && (
                <button className="btn btn-primary" onClick={() => { setValiderModal({ id: detailModal.id, decision: 'approuvee', commentaire: '' }); setDetailModal(null); }}>
                  <CheckCircle size={14} /> Valider / Rejeter
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Validate modal */}
      {validerModal && (
        <div className="modal-overlay" onClick={() => setValiderModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={18} /> Valider ou rejeter
              </span>
              <button className="modal-close" onClick={() => setValiderModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleValider}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {simError && <div className="alert alert-danger"><AlertCircle size={14} /> {simError}</div>}
                <div>
                  <label>Décision *</label>
                  <select className="form-control" value={validerModal.decision || 'approuvee'}
                    onChange={e => setValiderModal({ ...validerModal, decision: e.target.value })}>
                    <option value="approuvee">Approuver — Appliquer le plan</option>
                    <option value="rejetee">Rejeter — Refuser le plan</option>
                  </select>
                </div>
                <div>
                  <label>Commentaire</label>
                  <textarea className="form-control" rows={3}
                    value={validerModal.commentaire || ''}
                    onChange={e => setValiderModal({ ...validerModal, commentaire: e.target.value })}
                    placeholder="Observations sur cette simulation..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setValiderModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={15} /> Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoriquePanel({ simulations, onSelect, onValider, onDelete }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      {simulations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <Zap size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p>Aucune simulation pour le moment</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Statut</th><th>Algorithme</th><th>Transferts</th><th>Énergie</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {simulations.map(s => (
              <tr key={s.id}>
                <td style={{ fontSize: 13 }}>{new Date(s.horodatage_analyse || s.date_creation).toLocaleString('fr-FR')}</td>
                <td><span className={`badge badge-${s.statut === 'validee' ? 'success' : s.statut === 'rejetee' ? 'critical' : s.statut === 'en_cours' ? 'info' : 'warning'}`}>{s.statut}</span></td>
                <td style={{ fontSize: 13 }}>{s.algorithme}</td>
                <td style={{ fontSize: 13 }}>{s.transferts?.length || 0}</td>
                <td style={{ fontSize: 13, fontWeight: 600 }}>{s.transferts?.reduce((sum, t) => sum + (t.quantite_mw || 0), 0).toFixed(1)} MW</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => onSelect(s)} title="Détails"><Eye size={12} /></button>
                    {(s.statut === 'complete') && (
                      <button className="btn btn-sm btn-primary" onClick={() => onValider({ id: s.id, decision: 'approuvee', commentaire: '' })} title="Valider/Rejeter"><CheckCircle size={12} /></button>
                    )}
                    <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); if (window.confirm('Supprimer cette simulation ?')) onDelete(s.id).catch(err => alert(err.message)); }} title="Supprimer" style={{ color: '#dc2626' }}><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
