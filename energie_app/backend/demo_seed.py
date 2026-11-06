"""
Seed démo : données spectaculaires pour présentation au jury
Exécuter : python demo_seed.py
"""
import json
import math
import random
from datetime import datetime, timedelta
from app import create_app, db, bcrypt
from models.models import (
    Role, Utilisateur, Region, Zone, ConnexionReseau,
    ReleveConsommation, AnalyseCharge, Alerte, SourceImport,
    ImportFichier, Simulation, TransfertPropose, ValidationSimulation,
    Rapport
)
from algorithms.graphe import construire_graphe_depuis_db


def haversine(lat1, lon1, lat2, lon2):
    """Distance en km entre deux points GPS (formule de Haversine)."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def auto_connexions(zones_data, seuil_km=4.0):
    """Génère automatiquement les connexions entre zones proches.

    - zones_data : liste des dicts avec lat, lng, cap, nom
    - seuil_km : distance max pour connecter deux zones
    Retourne une liste de dicts : {src_idx, dst_idx, cap, pertes, type, distance}
    """
    n = len(zones_data)
    connexions = []
    dist_matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            d = haversine(
                zones_data[i]["lat"], zones_data[i]["lng"],
                zones_data[j]["lat"], zones_data[j]["lng"]
            )
            dist_matrix[i][j] = dist_matrix[j][i] = d

    for i in range(n):
        for j in range(i + 1, n):
            d = dist_matrix[i][j]
            if d > seuil_km:
                continue
            cap_moy = (zones_data[i]["cap"] + zones_data[j]["cap"]) / 2
            cap_transit = round(cap_moy * random.uniform(0.3, 0.6), 1)
            pertes = round(d * random.uniform(0.3, 0.6), 1)
            if d > 3.0:
                type_l = "HTB"
            elif d > 1.5:
                type_l = "HTA"
            else:
                type_l = "BT"
            connexions.append({
                "src_idx": i, "dst_idx": j,
                "cap": cap_transit, "pertes": pertes,
                "type": type_l, "distance": round(d, 3)
            })
    return connexions

# Zones avec capacités et consos calculées pour mixer les statuts
ZONES_DATA = [
    #  CRITIQUE (≥100%)
    {"nom": "Anosy",        "code": "ZN001", "lat": -18.9083, "lng": 47.5210, "cap": 85,  "conso": 98,  "region": 0},
    {"nom": "Mahamasina",   "code": "ZN004", "lat": -18.9170, "lng": 47.5170, "cap": 70,  "conso": 82,  "region": 0},
    {"nom": "Ambavahaditokana","code": "ZN010", "lat": -18.9000, "lng": 47.4980, "cap": 75,  "conso": 88,  "region": 1},
    #  SURCHARGÉES (85-99%)
    {"nom": "Analakely",    "code": "ZN002", "lat": -18.9100, "lng": 47.5260, "cap": 65,  "conso": 62,  "region": 0},
    {"nom": "Ambatomaro",   "code": "ZN006", "lat": -18.8760, "lng": 47.5050, "cap": 55,  "conso": 53,  "region": 1},
    {"nom": "Itaosy",       "code": "ZN008", "lat": -18.9260, "lng": 47.5340, "cap": 60,  "conso": 56,  "region": 2},
    #  NORMALES (70-85%)
    {"nom": "Ambohimanarina","code": "ZN003", "lat": -18.8870, "lng": 47.5340, "cap": 50,  "conso": 38,  "region": 0},
    {"nom": "Antohomadinika","code": "ZN012", "lat": -18.9140, "lng": 47.5440, "cap": 48,  "conso": 36,  "region": 0},
    {"nom": "Andravoahangy", "code": "ZN013", "lat": -18.8850, "lng": 47.4790, "cap": 52,  "conso": 40,  "region": 1},
    #  EXCÉDENTAIRES (< 70%)
    {"nom": "Antanimena",   "code": "ZN005", "lat": -18.8970, "lng": 47.4820, "cap": 45,  "conso": 20,  "region": 0},
    {"nom": "Ankadimbahoaka","code": "ZN007", "lat": -18.8810, "lng": 47.5510, "cap": 40,  "conso": 15,  "region": 1},
    {"nom": "Andoharanofotsy","code": "ZN009", "lat": -18.9450, "lng": 47.5100, "cap": 35,  "conso": 10,  "region": 2},
    {"nom": "Isotry",       "code": "ZN011", "lat": -18.9050, "lng": 47.5410, "cap": 30,  "conso": 8,   "region": 0},
    {"nom": "Tanjombato",   "code": "ZN014", "lat": -18.9380, "lng": 47.5110, "cap": 42,  "conso": 18,  "region": 2},
    {"nom": "Ambodivona",   "code": "ZN015", "lat": -18.8920, "lng": 47.5360, "cap": 38,  "conso": 12,  "region": 0},
]

def clear_data(): 
    """Vide les données existantes pour repartir à zéro (ordre FK safe)."""
    for model in [ValidationSimulation, TransfertPropose, Simulation,
                  Alerte, AnalyseCharge, Rapport, ReleveConsommation,
                  ImportFichier, ConnexionReseau, Zone, Region]:
        db.session.query(model).delete()
    db.session.commit()
    print("🗑️ Anciennes données vidées")

def seed():
    app = create_app()
    with app.app_context():
        print("🌱 Démo : Début du seed...\n")

        clear_data()

        # 1. Rôles
        roles = {
            'Administrateur': Role.query.filter_by(nom='Administrateur').first(),
            'Gestionnaire': Role.query.filter_by(nom='Gestionnaire').first(),
        }
        if not roles['Administrateur']:
            roles['Administrateur'] = Role(nom='Administrateur', description='Accès complet',
                permissions={"users": True, "zones": True, "config": True, "rapports": True, "simulations": True})
            roles['Gestionnaire'] = Role(nom='Gestionnaire', description='Gestion opérationnelle',
                permissions={"users": False, "zones": True, "config": False, "rapports": True, "simulations": True})
            db.session.add_all(roles.values())
            db.session.commit()
        print("✅ Rôles ok")

        # 2. Sources import
        if not SourceImport.query.first():
            db.session.add_all([
                SourceImport(nom='saisie_manuelle', description='Saisie directe'),
                SourceImport(nom='csv', description='Fichier CSV'),
            ])
            db.session.commit()
        source = SourceImport.query.filter_by(nom='saisie_manuelle').first()

        # 3. Régions
        regions_data = [
            "Antananarivo Centre", "Antananarivo Nord",
            "Antananarivo Sud", "Antananarivo Est", "Antananarivo Ouest"
        ]
        regions = []
        for nom in regions_data:
            r = Region(nom=nom, description=f"Région {nom}")
            db.session.add(r)
            regions.append(r)
        db.session.commit()
        print(f"✅ {len(regions)} régions créées")

        # 4. Zones
        zone_map = {}
        for i, zd in enumerate(ZONES_DATA):
            reg = regions[zd["region"]]
            z = Zone(
                nom=zd["nom"], code=zd["code"],
                region_id=reg.id,
                capacite_max_mw=zd["cap"],
                seuil_alerte_pct=85,
                latitude=zd["lat"], longitude=zd["lng"],
                description=f"Zone {zd['nom']} — {reg.nom}"
            )
            db.session.add(z)
            db.session.flush()
            zone_map[zd["code"]] = z.id
        db.session.commit()

        all_zones = {z.id: z for z in Zone.query.all()}
        zone_ids = list(all_zones.keys())

        # Créer mapping zone_id → conso de base
        zone_conso_map = {}
        for i, zd in enumerate(ZONES_DATA):
            zone_conso_map[zone_ids[i]] = zd["conso"]

        print(f"✅ {len(zone_ids)} zones créées")
        print("\n📊 STATUTS VISIBLES :")
        for i, zd in enumerate(ZONES_DATA):
            taux = round(zd["conso"] / zd["cap"] * 100, 1)
            emoji = "🔴" if taux >= 100 else "⚠️" if taux >= 85 else "✅" if taux >= 70 else "💧"
            print(f"   {emoji} {zd['code']} {zd['nom']}: {zd['conso']}/{zd['cap']}MW = {taux}%")

        # 5. Connexions automatiques (zones proches = connectées)
        random.seed(42)
        auto_list = auto_connexions(ZONES_DATA, seuil_km=4.0)
        for c in auto_list:
            db.session.add(ConnexionReseau(
                zone_source_id=zone_ids[c["src_idx"]],
                zone_destination_id=zone_ids[c["dst_idx"]],
                capacite_transit_mw=c["cap"], pertes_pct=c["pertes"],
                type_ligne=c["type"], bidirectionnelle=True,
                distance_km=c["distance"]
            ))
        db.session.commit()
        print(f"✅ {len(auto_list)} connexions créées automatiquement (seuil {4.0} km)")

        # 6. Relevés (7 jours, 4 tranches/jour)
        admin = Utilisateur.query.filter_by(email='admin@energie.mg').first()
        if not admin:
            role_admin = roles['Administrateur']
            hash_mdp = bcrypt.generate_password_hash('Admin@2024').decode('utf-8')
            admin = Utilisateur(nom='Administrateur Système', email='admin@energie.mg',
                mot_de_passe_hash=hash_mdp, role_id=role_admin.id)
            db.session.add(admin)
            db.session.commit()

        now = datetime.utcnow()
        releves_batch = []
        for jour in range(7):
            for tranche in [6, 10, 14, 18, 22]:
                h = now - timedelta(days=7 - jour, hours=24 - tranche)
                for zid in zone_ids:
                    base = zone_conso_map.get(zid, 40)
                    variation = base * random.uniform(-0.08, 0.10)
                    conso = max(5, round(base + variation, 2))
                    releves_batch.append(ReleveConsommation(
                        zone_id=zid, consommation_mw=conso,
                        horodatage=h, source_id=source.id,
                        utilisateur_id=admin.id
                    ))
        db.session.bulk_save_objects(releves_batch)
        db.session.commit()
        print(f"✅ {len(releves_batch)} relevés créés (7j × 5 tranches × {len(zone_ids)} zones)")

        # 7. Analyses + Alertes (add() au lieu de bulk pour préserver les defaults)
        from sqlalchemy import func
        analyses_count = 0
        alertes_count = 0
        derniers = db.session.query(
            ReleveConsommation.zone_id,
            func.max(ReleveConsommation.horodatage).label('max_ts')
        ).group_by(ReleveConsommation.zone_id).all()

        for zid, max_ts in derniers:
            r = ReleveConsommation.query.filter_by(zone_id=zid, horodatage=max_ts).first()
            if not r:
                continue
            z = all_zones[zid]
            cap = float(z.capacite_max_mw)
            taux = round(float(r.consommation_mw) / cap * 100, 2)

            if taux >= 100:
                statut = "critique"
            elif taux >= 85:
                statut = "surchargee"
            elif taux < 70:
                statut = "excedentaire"
            else:
                statut = "normale"

            excedent = round(cap - float(r.consommation_mw), 3) if statut == "excedentaire" else 0

            a = AnalyseCharge(
                zone_id=zid, releve_id=r.id, horodatage=r.horodatage,
                taux_charge_pct=taux,
                consommation_mw=float(r.consommation_mw),
                capacite_mw=cap, excedent_mw=excedent, statut=statut
            )
            db.session.add(a)
            db.session.flush()
            analyses_count += 1

            if statut in ("surchargee", "critique"):
                niv = "emergency" if taux >= 120 else ("critical" if taux >= 100 else "warning")
                a_type = "critique" if statut == "critique" else "surcharge"
                msg = f"🔴 Zone {z.nom} en état CRITIQUE ({taux}%)" if statut == "critique" else f"⚠️ Zone {z.nom} en surcharge ({taux}%)"
                db.session.add(Alerte(
                    zone_id=zid, analyse_id=a.id,
                    type_alerte=a_type, niveau=niv,
                    message=msg, taux_charge_pct=taux,
                    resolue=False, acquittee=False
                ))
                alertes_count += 1

        db.session.commit()
        print(f"✅ {analyses_count} analyses, {alertes_count} alertes créées")

        # 8. Simulations avec transferts
        connexions = ConnexionReseau.query.filter_by(actif=True).all()
        zones = Zone.query.filter_by(actif=True).all()

        for algo_name, offset_days in [("dijkstra", 2), ("bellman_ford", 1), ("greedy", 0)]:
            ts = now - timedelta(days=offset_days)
            try:
                releves_actuels = {}
                for z in zones:
                    r = ReleveConsommation.query.filter(
                        ReleveConsommation.zone_id == z.id,
                        ReleveConsommation.valide == True,
                        ReleveConsommation.horodatage <= ts
                    ).order_by(ReleveConsommation.horodatage.desc()).first()
                    if r:
                        releves_actuels[z.id] = float(r.consommation_mw)

                graphe = construire_graphe_depuis_db(zones, connexions, releves_actuels)
                resultat = graphe.calculer_reequilibrage(algo_name)

                sim = Simulation(
                    utilisateur_id=admin.id, algorithme=algo_name,
                    horodatage_analyse=ts,
                    nb_zones_critiques=resultat['nb_zones_critiques'],
                    nb_zones_excedentaires=resultat['nb_zones_excedentaires'],
                    energie_a_redistribuer_mw=resultat['energie_a_redistribuer_mw'],
                    statut="complete" if resultat['transferts'] else "complete",
                    duree_calcul_ms=resultat['duree_calcul_ms'],
                )
                db.session.add(sim)
                db.session.flush()

                for t in resultat['transferts']:
                    db.session.add(TransfertPropose(
                        simulation_id=sim.id,
                        zone_source_id=t['zone_source_id'],
                        zone_destination_id=t['zone_destination_id'],
                        chemin_json=t['chemin_json'],
                        quantite_mw=t['quantite_mw'],
                        pertes_estimees_mw=t['pertes_estimees_mw'],
                        cout_chemin=t.get('cout_chemin'),
                    ))

            except Exception as e:
                print(f"⚠️ Simulation {algo_name}: {e}")
                db.session.add(Simulation(
                    utilisateur_id=admin.id, algorithme=algo_name,
                    horodatage_analyse=ts, statut="echec", notes=str(e)
                ))

        db.session.commit()
        print(f"✅ {Simulation.query.count()} simulations créées")

        # 9. Créer un gestionnaire de démo
        role_gest = roles['Gestionnaire']
        if not Utilisateur.query.filter_by(email='gestionnaire@energie.mg').first():
            hash_mdp = bcrypt.generate_password_hash('Gest@2024').decode('utf-8')
            db.session.add(Utilisateur(
                nom='Jean Rakoto', email='gestionnaire@energie.mg',
                mot_de_passe_hash=hash_mdp, role_id=role_gest.id
            ))
            db.session.commit()
            print("✅ Gestionnaire créé")

        # 10. Rapports de démonstration détaillés
        gest = Utilisateur.query.filter_by(email='gestionnaire@energie.mg').first()
        if gest and Rapport.query.count() == 0:
            now_dt = datetime.utcnow()
            rapports_seed = [
                Rapport(
                    utilisateur_id=gest.id,
                    titre="Plan de rééquilibrage hebdomadaire",
                    type_rapport="historique_reequilibrage",
                    format_export="pdf",
                    statut="genere",
                    contenu={
                        "resume": "Analyse complète des simulations de rééquilibrage. Le plan retenu utilise l'algorithme Dijkstra avec 45.2 MW redistribués.",
                        "sections": [
                            {
                                "titre": "Synthèse des simulations",
                                "type": "statistiques",
                                "donnees": {
                                    "simulations_lancees": 3,
                                    "reussies": 3,
                                    "total_transferts_proposes": 8,
                                    "energie_totale_redistribuee_mw": 45.2,
                                    "meilleur_algorithme": "Dijkstra"
                                }
                            },
                            {
                                "titre": "Plan de rééquilibrage retenu",
                                "type": "plan_action",
                                "donnees": {
                                    "algorithme": "Dijkstra",
                                    "date": now_dt.isoformat(),
                                    "energie_redistribuee_mw": 45.2,
                                    "nombre_transferts": 4,
                                    "transferts": [
                                        {"de": "Ambavahaditokana", "vers": "Anosy", "quantite_mw": 12.5},
                                        {"de": "Antanimena", "vers": "Mahamasina", "quantite_mw": 15.0},
                                        {"de": "Ankadimbahoaka", "vers": "Analakely", "quantite_mw": 10.2},
                                        {"de": "Andoharanofotsy", "vers": "Itaosy", "quantite_mw": 7.5}
                                    ]
                                }
                            },
                            {
                                "titre": "Impact attendu",
                                "type": "statistiques",
                                "donnees": {
                                    "zones_soulagees": 4,
                                    "reduction_charge_moyenne_pct": 18.5,
                                    "pertes_estimees_mw": 2.1,
                                    "cout_total_estime": "1 250 000 Ar"
                                }
                            }
                        ],
                        "plan_action": {
                            "priorite_haute": ["Anosy", "Mahamasina"],
                            "actions_recommandees": [
                                "Déployer le plan Dijkstra immédiatement",
                                "Contacter JIRAMA pour validation des transferts",
                                "Planifier la maintenance des transformateurs à Anosy",
                                "Préparer un rapport de suivi dans 48h"
                            ]
                        },
                        "decisions": [
                            "Adoption de l'algorithme Dijkstra (plus court chemin)",
                            "Priorisation des zones Anosy et Mahamasina (critiques)",
                            "Validation des 4 transferts proposés par l'équipe technique",
                            "Mise en place d'un monitoring renforcé sur les zones concernées"
                        ]
                    }
                ),
                Rapport(
                    utilisateur_id=gest.id,
                    titre="Analyse charge - Parc Antananarivo",
                    type_rapport="charge",
                    format_export="pdf",
                    statut="genere",
                    contenu={
                        "resume": "Rapport d'analyse de charge sur l'ensemble des zones du grand Antananarivo. Charge moyenne de 76.3% avec 3 zones en état critique.",
                        "sections": [
                            {
                                "titre": "Répartition des statuts par zone",
                                "type": "tableau",
                                "colonnes": ["Zone", "Code", "Taux charge", "Consommation (MW)",
                                             "Capacité (MW)", "Excédent (MW)", "Statut"],
                                "lignes": [
                                    ["Anosy", "ZN001", "115.3%", 98, 85, 0, "critique"],
                                    ["Analakely", "ZN002", "95.4%", 62, 65, 0, "surchargee"],
                                    ["Ambohimanarina", "ZN003", "76.0%", 38, 50, 0, "normale"],
                                    ["Mahamasina", "ZN004", "117.1%", 82, 70, 0, "critique"],
                                    ["Antanimena", "ZN005", "44.4%", 20, 45, 25, "excedentaire"],
                                    ["Ambatomaro", "ZN006", "96.4%", 53, 55, 0, "surchargee"],
                                    ["Ankadimbahoaka", "ZN007", "37.5%", 15, 40, 25, "excedentaire"],
                                    ["Itaosy", "ZN008", "93.3%", 56, 60, 0, "surchargee"],
                                    ["Andoharanofotsy", "ZN009", "28.6%", 10, 35, 25, "excedentaire"],
                                    ["Ambavahaditokana", "ZN010", "117.3%", 88, 75, 0, "critique"]
                                ]
                            },
                            {
                                "titre": "Indicateurs clés",
                                "type": "statistiques",
                                "donnees": {
                                    "zones_analysees": 10,
                                    "critiques": 3,
                                    "surchargees": 3,
                                    "normales": 1,
                                    "excedentaires": 3,
                                    "charge_moyenne_pct": 76.3,
                                    "capacite_reserve_totale_mw": 75
                                }
                            }
                        ],
                        "plan_action": {
                            "charge_moyenne_pct": 76.3,
                            "actions_recommandees": [
                                "Rééquilibrer en priorité Anosy, Mahamasina et Ambavahaditokana",
                                "Utiliser la capacité de réserve (75 MW) des zones excédentaires",
                                "Réduire la consommation des zones critiques de 20%"
                            ]
                        }
                    }
                ),
                Rapport(
                    utilisateur_id=gest.id,
                    titre="État des alertes - Rapport quotidien",
                    type_rapport="alertes",
                    format_export="pdf",
                    statut="genere",
                    contenu={
                        "resume": "6 alertes actives non résolues. Intervention urgente requise sur 3 zones en état critique.",
                        "sections": [
                            {
                                "titre": "Alertes actives",
                                "type": "tableau",
                                "colonnes": ["Zone", "Type", "Niveau", "Message", "Taux charge", "Date"],
                                "lignes": [
                                    ["Anosy", "critique", "critical", "Zone Anosy en état CRITIQUE (115.3%)", "115.3%", now_dt.strftime("%Y-%m-%d %H:00")],
                                    ["Mahamasina", "critique", "critical", "Zone Mahamasina en état CRITIQUE (117.1%)", "117.1%", now_dt.strftime("%Y-%m-%d %H:00")],
                                    ["Ambavahaditokana", "critique", "critical", "Zone Ambavahaditokana en état CRITIQUE (117.3%)", "117.3%", now_dt.strftime("%Y-%m-%d %H:00")],
                                    ["Analakely", "surcharge", "warning", "Zone Analakely en surcharge (95.4%)", "95.4%", now_dt.strftime("%Y-%m-%d %H:00")],
                                    ["Ambatomaro", "surcharge", "warning", "Zone Ambatomaro en surcharge (96.4%)", "96.4%", now_dt.strftime("%Y-%m-%d %H:00")],
                                    ["Itaosy", "surcharge", "warning", "Zone Itaosy en surcharge (93.3%)", "93.3%", now_dt.strftime("%Y-%m-%d %H:00")]
                                ]
                            },
                            {
                                "titre": "Répartition par niveau",
                                "type": "statistiques",
                                "donnees": {
                                    "total_alertes": 6,
                                    "critical": 3,
                                    "warning": 3,
                                    "zones_concernees": ["Anosy", "Mahamasina", "Ambavahaditokana", "Analakely", "Ambatomaro", "Itaosy"]
                                }
                            }
                        ],
                        "plan_action": {
                            "total_alertes": 6,
                            "priorites": ["critical", "warning"],
                            "actions_recommandees": [
                                "Intervention immédiate sur Anosy, Mahamasina et Ambavahaditokana",
                                "Déclencher le rééquilibrage d'urgence",
                                "Affecter 3 équipes de maintenance supplémentaires"
                            ]
                        }
                    }
                ),
                Rapport(
                    utilisateur_id=gest.id,
                    titre="Bilan consommation - Zones critiques",
                    type_rapport="consommation",
                    format_export="pdf",
                    statut="genere",
                    contenu={
                        "resume": "Rapport de consommation sur les 10 zones analysées. 3 zones critiques (Anosy, Mahamasina, Ambavahaditokana) avec un taux de charge supérieur à 100%.",
                        "sections": [
                            {
                                "titre": "Consommation par zone",
                                "type": "tableau",
                                "colonnes": ["Zone", "Code", "Moyenne (MW)", "Max (MW)", "Min (MW)",
                                             "Capacité (MW)", "Taux occupation", "# Relevés"],
                                "lignes": [
                                    ["Anosy", "ZN001", 98, 102, 85, 85, "115.3%", 35],
                                    ["Analakely", "ZN002", 62, 68, 50, 65, "95.4%", 35],
                                    ["Ambohimanarina", "ZN003", 38, 45, 30, 50, "76.0%", 35],
                                    ["Mahamasina", "ZN004", 82, 90, 65, 70, "117.1%", 35],
                                    ["Antanimena", "ZN005", 20, 25, 12, 45, "44.4%", 35],
                                    ["Ambatomaro", "ZN006", 53, 58, 42, 55, "96.4%", 35],
                                    ["Ankadimbahoaka", "ZN007", 15, 22, 8, 40, "37.5%", 35],
                                    ["Itaosy", "ZN008", 56, 62, 45, 60, "93.3%", 35],
                                    ["Andoharanofotsy", "ZN009", 10, 15, 5, 35, "28.6%", 35],
                                    ["Ambavahaditokana", "ZN010", 88, 95, 72, 75, "117.3%", 35]
                                ]
                            },
                            {
                                "titre": "Synthèse des statuts",
                                "type": "statistiques",
                                "donnees": {
                                    "total_zones": 10,
                                    "critiques": 3,
                                    "surchargees": 3,
                                    "normales": 1,
                                    "excedentaires": 3,
                                    "consommation_moyenne_totale_mw": 522,
                                    "capacite_totale_mw": 580
                                }
                            },
                            {
                                "titre": "Zones nécessitant une action prioritaire",
                                "type": "priorites",
                                "donnees": [
                                    {"zone": "Anosy", "code": "ZN001", "taux": 115.3, "besoin_mw": 13},
                                    {"zone": "Mahamasina", "code": "ZN004", "taux": 117.1, "besoin_mw": 12},
                                    {"zone": "Ambavahaditokana", "code": "ZN010", "taux": 117.3, "besoin_mw": 13}
                                ]
                            }
                        ],
                        "plan_action": {
                            "priorite_haute": ["Anosy", "Mahamasina", "Ambavahaditokana"],
                            "actions_recommandees": [
                                "Activer le rééquilibrage via l'algorithme Dijkstra",
                                "Contacter les zones excédentaires pour transfert d'énergie",
                                "Planifier une maintenance des zones les plus sollicitées",
                                "Réduire la consommation de pointe de 15%"
                            ]
                        }
                    }
                )
            ]
            for r in rapports_seed:
                r.contenu = json.dumps(r.contenu, ensure_ascii=False, default=str)
                db.session.add(r)
            db.session.commit()
            print(f"✅ {len(rapports_seed)} rapports détaillés créés")

        print("\n" + "=" * 55)
        print("🎉 DÉMO PRÊTE !")
        print("=" * 55)
        print()
        print("🔐 COMPTES :")
        print("   Admin        : admin@energie.mg / Admin@2024")
        print("   Gestionnaire : gestionnaire@energie.mg / Gest@2024")
        print()
        print("📊 RÉSUMÉ DES STATUTS :")
        for i, zd in enumerate(ZONES_DATA):
            taux = round(zd["conso"] / zd["cap"] * 100, 1)
            if taux >= 100:
                print(f"   🔴 {zd['code']} {zd['nom']} → {taux}% CRITIQUE (besoin d'énergie)")
            elif taux >= 85:
                print(f"   ⚠️ {zd['code']} {zd['nom']} → {taux}% SURCHARGÉE")
            elif taux >= 70:
                print(f"   ✅ {zd['code']} {zd['nom']} → {taux}% Normale")
            else:
                print(f"   💧 {zd['code']} {zd['nom']} → {taux}% EXCÉDENTAIRE (énergie disponible)")
        print()
        print("⚡ Simulations disponibles avec transferts proposés")

if __name__ == '__main__':
    seed()
