-- ============================================================
-- SYSTÈME DE RÉÉQUILIBRAGE ÉNERGÉTIQUE URBAIN
-- Schéma de base de données MySQL / PostgreSQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS energie_urbaine CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE energie_urbaine;

-- ============================================================
-- 1. AUTHENTIFICATION & UTILISATEURS
-- ============================================================

CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(50) NOT NULL UNIQUE,           -- 'Administrateur', 'Gestionnaire'
    description TEXT,
    permissions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE utilisateurs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    actif BOOLEAN DEFAULT TRUE,
    derniere_connexion TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    invalide BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE logs_activite (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    utilisateur_id INT,
    action VARCHAR(100) NOT NULL,
    entite VARCHAR(100),
    entite_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

-- ============================================================
-- 2. TOPOLOGIE DU RÉSEAU (GRAPHE)
-- ============================================================

CREATE TABLE regions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE zones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    region_id INT,
    capacite_max_mw DECIMAL(10,3) NOT NULL,
    seuil_alerte_pct DECIMAL(5,2) DEFAULT 90.00,   -- % capacité déclenchant alerte
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    actif BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (region_id) REFERENCES regions(id)
);

CREATE TABLE connexions_reseau (
    id INT PRIMARY KEY AUTO_INCREMENT,
    zone_source_id INT NOT NULL,
    zone_destination_id INT NOT NULL,
    capacite_transit_mw DECIMAL(10,3) NOT NULL,
    pertes_pct DECIMAL(5,3) DEFAULT 0.000,          -- pertes en %
    type_ligne ENUM('HTB','HTA','BT') DEFAULT 'HTA',
    distance_km DECIMAL(8,3),
    bidirectionnelle BOOLEAN DEFAULT TRUE,
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_source_id) REFERENCES zones(id),
    FOREIGN KEY (zone_destination_id) REFERENCES zones(id),
    UNIQUE KEY uk_connexion (zone_source_id, zone_destination_id)
);

-- ============================================================
-- 3. COLLECTE DES DONNÉES DE CONSOMMATION
-- ============================================================

CREATE TABLE sources_import (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nom ENUM('saisie_manuelle','csv','excel') NOT NULL,
    description VARCHAR(255)
);

CREATE TABLE imports_fichiers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    utilisateur_id INT NOT NULL,
    source_id INT NOT NULL,
    nom_fichier VARCHAR(255),
    chemin_fichier VARCHAR(500),
    lignes_totales INT DEFAULT 0,
    lignes_ok INT DEFAULT 0,
    lignes_erreur INT DEFAULT 0,
    statut ENUM('en_cours','succes','partiel','echec') DEFAULT 'en_cours',
    erreurs TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (source_id) REFERENCES sources_import(id)
);

CREATE TABLE releves_consommation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    zone_id INT NOT NULL,
    consommation_mw DECIMAL(10,3) NOT NULL,
    horodatage TIMESTAMP NOT NULL,
    source_id INT NOT NULL,
    import_id INT NULL,
    utilisateur_id INT NOT NULL,
    valide BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_id) REFERENCES zones(id),
    FOREIGN KEY (source_id) REFERENCES sources_import(id),
    FOREIGN KEY (import_id) REFERENCES imports_fichiers(id),
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
    INDEX idx_zone_horodatage (zone_id, horodatage),
    INDEX idx_horodatage (horodatage)
);

-- ============================================================
-- 4. ANALYSE DE CHARGE & ALERTES
-- ============================================================

CREATE TABLE analyses_charge (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    zone_id INT NOT NULL,
    releve_id BIGINT NOT NULL,
    horodatage TIMESTAMP NOT NULL,
    taux_charge_pct DECIMAL(6,3) NOT NULL,          -- (consommation/capacité)*100
    consommation_mw DECIMAL(10,3) NOT NULL,
    capacite_mw DECIMAL(10,3) NOT NULL,
    excedent_mw DECIMAL(10,3) DEFAULT 0,            -- positif = excédent, négatif = déficit
    statut ENUM('normale','surchargee','critique','excedentaire') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_id) REFERENCES zones(id),
    FOREIGN KEY (releve_id) REFERENCES releves_consommation(id),
    INDEX idx_zone_statut (zone_id, statut),
    INDEX idx_horodatage (horodatage)
);

CREATE TABLE alertes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    zone_id INT NOT NULL,
    analyse_id BIGINT NOT NULL,
    type_alerte ENUM('surcharge','critique','depassement_transit') NOT NULL,
    niveau ENUM('warning','critical','emergency') NOT NULL,
    message TEXT NOT NULL,
    taux_charge_pct DECIMAL(6,3),
    acquittee BOOLEAN DEFAULT FALSE,
    acquittee_par INT NULL,
    acquittee_le TIMESTAMP NULL,
    resolue BOOLEAN DEFAULT FALSE,
    resolue_le TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_id) REFERENCES zones(id),
    FOREIGN KEY (analyse_id) REFERENCES analyses_charge(id),
    FOREIGN KEY (acquittee_par) REFERENCES utilisateurs(id)
);

-- ============================================================
-- 5. SIMULATIONS & RÉÉQUILIBRAGE
-- ============================================================

CREATE TABLE simulations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    utilisateur_id INT NOT NULL,
    algorithme ENUM('dijkstra','bellman_ford','greedy') NOT NULL,
    horodatage_analyse TIMESTAMP NOT NULL,           -- instant simulé
    nb_zones_critiques INT DEFAULT 0,
    nb_zones_excedentaires INT DEFAULT 0,
    energie_a_redistribuer_mw DECIMAL(10,3),
    statut ENUM('en_cours','complete','echec','validee','rejetee') DEFAULT 'en_cours',
    duree_calcul_ms INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE transferts_proposes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    simulation_id INT NOT NULL,
    zone_source_id INT NOT NULL,
    zone_destination_id INT NOT NULL,
    chemin_json TEXT NOT NULL,                       -- liste ordonnée des zones traversées
    quantite_mw DECIMAL(10,3) NOT NULL,
    pertes_estimees_mw DECIMAL(10,3) DEFAULT 0,
    cout_chemin DECIMAL(10,5),                       -- coût Dijkstra (pertes totales)
    priorite INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id),
    FOREIGN KEY (zone_source_id) REFERENCES zones(id),
    FOREIGN KEY (zone_destination_id) REFERENCES zones(id)
);

CREATE TABLE validations_simulation (
    id INT PRIMARY KEY AUTO_INCREMENT,
    simulation_id INT NOT NULL,
    utilisateur_id INT NOT NULL,
    decision ENUM('approuvee','rejetee','modifiee') NOT NULL,
    commentaire TEXT,
    modifications TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id),
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

-- ============================================================
-- 6. RAPPORTS
-- ============================================================

CREATE TABLE rapports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    utilisateur_id INT NOT NULL,
    titre VARCHAR(255) NOT NULL,
    type_rapport ENUM('consommation','historique_reequilibrage','charge','alertes') NOT NULL,
    periode_debut TIMESTAMP,
    periode_fin TIMESTAMP,
    zones_ids TEXT,                                  -- liste des zones concernées
    format_export ENUM('pdf','csv','excel') DEFAULT 'pdf',
    chemin_fichier VARCHAR(500),
    statut ENUM('genere','en_cours','echec') DEFAULT 'en_cours',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

-- ============================================================
-- 7. PARAMÈTRES SYSTÈME
-- ============================================================

CREATE TABLE parametres_systeme (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cle VARCHAR(100) NOT NULL UNIQUE,
    valeur TEXT NOT NULL,
    type_valeur ENUM('string','integer','float','boolean','json') DEFAULT 'string',
    description TEXT,
    modifiable_par ENUM('admin_only','tous') DEFAULT 'admin_only',
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES utilisateurs(id)
);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

INSERT INTO roles (nom, description, permissions) VALUES
('Administrateur', 'Accès complet au système', '{"users":true,"zones":true,"config":true,"rapports":true,"simulations":true}'),
('Gestionnaire', 'Gestion opérationnelle du réseau', '{"users":false,"zones":true,"config":false,"rapports":true,"simulations":true}');

INSERT INTO sources_import (nom, description) VALUES
('saisie_manuelle', 'Saisie directe via formulaire'),
('csv', 'Import de fichier CSV'),
('excel', 'Import de fichier Excel (.xlsx)');

INSERT INTO parametres_systeme (cle, valeur, type_valeur, description) VALUES
('seuil_alerte_defaut_pct', '90', 'float', 'Seuil de charge par défaut déclenchant une alerte (%)'),
('algorithme_defaut', 'dijkstra', 'string', 'Algorithme de rééquilibrage par défaut'),
('duree_session_minutes', '480', 'integer', 'Durée de validité d une session utilisateur (minutes)'),
('max_transfert_mw', '50', 'float', 'Transfert maximum autorisé par connexion (MW)'),
('intervalle_analyse_minutes', '15', 'integer', 'Fréquence d analyse automatique de charge'),
('email_alertes_critiques', 'admin@energie.mg', 'string', 'Email destinataire des alertes critiques');

-- Exemple de région et zones
INSERT INTO regions (nom, description) VALUES
('Antananarivo Centre', 'Zone centrale de la capitale'),
('Antananarivo Nord', 'Zone nord - Ambohimangakely'),
('Antananarivo Sud', 'Zone sud - Andoharanofotsy');

-- Compte admin par défaut (mot de passe: Admin@2024 - à changer)
-- Hash bcrypt généré côté application
INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role_id) VALUES
('Administrateur Système', 'admin@energie.mg', '$2b$12$placeholder_hash_change_in_app', 1);
