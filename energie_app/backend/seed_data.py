"""
Seed : insère des données de test complètes
Exécuter APRÈS init_db.py :
  python seed_data.py
"""
import json
import math
import random
from datetime import datetime, timedelta
from app import create_app, db, bcrypt
from models.models import (
    Role, Utilisateur, Region, Zone, ConnexionReseau,
    ReleveConsommation, AnalyseCharge, Alerte, SourceImport,
    Simulation, TransfertPropose
)
from algorithms.graphe import construire_graphe_depuis_db

ZONES_DATA = [
    {"nom": "Anosy", "code": "ZN001", "lat": -18.9083, "lng": 47.5210, "cap": 85, "region": 0},
    {"nom": "Analakely", "code": "ZN002", "lat": -18.9100, "lng": 47.5260, "cap": 65, "region": 0},
    {"nom": "Ambohimanarina", "code": "ZN003", "lat": -18.8870, "lng": 47.5340, "cap": 50, "region": 0},
    {"nom": "Mahamasina", "code": "ZN004", "lat": -18.9170, "lng": 47.5170, "cap": 70, "region": 0},
    {"nom": "Antanimena", "code": "ZN005", "lat": -18.8970, "lng": 47.4820, "cap": 45, "region": 0},
    {"nom": "Ambatomaro", "code": "ZN006", "lat": -18.8760, "lng": 47.5050, "cap": 55, "region": 1},
    {"nom": "Ankadimbahoaka", "code": "ZN007", "lat": -18.8810, "lng": 47.5510, "cap": 40, "region": 1},
    {"nom": "Itaosy", "code": "ZN008", "lat": -18.9260, "lng": 47.5340, "cap": 60, "region": 2},
    {"nom": "Andoharanofotsy", "code": "ZN009", "lat": -18.9450, "lng": 47.5100, "cap": 35, "region": 2},
    {"nom": "Ambavahaditokana", "code": "ZN010", "lat": -18.9000, "lng": 47.4980, "cap": 75, "region": 1},
    {"nom": "Isotry", "code": "ZN011", "lat": -18.9050, "lng": 47.5410, "cap": 30, "region": 0},
    {"nom": "Antohomadinika", "code": "ZN012", "lat": -18.9140, "lng": 47.5440, "cap": 48, "region": 0},
    {"nom": "Andravoahangy", "code": "ZN013", "lat": -18.8850, "lng": 47.4790, "cap": 52, "region": 1},
    {"nom": "Tanjombato", "code": "ZN014", "lat": -18.9380, "lng": 47.5110, "cap": 42, "region": 2},
    {"nom": "Ambodivona", "code": "ZN015", "lat": -18.8920, "lng": 47.5360, "cap": 38, "region": 0},
]


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def auto_connexions(zones_data, seuil_km=4.0):
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


def seed():
    app = create_app()
    with app.app_context():
        print("🌱 Début du seed...\n")

        # 1. Créer un gestionnaire
        role_gestion = Role.query.filter_by(nom='Gestionnaire').first()
        if not Utilisateur.query.filter_by(email='gestionnaire@energie.mg').first():
            hash_mdp = bcrypt.generate_password_hash('Gest@2024').decode('utf-8')
            db.session.add(Utilisateur(
                nom='Jean Rakoto',
                email='gestionnaire@energie.mg',
                mot_de_passe_hash=hash_mdp,
                role_id=role_gestion.id
            ))
            print("✅ Gestionnaire créé : gestionnaire@energie.mg / Gest@2024")
        else:
            print("ℹ️ Gestionnaire déjà existant")

        # 2. Créer régions supplémentaires
        regions_extra = [
            "Antananarivo Est", "Antananarivo Ouest",
            "Toamasina Urbain", "Antsirabe Centre", "Fianarantsoa Ville"
        ]
        existing_regions = {r.nom for r in Region.query.all()}
        for nom in regions_extra:
            if nom not in existing_regions:
                db.session.add(Region(nom=nom, description=f"Région {nom}"))
        db.session.commit()
        all_regions = Region.query.all()
        print(f"✅ {Region.query.count()} régions disponibles")

        # 3. Créer zones
        for zd in ZONES_DATA:
            existing = Zone.query.filter_by(code=zd["code"]).first()
            if not existing:
                reg = all_regions[zd["region"]]
                db.session.add(Zone(
                    nom=zd["nom"], code=zd["code"],
                    region_id=reg.id,
                    capacite_max_mw=zd["cap"],
                    seuil_alerte_pct=85,
                    latitude=zd["lat"], longitude=zd["lng"],
                    description=f"Zone {zd['nom']} — {reg.nom}"
                ))
        db.session.commit()
        all_zones = {z.id: z for z in Zone.query.all()}
        zone_ids = list(all_zones.keys())
        print(f"✅ {Zone.query.count()} zones créées")

        # 4. Connexions automatiques (zones proches = connectées)
        if ConnexionReseau.query.count() == 0:
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
        print(f"✅ {ConnexionReseau.query.count()} connexions créées automatiquement (seuil {4.0} km)")

        # 5. Créer relevés (30 jours, 4 tranches/jour)
        source_manuelle = SourceImport.query.filter_by(nom='saisie_manuelle').first()
        admin = Utilisateur.query.filter_by(email='admin@energie.mg').first()
        if ReleveConsommation.query.count() == 0:
            now = datetime.utcnow()
            base_consos = {
                zone_ids[0]: 72, zone_ids[1]: 58, zone_ids[2]: 42,
                zone_ids[3]: 62, zone_ids[4]: 38, zone_ids[5]: 48,
                zone_ids[6]: 34, zone_ids[7]: 52, zone_ids[8]: 30,
                zone_ids[9]: 65, zone_ids[10]: 25, zone_ids[11]: 40,
                zone_ids[12]: 44, zone_ids[13]: 36, zone_ids[14]: 32,
            }
            releves_batch = []
            for jour in range(30):
                for tranche in [6, 12, 18, 22]:
                    h = now - timedelta(days=30 - jour, hours=24 - tranche)
                    for zid in zone_ids:
                        base = base_consos.get(zid, 40)
                        variation = base * random.uniform(-0.15, 0.20)
                        conso = max(5, round(base + variation, 2))
                        releves_batch.append(ReleveConsommation(
                            zone_id=zid, consommation_mw=conso,
                            horodatage=h, source_id=source_manuelle.id,
                            utilisateur_id=admin.id
                        ))
            db.session.bulk_save_objects(releves_batch)
            db.session.commit()
            total_releves = ReleveConsommation.query.count()
            print(f"✅ {total_releves} relevés créés (30j × 4 tranches × {len(zone_ids)} zones)")

        # 6. Analyser et créer alertes
        from sqlalchemy import func
        if AnalyseCharge.query.count() == 0:
            analyses_batch = []
            alertes_batch = []
            types_alertes = []
            derniers = db.session.query(
                ReleveConsommation.zone_id,
                func.max(ReleveConsommation.horodatage).label('max_ts')
            ).group_by(ReleveConsommation.zone_id).all()

            for zid, max_ts in derniers:
                r = ReleveConsommation.query.filter_by(
                    zone_id=zid, horodatage=max_ts
                ).first()
                if not r:
                    continue
                z = all_zones[zid]
                cap = float(z.capacite_max_mw)
                taux = round(float(r.consommation_mw) / cap * 100, 2)
                if taux >= 100:
                    statut = "critique"
                elif taux >= 85:
                    statut = "surchargee"
                elif taux < 50:
                    statut = "excedentaire"
                else:
                    statut = "normale"
                excedent = round(cap - float(r.consommation_mw), 3) if statut == "excedentaire" else 0

                analyses_batch.append(AnalyseCharge(
                    zone_id=zid, releve_id=r.id,
                    horodatage=r.horodatage,
                    taux_charge_pct=taux,
                    consommation_mw=float(r.consommation_mw),
                    capacite_mw=cap, excedent_mw=excedent,
                    statut=statut
                ))

                if statut in ("surchargee", "critique"):
                    niv = "emergency" if taux >= 120 else ("critical" if taux >= 100 else "warning")
                    types_alertes.append((zid, r.id, r.horodatage, taux, statut, niv))

            db.session.bulk_save_objects(analyses_batch)
            db.session.commit()

            for zid, rid, ts, taux, st, niv in types_alertes:
                z = all_zones[zid]
                if st == "critique":
                    msg = f"Zone {z.nom} en état CRITIQUE — taux de charge {taux}%"
                else:
                    msg = f"Zone {z.nom} en surcharge — taux {taux}%"
                a_type = "critique" if st == "critique" else "surcharge"
                last = AnalyseCharge.query.filter_by(
                    zone_id=zid, horodatage=ts
                ).first()
                if last:
                    alertes_batch.append(Alerte(
                        zone_id=zid, analyse_id=last.id,
                        type_alerte=a_type, niveau=niv,
                        message=msg, taux_charge_pct=taux
                    ))
            if alertes_batch:
                db.session.bulk_save_objects(alertes_batch)
                db.session.commit()
            print(f"✅ {len(analyses_batch)} analyses, {len(alertes_batch)} alertes créées")
        else:
            print(f"ℹ️ {AnalyseCharge.query.count()} analyses existantes")

        # 7. Créer simulations de test via GrapheReseau
        if Simulation.query.count() == 0:
            connexions = ConnexionReseau.query.filter_by(actif=True).all()
            zones = Zone.query.filter_by(actif=True).all()

            now = datetime.utcnow()
            for algo_name, offset_days in [
                ("dijkstra", 5), ("bellman_ford", 3), ("greedy", 1)
            ]:
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
                        utilisateur_id=admin.id,
                        algorithme=algo_name,
                        horodatage_analyse=ts,
                        nb_zones_critiques=resultat['nb_zones_critiques'],
                        nb_zones_excedentaires=resultat['nb_zones_excedentaires'],
                        energie_a_redistribuer_mw=resultat['energie_a_redistribuer_mw'],
                        statut="complete",
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
                    print(f"⚠️ Simulation {algo_name} échouée: {e}")
                    db.session.add(Simulation(
                        utilisateur_id=admin.id, algorithme=algo_name,
                        horodatage_analyse=ts, statut="echec",
                        notes=str(e)
                    ))
            db.session.commit()
            print(f"✅ {Simulation.query.count()} simulations créées")
        else:
            print(f"ℹ️ {Simulation.query.count()} simulations existantes")

        print("\n" + "=" * 50)
        print("🎉 Seed terminé !")
        print("=" * 50)
        print()
        print("📋 Comptes de test :")
        print("   Admin        : admin@energie.mg / Admin@2024")
        print("   Gestionnaire : gestionnaire@energie.mg / Gest@2024")
        print()
        print("📊 Données insérées :")
        print(f"   • {Region.query.count()} régions")
        print(f"   • {Zone.query.count()} zones électriques")
        print(f"   • {ConnexionReseau.query.count()} connexions")
        print(f"   • {ReleveConsommation.query.count()} relevés de consommation")
        print(f"   • {AnalyseCharge.query.count()} analyses de charge")
        print(f"   • {Alerte.query.count()} alertes")
        print(f"   • {Simulation.query.count()} simulations")

if __name__ == '__main__':
    seed()
