// src/pages/Utilisateurs.js
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Plus, Save, Users, Lock, Unlock, X } from 'lucide-react';

export default function Utilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nom: '', email: '', mot_de_passe: '', role_id: '' });
  const [error, setError] = useState('');

  const charger = async () => {
    const [u, r] = await Promise.all([api.getUtilisateurs(), api.getRoles()]);
    setUtilisateurs(u); setRoles(r);
  };
  useEffect(() => { charger(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api.creerUtilisateur(form);
      setModal(false); charger();
    } catch (err) { setError(err.message); }
  };

  const toggleActif = async (u) => {
    await api.modifierUtilisateur(u.id, { actif: !u.actif }); charger();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setForm({ nom: '', email: '', mot_de_passe: '', role_id: '' }); setError(''); setModal(true); }}>
          <Plus size={16} /> Nouvel utilisateur
        </button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Dernière connexion</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {utilisateurs.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.nom}</strong></td>
                  <td>{u.email}</td>
                  <td><span className="badge badge-info">{u.role.nom}</span></td>
                  <td style={{ fontSize: 12 }}>{u.derniere_connexion ? new Date(u.derniere_connexion).toLocaleString('fr-FR') : 'Jamais'}</td>
                  <td><span className={`badge badge-${u.actif ? 'success' : 'warning'}`}>{u.actif ? 'Actif' : 'Inactif'}</span></td>
                  <td>
                    <button className={`btn btn-sm ${u.actif ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleActif(u)}>
                      {u.actif ? <><Lock size={14} /> Désactiver</> : <><Unlock size={14} /> Activer</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title"><Users size={18} /> Nouvel utilisateur</span>
              <button className="modal-close" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}
                <div className="form-group">
                  <label className="form-label">Nom complet *</label>
                  <input className="form-control" required value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-control" type="email" required value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Mot de passe *</label>
                    <input className="form-control" type="password" required value={form.mot_de_passe}
                      onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rôle *</label>
                    <select className="form-control" required value={form.role_id}
                      onChange={e => setForm({ ...form, role_id: e.target.value })}>
                      <option value="">— Choisir —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary"><Save size={16} /> Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
