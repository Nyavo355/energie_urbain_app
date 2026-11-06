"""
Script d'initialisation : crée les données de base en base
Exécuter une seule fois après création de la DB:
  python init_db.py
"""
from app import create_app, db, bcrypt
from models.models import Role, Utilisateur, SourceImport, ParametreSysteme, Region

def init():
    app = create_app()
    with app.app_context():
        db.create_all()
        print("✅ Tables créées")

        # Rôles
        if not Role.query.first():
            db.session.add_all([
                Role(nom='Administrateur', description='Accès complet',
                     permissions={"users": True, "zones": True, "config": True, "rapports": True, "simulations": True}),
                Role(nom='Gestionnaire', description='Gestion opérationnelle',
                     permissions={"users": False, "zones": True, "config": False, "rapports": True, "simulations": True}),
            ])
            db.session.commit()
            print("✅ Rôles créés")

        # Sources import
        if not SourceImport.query.first():
            db.session.add_all([
                SourceImport(nom='saisie_manuelle', description='Saisie directe via formulaire'),
                SourceImport(nom='csv', description='Import de fichier CSV'),
                SourceImport(nom='excel', description='Import de fichier Excel'),
            ])
            db.session.commit()
            print("✅ Sources import créées")

        # Paramètres système
        if not ParametreSysteme.query.first():
            params = [
                ('seuil_alerte_defaut_pct', '90', 'float', 'Seuil de charge (%) déclenchant une alerte'),
                ('algorithme_defaut', 'dijkstra', 'string', 'Algorithme de rééquilibrage par défaut'),
                ('duree_session_minutes', '480', 'integer', 'Durée de session utilisateur (minutes)'),
                ('max_transfert_mw', '50', 'float', 'Transfert max autorisé par connexion (MW)'),
                ('intervalle_analyse_minutes', '15', 'integer', 'Fréquence d analyse automatique'),
                ('email_alertes_critiques', 'admin@energie.mg', 'string', 'Email destinataire alertes critiques'),
            ]
            db.session.add_all([
                ParametreSysteme(cle=k, valeur=v, type_valeur=t, description=d)
                for k, v, t, d in params
            ])
            db.session.commit()
            print("✅ Paramètres système créés")

        # Régions exemple
        if not Region.query.first():
            db.session.add_all([
                Region(nom='Antananarivo Centre', description='Zone centrale'),
                Region(nom='Antananarivo Nord', description='Zone nord'),
                Region(nom='Antananarivo Sud', description='Zone sud'),
            ])
            db.session.commit()
            print("✅ Régions créées")

        # Compte admin
        if not Utilisateur.query.first():
            role_admin = Role.query.filter_by(nom='Administrateur').first()
            mdp = input("Mot de passe admin (défaut: Admin@2024): ").strip() or "Admin@2024"
            hash_mdp = bcrypt.generate_password_hash(mdp).decode('utf-8')
            admin = Utilisateur(
                nom='Administrateur Système',
                email='admin@energie.mg',
                mot_de_passe_hash=hash_mdp,
                role_id=role_admin.id
            )
            db.session.add(admin)
            db.session.commit()
            print(f"✅ Compte admin créé : admin@energie.mg")

        print("\n🎉 Initialisation terminée ! Lancez: python app.py")

if __name__ == '__main__':
    init()
