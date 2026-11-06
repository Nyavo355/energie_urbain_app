"""
Modèles SQLAlchemy - Système Rééquilibrage Énergétique
"""
import json
from app import db
from datetime import datetime


class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.Text)
    permissions = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    utilisateurs = db.relationship('Utilisateur', backref='role', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'nom': self.nom, 'description': self.description,
                'permissions': self.permissions}


class Utilisateur(db.Model):
    __tablename__ = 'utilisateurs'
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    mot_de_passe_hash = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    actif = db.Column(db.Boolean, default=True)
    derniere_connexion = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'nom': self.nom, 'email': self.email,
            'role': self.role.to_dict(), 'actif': self.actif,
            'derniere_connexion': self.derniere_connexion.isoformat() if self.derniere_connexion else None,
            'created_at': self.created_at.isoformat()
        }


class Region(db.Model):
    __tablename__ = 'regions'
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    zones = db.relationship('Zone', backref='region', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'nom': self.nom, 'description': self.description}


class Zone(db.Model):
    __tablename__ = 'zones'
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)
    region_id = db.Column(db.Integer, db.ForeignKey('regions.id'))
    capacite_max_mw = db.Column(db.Numeric(10, 3), nullable=False)
    seuil_alerte_pct = db.Column(db.Numeric(5, 2), default=90.00)
    latitude = db.Column(db.Numeric(10, 7))
    longitude = db.Column(db.Numeric(10, 7))
    actif = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    releves = db.relationship('ReleveConsommation', backref='zone', lazy=True)
    alertes = db.relationship('Alerte', backref='zone', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'nom': self.nom, 'code': self.code,
            'region': self.region.to_dict() if self.region else None,
            'capacite_max_mw': float(self.capacite_max_mw),
            'seuil_alerte_pct': float(self.seuil_alerte_pct),
            'latitude': float(self.latitude) if self.latitude else None,
            'longitude': float(self.longitude) if self.longitude else None,
            'actif': self.actif, 'description': self.description
        }


class ConnexionReseau(db.Model):
    __tablename__ = 'connexions_reseau'
    id = db.Column(db.Integer, primary_key=True)
    zone_source_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    zone_destination_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    capacite_transit_mw = db.Column(db.Numeric(10, 3), nullable=False)
    pertes_pct = db.Column(db.Numeric(5, 3), default=0.000)
    type_ligne = db.Column(db.Enum('HTB', 'HTA', 'BT'), default='HTA')
    distance_km = db.Column(db.Numeric(8, 3))
    bidirectionnelle = db.Column(db.Boolean, default=True)
    actif = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    zone_source = db.relationship('Zone', foreign_keys=[zone_source_id])
    zone_destination = db.relationship('Zone', foreign_keys=[zone_destination_id])

    def to_dict(self):
        return {
            'id': self.id,
            'zone_source': self.zone_source.to_dict(),
            'zone_destination': self.zone_destination.to_dict(),
            'capacite_transit_mw': float(self.capacite_transit_mw),
            'pertes_pct': float(self.pertes_pct),
            'type_ligne': self.type_ligne,
            'distance_km': float(self.distance_km) if self.distance_km else None,
            'bidirectionnelle': self.bidirectionnelle, 'actif': self.actif
        }


class SourceImport(db.Model):
    __tablename__ = 'sources_import'
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.Enum('saisie_manuelle', 'csv', 'excel'), nullable=False)
    description = db.Column(db.String(255))


class ImportFichier(db.Model):
    __tablename__ = 'imports_fichiers'
    id = db.Column(db.Integer, primary_key=True)
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'), nullable=False)
    source_id = db.Column(db.Integer, db.ForeignKey('sources_import.id'), nullable=False)
    nom_fichier = db.Column(db.String(255))
    lignes_totales = db.Column(db.Integer, default=0)
    lignes_ok = db.Column(db.Integer, default=0)
    lignes_erreur = db.Column(db.Integer, default=0)
    statut = db.Column(db.Enum('en_cours', 'succes', 'partiel', 'echec'), default='en_cours')
    erreurs = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'nom_fichier': self.nom_fichier,
            'lignes_totales': self.lignes_totales, 'lignes_ok': self.lignes_ok,
            'lignes_erreur': self.lignes_erreur, 'statut': self.statut,
            'erreurs': self.erreurs, 'created_at': self.created_at.isoformat()
        }


class ReleveConsommation(db.Model):
    __tablename__ = 'releves_consommation'
    id = db.Column(db.BigInteger, primary_key=True)
    zone_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    consommation_mw = db.Column(db.Numeric(10, 3), nullable=False)
    horodatage = db.Column(db.DateTime, nullable=False)
    source_id = db.Column(db.Integer, db.ForeignKey('sources_import.id'), nullable=False)
    import_id = db.Column(db.Integer, db.ForeignKey('imports_fichiers.id'))
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'), nullable=False)
    valide = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'zone_id': self.zone_id,
            'zone_nom': self.zone.nom if self.zone else None,
            'consommation_mw': float(self.consommation_mw),
            'horodatage': self.horodatage.isoformat(),
            'valide': self.valide, 'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }


class AnalyseCharge(db.Model):
    __tablename__ = 'analyses_charge'
    id = db.Column(db.BigInteger, primary_key=True)
    zone_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    releve_id = db.Column(db.BigInteger, db.ForeignKey('releves_consommation.id'), nullable=False)
    horodatage = db.Column(db.DateTime, nullable=False)
    taux_charge_pct = db.Column(db.Numeric(6, 3), nullable=False)
    consommation_mw = db.Column(db.Numeric(10, 3), nullable=False)
    capacite_mw = db.Column(db.Numeric(10, 3), nullable=False)
    excedent_mw = db.Column(db.Numeric(10, 3), default=0)
    statut = db.Column(db.Enum('normale', 'surchargee', 'critique', 'excedentaire'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    zone = db.relationship('Zone', backref='analyses')

    def to_dict(self):
        return {
            'id': self.id, 'zone_id': self.zone_id,
            'zone_nom': self.zone.nom if self.zone else None,
            'horodatage': self.horodatage.isoformat(),
            'taux_charge_pct': float(self.taux_charge_pct),
            'consommation_mw': float(self.consommation_mw),
            'capacite_mw': float(self.capacite_mw),
            'excedent_mw': float(self.excedent_mw),
            'statut': self.statut
        }


class Alerte(db.Model):
    __tablename__ = 'alertes'
    id = db.Column(db.Integer, primary_key=True)
    zone_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    analyse_id = db.Column(db.BigInteger, db.ForeignKey('analyses_charge.id'), nullable=False)
    type_alerte = db.Column(db.Enum('surcharge', 'critique', 'depassement_transit'), nullable=False)
    niveau = db.Column(db.Enum('warning', 'critical', 'emergency'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    taux_charge_pct = db.Column(db.Numeric(6, 3))
    acquittee = db.Column(db.Boolean, default=False)
    acquittee_par = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'))
    acquittee_le = db.Column(db.DateTime)
    resolue = db.Column(db.Boolean, default=False)
    resolue_le = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'zone_id': self.zone_id,
            'zone_nom': self.zone.nom if self.zone else None,
            'type_alerte': self.type_alerte, 'niveau': self.niveau,
            'message': self.message,
            'taux_charge_pct': float(self.taux_charge_pct) if self.taux_charge_pct else None,
            'acquittee': self.acquittee, 'resolue': self.resolue,
            'created_at': self.created_at.isoformat()
        }


class Simulation(db.Model):
    __tablename__ = 'simulations'
    id = db.Column(db.Integer, primary_key=True)
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'), nullable=False)
    algorithme = db.Column(db.Enum('dijkstra', 'bellman_ford', 'greedy'), nullable=False)
    horodatage_analyse = db.Column(db.DateTime, nullable=False)
    nb_zones_critiques = db.Column(db.Integer, default=0)
    nb_zones_excedentaires = db.Column(db.Integer, default=0)
    energie_a_redistribuer_mw = db.Column(db.Numeric(10, 3))
    statut = db.Column(db.Enum('en_cours', 'complete', 'echec', 'validee', 'rejetee'), default='en_cours')
    duree_calcul_ms = db.Column(db.Integer)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    transferts = db.relationship('TransfertPropose', backref='simulation', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'algorithme': self.algorithme,
            'horodatage_analyse': self.horodatage_analyse.isoformat(),
            'nb_zones_critiques': self.nb_zones_critiques,
            'nb_zones_excedentaires': self.nb_zones_excedentaires,
            'energie_a_redistribuer_mw': float(self.energie_a_redistribuer_mw) if self.energie_a_redistribuer_mw else None,
            'statut': self.statut, 'duree_calcul_ms': self.duree_calcul_ms,
            'created_at': self.created_at.isoformat(),
            'transferts': [t.to_dict() for t in self.transferts]
        }


class TransfertPropose(db.Model):
    __tablename__ = 'transferts_proposes'
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulations.id'), nullable=False)
    zone_source_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    zone_destination_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    chemin_json = db.Column(db.JSON, nullable=False)
    quantite_mw = db.Column(db.Numeric(10, 3), nullable=False)
    pertes_estimees_mw = db.Column(db.Numeric(10, 3), default=0)
    cout_chemin = db.Column(db.Numeric(10, 5))
    priorite = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    zone_source = db.relationship('Zone', foreign_keys=[zone_source_id])
    zone_destination = db.relationship('Zone', foreign_keys=[zone_destination_id])

    def to_dict(self):
        return {
            'id': self.id,
            'zone_source': self.zone_source.to_dict(),
            'zone_destination': self.zone_destination.to_dict(),
            'chemin_json': self.chemin_json,
            'quantite_mw': float(self.quantite_mw),
            'pertes_estimees_mw': float(self.pertes_estimees_mw),
            'cout_chemin': float(self.cout_chemin) if self.cout_chemin else None,
            'priorite': self.priorite
        }


class ValidationSimulation(db.Model):
    __tablename__ = 'validations_simulation'
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulations.id'), nullable=False)
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'), nullable=False)
    decision = db.Column(db.Enum('approuvee', 'rejetee', 'modifiee'), nullable=False)
    commentaire = db.Column(db.Text)
    modifications = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ParametreSysteme(db.Model):
    __tablename__ = 'parametres_systeme'
    id = db.Column(db.Integer, primary_key=True)
    cle = db.Column(db.String(100), unique=True, nullable=False)
    valeur = db.Column(db.Text, nullable=False)
    type_valeur = db.Column(db.Enum('string', 'integer', 'float', 'boolean', 'json'), default='string')
    description = db.Column(db.Text)
    modifiable_par = db.Column(db.Enum('admin_only', 'tous'), default='admin_only')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'cle': self.cle, 'valeur': self.valeur,
            'type_valeur': self.type_valeur, 'description': self.description
        }


class LogActivite(db.Model):
    __tablename__ = 'logs_activite'
    id = db.Column(db.BigInteger, primary_key=True)
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'))
    action = db.Column(db.String(100), nullable=False)
    entite = db.Column(db.String(100))
    entite_id = db.Column(db.Integer)
    details = db.Column(db.JSON)
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Rapport(db.Model):
    __tablename__ = 'rapports'
    id = db.Column(db.Integer, primary_key=True)
    utilisateur_id = db.Column(db.Integer, db.ForeignKey('utilisateurs.id'), nullable=False)
    titre = db.Column(db.String(255), nullable=False)
    type_rapport = db.Column(db.Enum('consommation', 'historique_reequilibrage', 'charge', 'alertes'), nullable=False)
    periode_debut = db.Column(db.DateTime)
    periode_fin = db.Column(db.DateTime)
    zones_ids = db.Column(db.JSON)
    format_export = db.Column(db.Enum('pdf', 'csv', 'excel'), default='pdf')
    chemin_fichier = db.Column(db.String(500))
    statut = db.Column(db.Enum('genere', 'en_cours', 'echec'), default='en_cours')
    contenu = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    utilisateur = db.relationship('Utilisateur', backref='rapports')

    def to_dict(self):
        return {
            'id': self.id,
            'titre': self.titre,
            'type_rapport': self.type_rapport,
            'periode_debut': self.periode_debut.isoformat() if self.periode_debut else None,
            'periode_fin': self.periode_fin.isoformat() if self.periode_fin else None,
            'zones_ids': self.zones_ids,
            'format_export': self.format_export,
            'statut': self.statut,
            'contenu': json.loads(self.contenu) if isinstance(self.contenu, str) and self.contenu else self.contenu,
            'created_at': self.created_at.isoformat()
        }
