// src/services/api.js - Client API centralisé

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class ApiService {
  constructor() {
    this.baseUrl = BASE_URL;
  }

  getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async request(method, path, body = null, isFormData = false) {
    const headers = isFormData
      ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
      : this.getHeaders();

    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, options);
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Le serveur a répondu ${res.status} pour ${method} ${path}. Vérifiez que cette fonctionnalité est supportée.`);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  }

  // Auth
  login = (email, mot_de_passe) => this.request('POST', '/auth/login', { email, mot_de_passe });
  logout = () => this.request('POST', '/auth/logout');
  getMe = () => this.request('GET', '/auth/me');
  getUtilisateurs = () => this.request('GET', '/auth/utilisateurs');
  creerUtilisateur = (data) => this.request('POST', '/auth/utilisateurs', data);
  modifierUtilisateur = (id, data) => this.request('PUT', `/auth/utilisateurs/${id}`, data);
  getRoles = () => this.request('GET', '/auth/roles');

  // Dashboard
  getResume = () => this.request('GET', '/dashboard/resume');
  getConsommationParHeure = (heures = 24, zone_id = null) =>
    this.request('GET', `/dashboard/consommation-par-heure?heures=${heures}${zone_id ? `&zone_id=${zone_id}` : ''}`);
  getStatutZones = () => this.request('GET', '/dashboard/statut-zones');

  // Zones
  getZones = () => this.request('GET', '/zones?actif=true');
  getZone = (id) => this.request('GET', `/zones/${id}`);
  creerZone = (data) => this.request('POST', '/zones', data);
  modifierZone = (id, data) => this.request('PUT', `/zones/${id}`, data);
  supprimerZone = (id) => this.request('DELETE', `/zones/${id}`);
  getRegions = () => this.request('GET', '/zones/regions');
  creerRegion = (data) => this.request('POST', '/zones/regions', data);

  // Connexions
  getConnexions = () => this.request('GET', '/connexions');
  creerConnexion = (data) => this.request('POST', '/connexions', data);
  modifierConnexion = (id, data) => this.request('PUT', `/connexions/${id}`, data);
  supprimerConnexion = (id) => this.request('DELETE', `/connexions/${id}`);

  // Relevés
  getReleves = (zone_id = null, limite = 100) =>
    this.request('GET', `/releves?limite=${limite}${zone_id ? `&zone_id=${zone_id}` : ''}`);
  saisirReleve = (data) => this.request('POST', '/releves', data);
  importerCSV = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return this.request('POST', '/releves/import-csv', fd, true);
  };

  // Analyses
  getAnalyses = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/analyses?${qs}`);
  };
  getZonesCritiques = () => this.request('GET', '/analyses/critiques');
  getAlertes = (resolue = false) => this.request('GET', `/analyses/alertes?resolue=${resolue}`);
  acquitterAlerte = (id) => this.request('PUT', `/analyses/alertes/${id}/acquitter`);

  // Simulations
  getSimulations = () => this.request('GET', '/simulations');
  lancerSimulation = (data) => this.request('POST', '/simulations', data);
  getSimulation = (id) => this.request('GET', `/simulations/${id}`);
  validerSimulation = (id, data) => this.request('POST', `/simulations/${id}/valider`, data);
  supprimerSimulation = (id) => this.request('DELETE', `/simulations/${id}`);
  getGraphe = () => this.request('GET', '/simulations/graphe');

  // Paramètres
  getParametres = () => this.request('GET', '/parametres');
  modifierParametres = (data) => this.request('PUT', '/parametres', data);

  // Rapports
  getRapports = () => this.request('GET', '/rapports');
  getRapport = (id) => this.request('GET', `/rapports/${id}`);
  genererRapport = (data) => this.request('POST', '/rapports', data);
}

export default new ApiService();
