# Système de Rééquilibrage Énergétique Urbain

Application complète de gestion et rééquilibrage du réseau électrique urbain.

##  Structure du projet

```
energie_app/
├── backend/              # API Flask (Python)
│   ├── app.py            # Point d'entrée Flask
│   ├── init_db.py        # Script d'initialisation BD
│   ├── requirements.txt  # Dépendances Python
│   ├── .env.example      # Variables d'environnement
│   ├── models/
│   │   └── models.py     # Modèles SQLAlchemy
│   ├── routes/
│   │   ├── auth.py       # Authentification & utilisateurs
│   │   ├── zones.py      # CRUD zones & régions
│   │   ├── connexions.py # Réseau (arêtes du graphe)
│   │   ├── releves.py    # Relevés + import CSV
│   │   ├── analyses.py   # Analyses de charge & alertes
│   │   ├── simulations.py# Algorithmes de rééquilibrage
│   │   ├── dashboard.py  # Tableau de bord (KPIs)
│   │   └── rapports.py   # Génération de rapports
│   └── algorithms/
│       └── graphe.py     # Dijkstra, Bellman-Ford, Greedy
├── frontend/             # Application React
│   ├── package.json
│   ├── public/index.html
│   └── src/
│       ├── App.js        # Routage principal
│       ├── App.css       # Styles complets
│       ├── index.js
│       ├── context/
│       │   └── AuthContext.js
│       ├── services/
│       │   └── api.js    # Client API centralisé
│       └── pages/
│           ├── Login.js
│           ├── Dashboard.js
│           ├── Zones.js
│           ├── Connexions.js
│           ├── Releves.js
│           ├── Alertes.js
│           ├── Simulations.js
│           ├── Rapports.js
│           ├── Utilisateurs.js
│           └── Parametres.js
└── database/
    └── schema.sql        # Schéma complet MySQL/PostgreSQL
```

---

## 🚀 Installation

### Prérequis
- Python 3.10+
- Node.js 18+
- MySQL 8+ (ou PostgreSQL 14+)

---

### 1. Base de données

```sql
-- Dans MySQL :
CREATE DATABASE energie_urbaine CHARACTER SET utf8mb4;
-- Puis importer le schéma :
mysql -u root -p energie_urbaine < database/schema.sql
```

---

### 2. Backend Flask

```bash
cd backend

# Créer l'environnement virtuel
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configurer l'environnement
cp .env.example .env
# Éditez .env avec vos paramètres DB

# Initialiser la base de données (une seule fois)
python init_db.py

# Lancer le serveur
python app.py
# → http://localhost:5000
```

---

### 3. Frontend React

```bash
cd frontend

# Installer les dépendances
npm install

# Lancer en développement
npm start
# → http://localhost:3000

# Build production
npm run build
```

---

## 🔑 Connexion par défaut

| Champ | Valeur |
|-------|--------|
| Email | `admin@energie.mg` |
| Mot de passe | `Admin@2024` (défini lors de `init_db.py`) |

---

## 📡 API REST — Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion |
| GET | `/api/dashboard/resume` | KPIs tableau de bord |
| GET | `/api/dashboard/statut-zones` | État de toutes les zones |
| GET | `/api/zones` | Liste des zones |
| POST | `/api/zones` | Créer une zone |
| GET | `/api/connexions` | Liste des connexions réseau |
| POST | `/api/releves` | Saisir un relevé |
| POST | `/api/releves/import-csv` | Importer un CSV |
| GET | `/api/analyses/alertes` | Alertes actives |
| POST | `/api/simulations` | Lancer une simulation |
| GET | `/api/simulations/graphe` | Topologie + état temps réel |
| POST | `/api/simulations/{id}/valider` | Valider un plan de redistribution |

---

## 📋 Format CSV pour import

```csv
code_zone,consommation_mw,horodatage
ZN001,45.5,2024-01-15T08:00:00
ZN002,82.3,2024-01-15T08:00:00
ZN003,12.1,2024-01-15T08:00:00
```

---

## ⚙️ Algorithmes implémentés

### Dijkstra
Calcule le chemin de moindre perte (poids = pertes %) entre zones excédentaires et déficitaires. Utilise un tas binaire (heap) pour une complexité O((V+E) log V).

### Bellman-Ford
Gère les cas complexes avec contraintes négatives. Détecte automatiquement les cycles absorbants dans les flux énergétiques. Complexité O(V·E).

### Algorithme Glouton (Greedy)
Heuristique rapide pour les pics de charge : trie les zones par urgence décroissante, associe les excédents disponibles en utilisant Dijkstra pour le chemin minimal.

---

## 🗄️ Structure de la base de données

- **roles** — Profils Administrateur / Gestionnaire
- **utilisateurs** — Comptes avec authentification bcrypt
- **sessions / logs_activite** — Traçabilité complète
- **regions / zones** — Nœuds du graphe avec capacité MW
- **connexions_reseau** — Arêtes avec capacité transit et pertes %
- **releves_consommation** — Données horodatées par zone
- **analyses_charge** — Taux de charge calculé, statut, excédent/déficit
- **alertes** — Alertes automatiques avec workflow acquittement/résolution
- **simulations / transferts_proposes** — Plans de redistribution
- **validations_simulation** — Décisions gestionnaire (approuvée/rejetée)
- **rapports** — Historique des exports
- **parametres_systeme** — Configuration clé/valeur modifiable

---

## 🛡️ Sécurité

- Authentification JWT (Bearer Token)
- Mots de passe hachés avec bcrypt
- Contrôle d'accès par rôle (RBAC)
- CORS configuré pour le frontend
- Logs d'activité complets

---

## 📄 Licence
Projet académique — Système de rééquilibrage énergétique urbain, Madagascar 2024.
