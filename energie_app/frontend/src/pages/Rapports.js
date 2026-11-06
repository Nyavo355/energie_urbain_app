import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Plus, FileText, X, CheckCircle, XCircle, AlertCircle, Zap, RefreshCw, Eye, Trash2, ClipboardList, BarChart3 } from 'lucide-react';

const typeLabel = {
  consommation: 'Consommation', historique_reequilibrage: 'Rééquilibrage',
  charge: 'Analyse de charge', alertes: 'Alertes'
};

function SectionRenderer({ section }) {
  if (section.type === 'tableau') {
    return (
      <div className="table-wrap" style={{ margin: '12px 0' }}>
        <table>
          <thead><tr>{section.colonnes.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {section.lignes.map((l, i) => (
              <tr key={i}>{l.map((v, j) => <td key={j}>{v ?? '-'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (section.type === 'statistiques') {
    const d = section.donnees;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0' }}>
        {Object.entries(d).map(([k, v]) => (
          <div key={k} className="card" style={{ flex: '1 0 180px', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{typeof v === 'object' ? JSON.stringify(v) : v}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>
    );
  }
  if (section.type === 'simulations') {
    return (
      <div style={{ margin: '12px 0' }}>
        {section.donnees.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>{s.algorithme.toUpperCase()}</strong>
              <span className={`badge badge-${s.statut === 'complete' ? 'success' : 'danger'}`}>{s.statut}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text-muted)' }}>
              Date: {s.date} · Zones critiques: {s.zones_critiques} · Excédentaires: {s.zones_excedentaires}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Énergie redistribuée: <strong>{s.energie_redistribuee_mw} MW</strong> · Durée: {s.duree_ms} ms
            </div>
            {s.transferts && s.transferts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {s.transferts.length} transfert(s) proposé(s)
                  </summary>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table>
                      <thead><tr><th>Source</th><th>Destination</th><th>Quantité (MW)</th><th>Pertes (MW)</th><th>Coût</th></tr></thead>
                      <tbody>
                        {s.transferts.map((t, i) => (
                          <tr key={i}><td>{t.source}</td><td>{t.destination}</td><td>{t.quantite_mw}</td><td>{t.pertes_mw}</td><td>{t.cout ?? '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (section.type === 'plan_action') {
    const d = section.donnees;
    return (
      <div className="card" style={{ padding: 16, margin: '12px 0', borderLeft: '4px solid var(--primary)' }}>
        <h4 style={{ margin: '0 0 8px' }}>Algorithme retenu : {d.algorithme?.toUpperCase()}</h4>
        <p style={{ fontSize: 13, margin: '4px 0' }}>Énergie redistribuée : <strong>{d.energie_redistribuee_mw} MW</strong></p>
        <p style={{ fontSize: 13, margin: '4px 0' }}>Nombre de transferts : {d.nombre_transferts}</p>
        {d.transferts && (
          <ul style={{ fontSize: 13, marginTop: 8 }}>
            {d.transferts.map((t, i) => (
              <li key={i}>{t.de} → {t.vers} : {t.quantite_mw} MW</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (section.type === 'priorites') {
    return (
      <div style={{ margin: '12px 0' }}>
        {section.donnees.map((z, i) => (
          <div key={i} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: '4px solid var(--danger)' }}>
            <strong>{z.zone}</strong> ({z.code}) — Taux: {z.taux}% — Besoin: {z.besoin_mw} MW
          </div>
        ))}
      </div>
    );
  }
  return <pre style={{ fontSize: 13, margin: '12px 0' }}>{JSON.stringify(section, null, 2)}</pre>;
}

export default function Rapports() {
  const [rapports, setRapports] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [zones, setZones] = useState([]);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('rapports');
  const [validerModal, setValiderModal] = useState(null);
  const [validerForm, setValiderForm] = useState({ decision: 'approuvee', commentaire: '' });
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    titre: '', type_rapport: 'consommation', periode_debut: '',
    periode_fin: '', format_export: 'pdf', zones_ids: []
  });

  const charger = async () => {
    const [r, z, s] = await Promise.all([api.getRapports(), api.getZones(), api.getSimulations()]);
    setRapports(r); setZones(z); setSimulations(s);
  };
  useEffect(() => { charger(); }, []);

  const plansAValider = simulations.filter(s => s.statut === 'complete');
  const plansValides = simulations.filter(s => s.statut === 'validee' || s.statut === 'rejetee');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...form, zones_ids: form.zones_ids.length > 0 ? form.zones_ids : null };
    await api.genererRapport(data);
    setModal(false); charger();
  };

  const openDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const r = await api.getRapport(id);
      setDetail(r);
    } catch (err) {
      alert('Erreur chargement rapport');
    } finally {
      setLoadingDetail(false);
    }
  };

  const validerPlan = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api.validerSimulation(validerModal.id, validerForm);
      setValiderModal(null); charger();
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', marginBottom: 16 }}>
        <button onClick={() => setTab('rapports')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: tab === 'rapports' ? '#1e3a5f' : 'transparent',
            color: tab === 'rapports' ? '#fff' : '#64748b',
            fontWeight: tab === 'rapports' ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <FileText size={15} /> Rapports
        </button>
        <button onClick={() => setTab('plans')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: tab === 'plans' ? '#1e3a5f' : 'transparent',
            color: tab === 'plans' ? '#fff' : '#64748b',
            fontWeight: tab === 'plans' ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Zap size={15} /> Plans à valider
          {plansAValider.length > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{plansAValider.length}</span>
          )}
        </button>
        <button onClick={() => setTab('historique')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: tab === 'historique' ? '#1e3a5f' : 'transparent',
            color: tab === 'historique' ? '#fff' : '#64748b',
            fontWeight: tab === 'historique' ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <RefreshCw size={15} /> Plans traités
          {plansValides.length > 0 && (
            <span style={{ background: '#16a34a', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{plansValides.length}</span>
          )}
        </button>
      </div>

      {/* Rapports tab */}
      {tab === 'rapports' && (
        <>
          {detail && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
              <div className="modal" style={{ maxWidth: 900 }}>
                <div className="modal-header">
                  <span className="modal-title"><FileText size={18} /> {detail.titre}</span>
                  <button className="modal-close" onClick={() => setDetail(null)}><X size={18} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                  {detail.utilisateur_nom && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                      Généré par <strong>{detail.utilisateur_nom}</strong> le {new Date(detail.created_at).toLocaleString('fr-FR')}
                    </p>
                  )}
                  <div className="badge badge-info" style={{ marginBottom: 12, display: 'inline-block' }}>
                    {typeLabel[detail.type_rapport] || detail.type_rapport} · {detail.format_export?.toUpperCase()}
                  </div>
                  {detail.contenu ? (
                    <>
                      <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--bg-secondary)' }}>
                        <h4 style={{ margin: 0 }}>Résumé</h4>
                        <p style={{ fontSize: 14, marginTop: 8 }}>{detail.contenu.resume}</p>
                      </div>
                      {detail.contenu.sections?.map((sec, i) => (
                        <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>{sec.titre}</h4>
                          <SectionRenderer section={sec} />
                        </div>
                      ))}
                      {detail.contenu.plan_action && (
                        <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: '4px solid var(--success)' }}>
                          <h4 style={{ margin: '0 0 8px' }}>Plan d'action</h4>
                          <ul style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                            {detail.contenu.plan_action.actions_recommandees?.map((a, i) => <li key={i}>{a}</li>)}
                            {detail.contenu.plan_action.priorite_haute && (
                              <li><strong>Priorité haute :</strong> {detail.contenu.plan_action.priorite_haute.join(', ')}</li>
                            )}
                          </ul>
                        </div>
                      )}
                      {detail.contenu.decisions?.length > 0 && (
                        <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--warning)' }}>
                          <h4 style={{ margin: '0 0 8px' }}>Décisions prises</h4>
                          <ol style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                            {detail.contenu.decisions.map((d, i) => <li key={i}>{d}</li>)}
                          </ol>
                        </div>
                      )}
                    </>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Ce rapport ne contient pas de données détaillées.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* En-tête */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Rapports &amp; Analyses</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Créez et consultez des rapports détaillés sur la consommation, le rééquilibrage et les alertes du réseau
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => { setForm({ titre: '', type_rapport: 'consommation', periode_debut: '', periode_fin: '', format_export: 'pdf', zones_ids: [] }); setModal(true); }}>
              <Plus size={16} /> Nouveau rapport
            </button>
          </div>

          {/* Indicateurs clés */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ padding: '14px 16px', textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{zones.length}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Zones suivies</div>
            </div>
            <div className="card" style={{ padding: '14px 16px', textAlign: 'center', borderTop: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>{simulations.length}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Simulations réalisées</div>
            </div>
            <div className="card" style={{ padding: '14px 16px', textAlign: 'center', borderTop: '3px solid #f59e0b' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{rapports.length}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Rapports générés</div>
            </div>
            <div className="card" style={{ padding: '14px 16px', textAlign: 'center', borderTop: '3px solid #10b981' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{plansAValider.length}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Plans à valider</div>
            </div>
          </div>

          {/* Création rapide par type de rapport */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} /> Création rapide
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {[
                { key: 'consommation', icon: ClipboardList, color: '#3b82f6', bg: '#eff6ff', title: 'Consommation', desc: 'Synthèse des relevés de consommation, évolution temporelle, statistiques par zone' },
                { key: 'historique_reequilibrage', icon: BarChart3, color: '#8b5cf6', bg: '#f5f3ff', title: 'Rééquilibrage', desc: 'Historique complet des simulations : algorithmes, transferts, pertes, décisions' },
                { key: 'charge', icon: Zap, color: '#f59e0b', bg: '#fffbeb', title: 'Analyse de charge', desc: 'Taux de charge, capacités résiduelles, seuils critiques par zone' },
                { key: 'alertes', icon: AlertCircle, color: '#dc2626', bg: '#fef2f2', title: 'Alertes', desc: 'Historique des alertes actives et résolues, zones critiques, décisions prises' },
              ].map(type => (
                <div key={type.key} className="card" style={{
                  cursor: 'pointer', padding: 16, border: '1px solid #e2e8f0',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                  onClick={() => {
                    setForm({ ...form,
                      titre: `Rapport ${type.title.toLowerCase()} - ${new Date().toLocaleDateString('fr-FR')}`,
                      type_rapport: type.key
                    });
                    setModal(true);
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: type.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <type.icon size={20} color={type.color} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: type.color }}>{type.title}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Type: {type.key}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{type.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Liste des rapports générés */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} /> Rapports générés
                {rapports.length > 0 && <span className="badge badge-info" style={{ fontSize: 11 }}>{rapports.length}</span>}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Titre</th><th>Type</th><th>Format</th><th>Statut</th><th>Zones</th><th>Date</th></tr></thead>
                <tbody>
                  {rapports.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                      <FileText size={32} style={{ opacity: 0.3, marginBottom: 4 }} /><br />
                      Aucun rapport pour le moment — Cliquez sur "Nouveau rapport" ou une carte de création rapide
                    </td></tr>
                  ) : rapports.map(r => (
                    <tr key={r.id} onClick={() => openDetail(r.id)} style={{ cursor: 'pointer' }}>
                      <td><strong>{r.titre}</strong></td>
                      <td><span className="badge badge-info">{typeLabel[r.type_rapport] || r.type_rapport}</span></td>
                      <td><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{r.format_export?.toUpperCase()}</span></td>
                      <td><span className={`badge badge-${r.statut === 'genere' ? 'success' : 'warning'}`}>{r.statut}</span></td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{r.zones_count != null ? `${r.zones_count} zone(s)` : '-'}</td>
                      <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de création */}
          {modal && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
              <div className="modal" style={{ maxWidth: 650 }}>
                <div className="modal-header">
                  <span className="modal-title"><FileText size={18} /> Nouveau rapport</span>
                  <button className="modal-close" onClick={() => setModal(false)}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                  <div className="modal-body">
                    {/* Titre */}
                    <div className="form-group">
                      <label className="form-label">Titre du rapport *</label>
                      <input className="form-control" required value={form.titre}
                        onChange={e => setForm({ ...form, titre: e.target.value })}
                        placeholder="ex: Rapport mensuel consommation janvier 2024" />
                    </div>

                    {/* Type + Format */}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Type de rapport</label>
                        <select className="form-control" value={form.type_rapport}
                          onChange={e => setForm({ ...form, type_rapport: e.target.value })}>
                          <option value="consommation">Consommation — Synthèse des relevés</option>
                          <option value="historique_reequilibrage">Rééquilibrage — Historique des simulations</option>
                          <option value="charge">Analyse de charge — Taux par zone</option>
                          <option value="alertes">Alertes — Historique des alertes</option>
                        </select>
                        <small style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'block' }}>
                          {form.type_rapport === 'consommation' ? 'Synthèse des relevés, statistiques, évolution par zone' : ''}
                          {form.type_rapport === 'historique_reequilibrage' ? 'Simulations, transferts, pertes, décisions de validation' : ''}
                          {form.type_rapport === 'charge' ? 'Taux de charge, capacités, seuils critiques, alertes associées' : ''}
                          {form.type_rapport === 'alertes' ? 'Alertes actives/résolues, zones critiques, historique des résolutions' : ''}
                        </small>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Format d'export</label>
                        <select className="form-control" value={form.format_export}
                          onChange={e => setForm({ ...form, format_export: e.target.value })}>
                          <option value="pdf">PDF — Document structuré prêt à imprimer</option>
                          <option value="csv">CSV — Données brutes exploitables dans Excel</option>
                          <option value="excel">Excel — Tableau formaté avec graphiques</option>
                        </select>
                      </div>
                    </div>

                    {/* Période */}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Période début</label>
                        <input className="form-control" type="datetime-local" value={form.periode_debut}
                          onChange={e => setForm({ ...form, periode_debut: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Période fin</label>
                        <input className="form-control" type="datetime-local" value={form.periode_fin}
                          onChange={e => setForm({ ...form, periode_fin: e.target.value })} />
                      </div>
                    </div>

                    {/* Zones */}
                    <div className="form-group">
                      <label className="form-label">Zones concernées</label>
                      <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4 }}>
                        {zones.map(z => {
                          const checked = form.zones_ids.includes(String(z.id));
                          return (
                            <label key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, background: checked ? '#eff6ff' : 'transparent' }}>
                              <input type="checkbox" checked={checked}
                                onChange={() => {
                                  const ids = checked
                                    ? form.zones_ids.filter(id => id !== String(z.id))
                                    : [...form.zones_ids, String(z.id)];
                                  setForm({ ...form, zones_ids: ids });
                                }} />
                              <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{z.code}</span>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{z.nom}</span>
                            </label>
                          );
                        })}
                      </div>
                      <small style={{ color: '#64748b', fontSize: 11, marginTop: 2, display: 'block' }}>
                        {form.zones_ids.length === 0
                          ? 'Aucune zone sélectionnée = toutes les zones'
                          : `${form.zones_ids.length} zone(s) sélectionnée(s)`}
                      </small>
                    </div>

                    {/* Aperçu détaillé */}
                    <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                      <strong style={{ color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <FileText size={14} /> Aperçu du rapport
                      </strong>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', color: '#475569' }}>
                        <span>Titre :</span><span style={{ fontWeight: 600 }}>{form.titre || '(non défini)'}</span>
                        <span>Type :</span><span>{typeLabel[form.type_rapport] || form.type_rapport}</span>
                        <span>Période :</span><span>{form.periode_debut ? new Date(form.periode_debut).toLocaleDateString('fr-FR') : 'début'} → {form.periode_fin ? new Date(form.periode_fin).toLocaleDateString('fr-FR') : 'fin'}</span>
                        <span>Format :</span><span>{form.format_export.toUpperCase()}</span>
                        <span>Zones :</span><span>{form.zones_ids.length > 0 ? form.zones_ids.map(id => zones.find(z => z.id === parseInt(id))?.code).join(', ') : 'Toutes les zones'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Les champs marqués * sont obligatoires</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
                      <button type="submit" className="btn btn-primary"><FileText size={15} /> Générer le rapport</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* Plans à valider */}
      {tab === 'plans' && (
        <div>
          {plansAValider.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <CheckCircle size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p>Aucun plan en attente de validation</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {plansAValider.map(sim => {
                const totalMw = sim.transferts?.reduce((s, t) => s + (t.quantite_mw || 0), 0) || 0;
                const zonesUniques = [...new Set([
                  ...(sim.transferts?.map(t => t.zone_source?.code || t.source) || []),
                  ...(sim.transferts?.map(t => t.zone_destination?.code || t.destination) || []),
                ])];
                return (
                  <div key={sim.id} className="card" style={{ border: '2px solid #fde68a' }}>
                    <div className="card-header" style={{ background: '#fffbeb' }}>
                      <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={16} color="#d97706" />
                        Plan du {new Date(sim.horodatage_analyse || sim.date_creation).toLocaleString('fr-FR')}
                      </span>
                      <span className="badge badge-warning">En attente</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Algorithme</div>
                          <strong>{sim.algorithme}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Transferts</div>
                          <strong>{sim.transferts?.length || 0}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Énergie</div>
                          <strong style={{ color: '#d97706' }}>{totalMw.toFixed(1)} MW</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Zones concernées</div>
                          <strong>{zonesUniques.length}</strong>
                        </div>
                      </div>

                      {sim.transferts?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: '#374151' }}>
                            Transferts proposés
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {sim.transferts.map((t, i) => {
                              const srcNom = zones.find(z => z.code === (t.zone_source?.code || t.source))?.nom || '';
                              const dstNom = zones.find(z => z.code === (t.zone_destination?.code || t.destination))?.nom || '';
                              return (
                                <div key={i} style={{
                                  padding: '8px 12px', borderRadius: 6, background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                                        {t.zone_source?.code || t.source}
                                        {srcNom && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4 }}>({srcNom})</span>}
                                        <span style={{ margin: '0 6px', color: '#f59e0b' }}>→</span>
                                        {t.zone_destination?.code || t.destination}
                                        {dstNom && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4 }}>({dstNom})</span>}
                                      </div>
                                      <div style={{ color: '#64748b', marginTop: 2 }}>
                                        {t.pertes_estimees != null && <span>Pertes: {t.pertes_estimees.toFixed(3)} MW</span>}
                                        {t.nouveau_taux != null && <span> · Taux destination: {t.nouveau_taux.toFixed(1)}%</span>}
                                      </div>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: 16, color: '#16a34a' }}>{t.quantite_mw} MW</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-danger" onClick={() => {
                          setValiderForm({ decision: 'rejetee', commentaire: '' });
                          setValiderModal(sim);
                        }}>
                          <XCircle size={14} /> Rejeter
                        </button>
                        <button className="btn btn-primary" onClick={() => {
                          setValiderForm({ decision: 'approuvee', commentaire: '' });
                          setValiderModal(sim);
                        }}>
                          <CheckCircle size={14} /> Approuver
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Historique des plans traités */}
      {tab === 'historique' && (
        <div>
          {plansValides.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <RefreshCw size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p>Aucun plan traité</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {plansValides.map(sim => {
                const totalMw = sim.transferts?.reduce((s, t) => s + (t.quantite_mw || 0), 0) || 0;
                const isApprouve = sim.statut === 'validee' || sim.decision === 'approuvee';
                const zonesUniques = [...new Set([
                  ...(sim.transferts?.map(t => t.zone_source?.code || t.source) || []),
                  ...(sim.transferts?.map(t => t.zone_destination?.code || t.destination) || []),
                ])];
                return (
                  <div key={sim.id} className="card" style={{ border: isApprouve ? '2px solid #bbf7d0' : '2px solid #fecaca' }}>
                    <div className="card-header" style={{ background: isApprouve ? '#f0fdf4' : '#fef2f2' }}>
                      <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isApprouve ? <CheckCircle size={16} color="#16a34a" /> : <XCircle size={16} color="#dc2626" />}
                        Plan du {new Date(sim.horodatage_analyse || sim.date_creation).toLocaleString('fr-FR')}
                      </span>
                      <span className={`badge badge-${isApprouve ? 'success' : 'critical'}`}>
                        {isApprouve ? 'Approuvé' : 'Rejeté'}
                      </span>
                    </div>
                    <div style={{ padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Algorithme</div>
                          <strong>{sim.algorithme}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Transferts</div>
                          <strong>{sim.transferts?.length || 0}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Énergie totale</div>
                          <strong style={{ color: isApprouve ? '#16a34a' : '#dc2626' }}>{totalMw.toFixed(1)} MW</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Zones concernées</div>
                          <strong>{zonesUniques.length}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12 }}>
                          <div style={{ color: '#64748b' }}>Décision</div>
                          <strong>{sim.decision || sim.statut}</strong>
                        </div>
                      </div>

                      {sim.transferts?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: '#374151' }}>Transferts réalisés</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {sim.transferts.map((t, i) => {
                              const srcNom = zones.find(z => z.code === (t.zone_source?.code || t.source))?.nom || '';
                              const dstNom = zones.find(z => z.code === (t.zone_destination?.code || t.destination))?.nom || '';
                              return (
                                <div key={i} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '6px 10px', borderRadius: 6, background: '#f8fafc', fontSize: 12,
                                }}>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{t.zone_source?.code || t.source}</span>
                                    {srcNom && <span style={{ color: '#64748b', marginLeft: 2 }}>({srcNom})</span>}
                                    <span style={{ margin: '0 6px', color: '#f59e0b' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{t.zone_destination?.code || t.destination}</span>
                                    {dstNom && <span style={{ color: '#64748b', marginLeft: 2 }}>({dstNom})</span>}
                                    {t.pertes_estimees != null && (
                                      <span style={{ marginLeft: 8, color: '#d97706', fontSize: 11 }}>
                                        pertes: {t.pertes_estimees.toFixed(3)} MW
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontWeight: 700, color: '#16a34a' }}>{t.quantite_mw} MW</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {sim.commentaire && (
                        <div style={{ marginTop: 6, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#6b7280', borderLeft: '3px solid #e2e8f0' }}>
                          "{sim.commentaire}"
                        </div>
                      )}
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={async () => { if (window.confirm('Supprimer ce plan de l\'historique ?')) { try { await api.supprimerSimulation(sim.id); charger(); } catch (e) { alert(e.message); } } }} style={{ color: '#dc2626', fontSize: 11 }}>
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
      )}

      {/* Validation modal */}
      {validerModal && (
        <div className="modal-overlay" onClick={() => setValiderModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                {validerForm.decision === 'approuvee' ? <CheckCircle size={18} color="#16a34a" /> : <XCircle size={18} color="#dc2626" />}
                {validerForm.decision === 'approuvee' ? "Approuver le plan" : "Rejeter le plan"}
              </h3>
              <button className="modal-close" onClick={() => setValiderModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={validerPlan}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {error && <div className="alert alert-danger"><AlertCircle size={14} /> {error}</div>}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Décision</label>
                  <select className="form-control" value={validerForm.decision}
                    onChange={e => setValiderForm({ ...validerForm, decision: e.target.value })}>
                    <option value="approuvee">Approuver — Appliquer le plan sur le réseau</option>
                    <option value="rejetee">Rejeter — Refuser le plan proposé</option>
                    <option value="modifiee">Modifiée — Avec ajustements supplémentaires</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Commentaire</label>
                  <textarea className="form-control" rows={3}
                    value={validerForm.commentaire}
                    onChange={e => setValiderForm({ ...validerForm, commentaire: e.target.value })}
                    placeholder="Justification de votre décision..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setValiderModal(null)}>Annuler</button>
                <button type="submit" className={`btn ${validerForm.decision === 'approuvee' ? 'btn-primary' : 'btn-danger'}`}>
                  {validerForm.decision === 'approuvee' ? <><CheckCircle size={15} /> Confirmer l'approbation</>
                    : <><XCircle size={15} /> Confirmer le rejet</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
