import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import {
  MapPin, Plus, Trash2, Save, X, CheckCircle, XCircle, RefreshCw, Info, Ruler, Edit3
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MADAGASCAR_CENTER = [-18.7669, 46.8691];
const DEFAULT_RADIUS_KM = 3;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 10;

const statusColors = { normale: '#16a34a', surchargee: '#dc2626', critique: '#dc2626', excedentaire: '#16a34a' };

function FitBounds({ items }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    const withCoords = items.filter(i => i.latitude && i.longitude);
    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map(i => [i.latitude, i.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
      done.current = true;
    }
  }, [items, map]);
  return null;
}

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      if (onMapClick) onMapClick(e.latlng);
    },
  });
  return null;
}

export default function Zones() {
  const [zones, setZones] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newPos, setNewPos] = useState(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [form, setForm] = useState({ nom: '', type: 'HTA', ville: '', capacite_max_mw: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [allZones, setAllZones] = useState([]);
  const [editZone, setEditZone] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const LIMIT_ZONES = 8;
  const charger = async () => {
    try {
      const z = await api.getZones();
      setAllZones(z);
      setZones(z.slice(0, LIMIT_ZONES));
    } catch (err) { console.error('Erreur chargement zones:', err); }
  };
  useEffect(() => { charger(); }, []);

  const handleMapClick = (latlng) => {
    if (!creating) return;
    setNewPos(latlng);
    setError('');
    setSuccess('');
  };

  const startCreating = async () => {
    setCreating(true);
    setNewPos(null);
    setForm({ nom: '', type: 'HTA', ville: '', capacite_max_mw: '', description: '' });
    setRadiusKm(DEFAULT_RADIUS_KM);
    setError('');
    setSuccess('');
    try {
      const all = await api.request('GET', '/zones');
      setAllZones(all);
    } catch (_) {}
  };

  const cancelCreating = () => {
    setCreating(false);
    setNewPos(null);
  };

  const genererCode = () => {
    const maxNum = (allZones.length ? allZones : zones).reduce((max, z) => {
      const m = parseInt(z.code?.replace('ZN', ''), 10);
      return m > max ? m : max;
    }, 0);
    return `ZN${String(maxNum + 1).padStart(3, '0')}`;
  };

  const handleSave = async () => {
    if (!newPos) { setError('Placez la zone sur la carte'); return; }
    if (!form.nom || !form.ville || !form.capacite_max_mw) { setError('Remplissez tous les champs obligatoires'); return; }
    setSaving(true); setError('');
    try {
      const surface_km2 = Math.PI * radiusKm * radiusKm;
      await api.creerZone({
        ...form,
        code: genererCode(),
        capacite_max_mw: parseFloat(form.capacite_max_mw),
        latitude: newPos.lat,
        longitude: newPos.lng,
        rayon_km: radiusKm,
        surface_km2: Math.round(surface_km2 * 100) / 100,
        statut: 'normale',
        seuil_alerte_pct: 80,
        description: form.description || `Zone ${form.nom} — ${form.ville} (${radiusKm} km de rayon)`,
      });
      setSuccess('Zone enregistrée avec succès');
      setTimeout(() => { cancelCreating(); charger(); }, 1200);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette zone ?')) return;
    try { await api.supprimerZone(id); charger(); } catch (err) { console.error(err); }
  };

  const surface = newPos ? Math.round(Math.PI * radiusKm * radiusKm * 100) / 100 : 0;

  const openEdit = (z) => {
    setEditZone(z);
    setEditForm({
      nom: z.nom || '',
      capacite_max_mw: z.capacite_max_mw || '',
      seuil_alerte_pct: z.seuil_alerte_pct || 80,
      description: z.description || '',
    });
  };

  const handleEditSave = async () => {
    if (!editZone) return;
    setEditSaving(true);
    try {
      await api.modifierZone(editZone.id, {
        nom: editForm.nom,
        capacite_max_mw: parseFloat(editForm.capacite_max_mw),
        seuil_alerte_pct: parseFloat(editForm.seuil_alerte_pct),
        description: editForm.description,
      });
      setEditZone(null);
      charger();
    } catch (err) { console.error(err); }
    setEditSaving(false);
  };

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
          <FitBounds items={zones} />

          {/* Click handler in creation mode */}
          {creating && <ClickHandler onMapClick={handleMapClick} />}

          {/* Existing zones */}
          {!creating && zones.filter(z => z.latitude && z.longitude).map(z => {
            const color = statusColors[z.statut] || '#64748b';
            const isCritique = z.statut === 'critique' || z.statut === 'surchargee';
            const radius = Math.max(100, Math.min((z.capacite_max_mw || 50) * 3, 800));
            return (
              <React.Fragment key={z.id}>
                <Circle
                  center={[z.latitude, z.longitude]}
                  radius={z.rayon_km ? z.rayon_km * 1000 : radius}
                  pathOptions={{
                    color, fillColor: color,
                    fillOpacity: 0.12, weight: 2,
                  }}
                />
                <Marker position={[z.latitude, z.longitude]}>
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <strong style={{ fontSize: 14 }}>{z.code}</strong> — {z.nom}<br />
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {z.ville} · {z.type_ligne || z.type}<br />
                        Cap. {z.capacite_max_mw} MW · {z.surface_km2 || '-'} km²<br />
                        Statut : <span style={{ color: isCritique ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{z.statut}</span>
                      </span>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

          {/* New zone preview */}
          {newPos && (
            <>
              <Circle
                center={[newPos.lat, newPos.lng]}
                radius={radiusKm * 1000}
                pathOptions={{
                  color: '#2563eb', fillColor: '#2563eb',
                  fillOpacity: 0.1, weight: 2.5, dashArray: '6,4',
                }}
              />
              <Circle
                center={[newPos.lat, newPos.lng]}
                radius={6}
                pathOptions={{
                  color: '#2563eb', fillColor: '#ffffff',
                  fillOpacity: 1, weight: 3,
                }}
              />
            </>
          )}
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
              <span>Zone normale</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626' }} />
              <span>Zone critique/surchargée</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#2563eb', opacity: 0.6 }} />
              <span>Nouvelle zone (création)</span>
            </div>
          </div>
        </div>

        {/* Mode indicator */}
        {creating && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: '#1e293b', color: '#fff', padding: '8px 20px',
            borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <MapPin size={16} />
            <span>{newPos ? 'Ajustez le rayon et remplissez les informations' : 'Cliquez sur la carte pour placer la zone'}</span>
            <button onClick={cancelCreating}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
              Annuler
            </button>
          </div>
        )}

        {/* Creating button */}
        {!creating && (
          <button onClick={startCreating}
            style={{
              position: 'absolute', bottom: 20, right: 20, zIndex: 1000,
              background: '#1e3a5f', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 18px', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}>
            <Plus size={16} /> Ajouter une zone
          </button>
        )}
      </div>

      {/* Right panel */}
      <div style={{
        width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0',
        overflowY: 'auto', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {creating && newPos ? (
          <div style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="#2563eb" /> Nouvelle zone
            </h3>

            {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}><XCircle size={14} /> {error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}><CheckCircle size={14} /> {success}</div>}

            {/* Position */}
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>
              <Info size={14} /> Position : {newPos.lat.toFixed(4)}, {newPos.lng.toFixed(4)}
            </div>

            {/* Radius slider */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                <Ruler size={12} /> Rayon de la zone : <strong>{radiusKm} km</strong>
              </label>
              <input type="range" min={MIN_RADIUS_KM} max={MAX_RADIUS_KM} step={0.5}
                value={radiusKm}
                onChange={e => setRadiusKm(parseFloat(e.target.value))}
                style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                <span>{MIN_RADIUS_KM} km</span>
                <span>{MAX_RADIUS_KM} km</span>
              </div>
            </div>

            {/* Surface */}
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>
              Surface estimée : <strong>{surface} km²</strong>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Nom *</label>
                <input className="form-control" type="text" required placeholder="ex: Zone Industrielle Est"
                  value={form.nom}
                  onChange={e => setForm({ ...form, nom: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Type de ligne</label>
                <select className="form-control" value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="HTB">HTB — Haute Tension B (grande distance)</option>
                  <option value="HTA">HTA — Haute Tension A (moyenne distance)</option>
                  <option value="BT">BT — Basse Tension (courte distance)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Ville *</label>
                <input className="form-control" type="text" required placeholder="ex: Antananarivo"
                  value={form.ville}
                  onChange={e => setForm({ ...form, ville: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Capacité max (MW) *</label>
                <input className="form-control" type="number" step="0.1" min="1" required
                  value={form.capacite_max_mw}
                  onChange={e => setForm({ ...form, capacite_max_mw: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Description</label>
                <textarea className="form-control" rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Informations complémentaires..." />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={cancelCreating} style={{ flex: 1 }}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? <><RefreshCw size={15} className="spinner-sm" /> Enregistrement...</>
                  : <><Save size={15} /> Enregistrer la zone</>}
              </button>
            </div>
          </div>
        ) : creating && !newPos ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
            <MapPin size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ fontSize: 14 }}>Cliquez sur la carte pour placer la nouvelle zone</p>
            <button className="btn btn-secondary" onClick={cancelCreating} style={{ marginTop: 12 }}>
              <X size={14} /> Annuler
            </button>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="#1e3a5f" /> Zones ({zones.length})
            </h3>

            {zones.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                <p>Aucune zone — Cliquez sur "Ajouter une zone"</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zones.map(z => {
                  const isCritique = z.statut === 'critique' || z.statut === 'surchargee';
                  return (
                    <div key={z.id} style={{
                      padding: 10, borderRadius: 8,
                      background: isCritique ? '#fef2f2' : '#f8fafc',
                      border: `1px solid ${isCritique ? '#fecaca' : '#f1f5f9'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: 5, display: 'inline-block',
                              background: isCritique ? '#dc2626' : '#16a34a',
                            }} />
                            {z.code} — {z.nom}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {z.ville} · {z.capacite_max_mw} MW · {z.surface_km2 ? `${z.surface_km2} km²` : '-'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(z)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => handleDelete(z.id)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="btn btn-secondary btn-sm" onClick={charger} style={{ width: '100%', marginTop: 12 }}>
              <RefreshCw size={12} /> Actualiser
            </button>
          </div>
        )}
      </div>
      {/* Edit modal */}
      {editZone && (
        <div className="modal-overlay" onClick={() => setEditZone(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title"><Edit3 size={16} /> Modifier {editZone.code}</span>
              <button className="modal-close" onClick={() => setEditZone(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label>Nom</label>
                <input className="form-control" type="text" value={editForm.nom}
                  onChange={e => setEditForm({ ...editForm, nom: e.target.value })} />
              </div>
              <div>
                <label>Capacité max (MW)</label>
                <input className="form-control" type="number" step="0.1" min="1" value={editForm.capacite_max_mw}
                  onChange={e => setEditForm({ ...editForm, capacite_max_mw: e.target.value })} />
              </div>
              <div>
                <label>Seuil d'alerte (%)</label>
                <input className="form-control" type="number" min="1" max="100" value={editForm.seuil_alerte_pct}
                  onChange={e => setEditForm({ ...editForm, seuil_alerte_pct: e.target.value })} />
              </div>
              <div>
                <label>Description</label>
                <textarea className="form-control" rows={2} value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditZone(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? <><RefreshCw size={14} className="spinner-sm" /> Sauvegarde...</> : <><Save size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
