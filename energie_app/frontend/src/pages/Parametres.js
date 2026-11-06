import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
  Undo2, Loader, Save, Settings, Wrench, Info, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

export default function Parametres() {
  const [params, setParams] = useState([]);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  const charger = async () => {
    try {
      const data = await api.getParametres();
      setParams(data);
      const init = {};
      data.forEach(p => { init[p.cle] = p.valeur; });
      setEditing(init);
    } catch (err) {
      setMsg({ type: 'danger', text: err.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { charger(); }, []);

  const handleSave = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      await api.modifierParametres(editing);
      setMsg({ type: 'success', text: 'Paramètres mis à jour avec succès' });
      charger();
    } catch (err) {
      setMsg({ type: 'danger', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const reset = {};
    params.forEach(p => { reset[p.cle] = p.valeur; });
    setEditing(reset);
    setMsg({ type: '', text: '' });
  };

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />;

  const hasChanges = params.some(p => editing[p.cle] !== p.valeur);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Modifiez les paramètres système — les changements prennent effet immédiatement
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasChanges && (
            <button className="btn btn-secondary" onClick={handleReset}><Undo2 size={16} /> Annuler</button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <><Loader size={16} className="spinner-sm" /> Sauvegarde...</> : <><Save size={16} /> Enregistrer</>}
          </button>
        </div>
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>
          {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />} {msg.text}
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="card-title"><Settings size={16} /> Paramètres système</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {params.map((p, i) => (
            <div key={p.cle} style={{
              display: 'flex', alignItems: 'center', padding: '14px 20px',
              borderBottom: i < params.length - 1 ? '1px solid var(--border)' : 'none',
              gap: 16
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.cle}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.description}</div>
              </div>
              <div style={{ width: 200, flexShrink: 0 }}>
                {p.type_valeur === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', justifyContent: 'flex-end' }}>
                    <input type="checkbox" checked={editing[p.cle] === 'true'}
                      onChange={e => setEditing({ ...editing, [p.cle]: e.target.checked ? 'true' : 'false' })} />
                    {editing[p.cle] === 'true' ? <><CheckCircle size={14} /> Activé</> : <><XCircle size={14} /> Désactivé</>}
                  </label>
                ) : p.cle === 'algorithme_defaut' ? (
                  <select className="form-control" value={editing[p.cle] || ''}
                    onChange={e => setEditing({ ...editing, [p.cle]: e.target.value })}>
                    <option value="dijkstra">Dijkstra (précis)</option>
                    <option value="greedy">Glouton (rapide)</option>
                    <option value="bellman_ford">Bellman-Ford (complexe)</option>
                  </select>
                ) : (
                  <input className="form-control" type={p.type_valeur === 'integer' ? 'number' : 'text'}
                    value={editing[p.cle] || ''}
                    onChange={e => setEditing({ ...editing, [p.cle]: e.target.value })}
                    style={{ textAlign: 'right', fontWeight: 600 }} />
                )}
              </div>
              {editing[p.cle] !== p.valeur && (
                <span style={{ fontSize: 11, color: 'var(--warning)' }}>Modifié</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title"><Wrench size={16} /> Configuration .env (backend)</span></div>
        <div className="card-body">
          <div className="alert alert-info" style={{ fontSize: 13 }}>
            <Info size={14} /> Ces paramètres se modifient dans le fichier <code>.env</code> du backend.
          </div>
          <pre style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)', padding: 16, borderRadius: 8 }}>{`SECRET_KEY=...
JWT_SECRET_KEY=...
DB_USER=root
DB_PASS=motdepasse
DB_HOST=localhost
DB_NAME=energie_urbaine`}</pre>
        </div>
      </div>
    </div>
  );
}
