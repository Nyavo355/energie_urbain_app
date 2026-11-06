// src/pages/Releves.js
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
  FolderOpen, Plus, RefreshCw, ClipboardList, CheckCircle, XCircle, Save, Upload, X, Trash2
} from 'lucide-react';

export default function Releves() {
  const [releves, setReleves] = useState([]);
  const [zones, setZones] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [form, setForm] = useState({ zone_id: '', consommation_mw: '', horodatage: '', notes: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterZone, setFilterZone] = useState('');
  const [tab, setTab] = useState('releves');

  const charger = async () => {
    const [r, z, s] = await Promise.all([
      api.getReleves(filterZone || null, 200),
      api.getZones(),
      api.getSimulations(),
    ]);
    setReleves(r); setZones(z); setSimulations(s); setLoading(false);
  };
  useEffect(() => { charger(); }, [filterZone]);

  const redistributions = simulations.filter(s =>
    s.statut === 'validee' && s.transferts?.length > 0
  );

  const openCreate = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    setForm({ zone_id: '', consommation_mw: '', horodatage: now.toISOString().slice(0, 16), notes: '' });
    setError(''); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api.saisirReleve({ ...form, horodatage: form.horodatage + ':00' });
      setModal(false); charger();
    } catch (err) { setError(err.message); }
  };

  const handleImport = async (e) => {
    e.preventDefault(); setError('');
    if (!file) { setError('Veuillez sélectionner un fichier'); return; }
    try {
      const result = await api.importerCSV(file);
      setImportResult(result); charger();
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', marginBottom: 16 }}>
        <button onClick={() => setTab('releves')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: tab === 'releves' ? '#1e3a5f' : 'transparent',
            color: tab === 'releves' ? '#fff' : '#64748b',
            fontWeight: tab === 'releves' ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <ClipboardList size={15} /> Relevés
        </button>
        <button onClick={() => setTab('redistribution')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: tab === 'redistribution' ? '#1e3a5f' : 'transparent',
            color: tab === 'redistribution' ? '#fff' : '#64748b',
            fontWeight: tab === 'redistribution' ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <RefreshCw size={15} /> Résultats redistribution
          {redistributions.length > 0 && (
            <span style={{ background: tab === 'redistribution' ? 'rgba(255,255,255,0.2)' : '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{redistributions.length}</span>
          )}
        </button>
      </div>

      {tab === 'redistribution' ? (
        <div>
          {redistributions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <CheckCircle size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p>Aucune redistribution validée pour le moment</p>
              <p style={{ fontSize: 13 }}>Les résultats des simulations approuvées apparaîtront ici</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {redistributions.map(sim => {
                const totalMw = sim.transferts.reduce((s, t) => s + (t.quantite_mw || 0), 0);
                return (
                  <div key={sim.id} className="card">
                    <div className="card-header">
                      <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <RefreshCw size={16} color="#16a34a" />
                        Redistribution du {new Date(sim.horodatage_analyse || sim.date_creation).toLocaleString('fr-FR')}
                      </span>
                      <span className="badge badge-success">Approuvée</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      {/* KPI cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Algorithme</div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{sim.algorithme}</div>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Transferts</div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{sim.transferts.length}</div>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Énergie totale</div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#16a34a' }}>{totalMw.toFixed(1)} MW</div>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Décision</div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{sim.decision || 'Approuvée'}</div>
                        </div>
                      </div>

                      {/* Transfer details with before/after */}
                      <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>Détail des transferts</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {sim.transferts.map((t, i) => {
                          const srcZone = zones.find(z => z.code === t.source);
                          const dstZone = zones.find(z => z.code === t.destination);
                          const consoBefore = t.consommation_avant ?? t.quantite_mw * 2;
                          const consoAfter = Math.max(0, consoBefore - (t.quantite_mw || 0));
                          const capaSrc = srcZone?.capacite_max_mw || 100;
                          const capaDst = dstZone?.capacite_max_mw || 100;
                          const tauxAvant = capaSrc > 0 ? (consoBefore / capaSrc * 100) : 0;
                          const tauxApres = capaDst > 0 ? (consoAfter / capaDst * 100) : 0;
                          return (
                            <div key={i} style={{ padding: 14, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#dc2626' }}>{t.source}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{srcZone?.nom || ''}</div>
                                  </div>
                                  <div style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700 }}>→</div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#16a34a' }}>{t.destination}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{dstZone?.nom || ''}</div>
                                  </div>
                                </div>
                                <div style={{ fontWeight: 700, fontSize: 20, color: '#16a34a' }}>{t.quantite_mw} MW</div>
                              </div>

                              {/* Before / After comparison */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ background: '#fff', borderRadius: 6, padding: 10, border: '1px solid #fee2e2' }}>
                                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Avant (source)</div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{(t.consommation_avant_source ?? 0).toFixed(1)} MW</div>
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>Capacité: {capaSrc} MW · Taux: {tauxAvant.toFixed(1)}%</div>
                                </div>
                                <div style={{ background: '#fff', borderRadius: 6, padding: 10, border: '1px solid #bbf7d0' }}>
                                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Après (destination)</div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{consoAfter.toFixed(1)} MW</div>
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>Nouveau taux: {tauxApres.toFixed(1)}%</div>
                                </div>
                              </div>

                              {t.pertes_estimees != null && (
                                <div style={{ marginTop: 6, fontSize: 12, color: '#d97706', background: '#fffbeb', padding: '6px 10px', borderRadius: 4 }}>
                                  Pertes estimées : <strong>{t.pertes_estimees.toFixed(3)} MW</strong>
                                  {t.pertes_estimees > 0 && <span> ({(t.pertes_estimees / (t.quantite_mw || 1) * 100).toFixed(1)}% du transfert)</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={async () => { if (window.confirm('Supprimer cette redistribution de l\'historique ?')) { try { await api.supprimerSimulation(sim.id); charger(); } catch (e) { alert(e.message); } } }} style={{ color: '#dc2626', fontSize: 11 }}>
                          <Trash2 size={12} /> Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 220 }} value={filterZone}
              onChange={e => setFilterZone(e.target.value)}>
              <option value="">Toutes les zones</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.code} – {z.nom}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => { setImportResult(null); setError(''); setImportModal(true); }}>
              <FolderOpen size={16} /> Importer CSV
            </button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Saisir relevé</button>
          </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Historique des relevés ({releves.length})</span>
          <button className="btn btn-secondary btn-sm" onClick={charger}><RefreshCw size={14} /></button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Zone</th><th>Consommation</th><th>Horodatage</th><th>Source</th><th>Validé</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {releves.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                  Aucun relevé — Saisissez vos premières données de consommation
                </td></tr>
              ) : releves.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.zone_nom}</strong></td>
                  <td><strong>{r.consommation_mw} MW</strong></td>
                  <td>{new Date(r.horodatage).toLocaleString('fr-FR')}</td>
                  <td><span className="badge badge-info">Manuel</span></td>
                  <td>{r.valide ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
    )}
    
    {/* Modal saisie */}
    {modal && (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title"><ClipboardList size={18} /> Saisir un relevé</span>
            <button className="modal-close" onClick={() => setModal(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-group">
                <label className="form-label">Zone *</label>
                <select className="form-control" required value={form.zone_id}
                  onChange={e => setForm({ ...form, zone_id: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.code} – {z.nom} (cap. {z.capacite_max_mw} MW)</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Consommation (MW) *</label>
                  <input className="form-control" type="number" step="0.001" min="0" required
                    value={form.consommation_mw}
                    onChange={e => setForm({ ...form, consommation_mw: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Horodatage *</label>
                  <input className="form-control" type="datetime-local" required
                    value={form.horodatage}
                    onChange={e => setForm({ ...form, horodatage: e.target.value })} />
                </div>
              </div>
              {form.zone_id && form.consommation_mw && (() => {
                const z = zones.find(z => z.id === parseInt(form.zone_id));
                if (!z) return null;
                const taux = (parseFloat(form.consommation_mw) / z.capacite_max_mw * 100).toFixed(1);
                const statut = taux >= 100 ? 'critique' : taux >= z.seuil_alerte_pct ? 'surchargee' : taux < 70 ? 'excedentaire' : 'normale';
                return (
                  <div className="alert alert-info" style={{ fontSize: 13 }}>
                    Taux de charge estimé : <strong>{taux}%</strong> — Statut prévu : <span className={`badge badge-${statut}`}>{statut}</span>
                  </div>
                );
              })()}
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary"><Save size={16} /> Enregistrer</button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Modal import CSV */}
    {importModal && (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportModal(false)}>
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title"><FolderOpen size={18} /> Import CSV</span>
            <button className="modal-close" onClick={() => setImportModal(false)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            {importResult ? (
              <div>
                <div className={`alert alert-${importResult.statut === 'succes' ? 'success' : importResult.statut === 'partiel' ? 'warning' : 'danger'}`}>
                  <div><strong>Import terminé : {importResult.statut}</strong></div>
                  <div><CheckCircle size={14} /> {importResult.lignes_ok} lignes importées</div>
                  <div><XCircle size={14} /> {importResult.lignes_erreur} lignes en erreur</div>
                </div>
                {importResult.erreurs?.length > 0 && (
                  <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                    {importResult.erreurs.map((e, i) => (
                      <div key={i} style={{ color: 'var(--danger)', padding: '4px 0' }}>
                        Ligne {e.ligne}: {e.erreur}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleImport}>
                <div className="form-group">
                  <label className="form-label">Fichier CSV *</label>
                  <input className="form-control" type="file" accept=".csv"
                    onChange={e => setFile(e.target.files[0])} required />
                  <small style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Colonnes requises: code_zone, consommation_mw, horodatage
                  </small>
                </div>
                <div className="modal-footer" style={{ padding: '0' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setImportModal(false)}>Annuler</button>
                  <button type="submit" className="btn btn-primary"><Upload size={16} /> Importer</button>
                </div>
              </form>
            )}
          </div>
          {importResult && (
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setImportModal(false)}>Fermer</button>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
}
