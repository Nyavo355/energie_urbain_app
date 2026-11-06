"""Routes simulations de rééquilibrage"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from extensions import db, bcrypt
from models.models import (Simulation, TransfertPropose, ValidationSimulation,
                            Zone, ConnexionReseau, ReleveConsommation, Alerte, SourceImport)
from algorithms.graphe import construire_graphe_depuis_db

simulations_bp = Blueprint('simulations', __name__)


def get_releves_actuels(horodatage=None):
    """Retourne le dernier relevé connu par zone à un instant donné."""
    from sqlalchemy import func
    zones = Zone.query.filter_by(actif=True).all()
    releves = {}
    for zone in zones:
        q = ReleveConsommation.query.filter_by(zone_id=zone.id, valide=True)
        if horodatage:
            q = q.filter(ReleveConsommation.horodatage <= horodatage)
        releve = q.order_by(ReleveConsommation.horodatage.desc()).first()
        if releve:
            releves[zone.id] = float(releve.consommation_mw)
    return releves


@simulations_bp.route('', methods=['GET'])
@jwt_required()
def liste_simulations():
    simulations = Simulation.query.order_by(Simulation.created_at.desc()).limit(50).all()
    return jsonify([s.to_dict() for s in simulations])


@simulations_bp.route('', methods=['POST'])
@jwt_required()
def lancer_simulation():
    uid = int(get_jwt_identity())
    data = request.get_json()
    algorithme = data.get('algorithme', 'dijkstra')
    if algorithme not in ('dijkstra', 'bellman_ford', 'greedy'):
        return jsonify({'error': 'Algorithme invalide'}), 400

    horodatage_str = data.get('horodatage_analyse')
    horodatage = datetime.fromisoformat(horodatage_str) if horodatage_str else datetime.utcnow()

    zone_critique_id = data.get('zone_critique_id')
    quantite_mw = data.get('quantite_mw')

    sim = Simulation(
        utilisateur_id=uid, algorithme=algorithme,
        horodatage_analyse=horodatage, statut='en_cours',
        notes=f"zone_critique_id={zone_critique_id}, quantite_mw={quantite_mw}"
    )
    db.session.add(sim)
    db.session.flush()

    try:
        zones = Zone.query.filter_by(actif=True).all()
        connexions = ConnexionReseau.query.filter_by(actif=True).all()
        releves = get_releves_actuels(horodatage)

        # Override: make the selected zone appear to need quantite_mw MW
        if zone_critique_id and quantite_mw and quantite_mw > 0:
            zone_crit = Zone.query.get(zone_critique_id)
            if zone_crit:
                capa = float(zone_crit.capacite_max_mw)
                # Set consommation so deficit = quantite_mw / 0.9 (algorithm uses *0.9)
                besoin_artificiel = quantite_mw / 0.9
                releves[zone_critique_id] = capa + besoin_artificiel

        graphe = construire_graphe_depuis_db(zones, connexions, releves)
        resultat = graphe.calculer_reequilibrage(algorithme)

        sim.nb_zones_critiques = resultat['nb_zones_critiques']
        sim.nb_zones_excedentaires = resultat['nb_zones_excedentaires']
        sim.energie_a_redistribuer_mw = resultat['energie_a_redistribuer_mw']
        sim.duree_calcul_ms = resultat['duree_calcul_ms']
        sim.statut = 'complete'

        for t in resultat['transferts']:
            transfert = TransfertPropose(
                simulation_id=sim.id,
                zone_source_id=t['zone_source_id'],
                zone_destination_id=t['zone_destination_id'],
                chemin_json=t['chemin_json'],
                quantite_mw=t['quantite_mw'],
                pertes_estimees_mw=t['pertes_estimees_mw'],
                cout_chemin=t.get('cout_chemin')
            )
            db.session.add(transfert)

        db.session.commit()
        return jsonify(sim.to_dict()), 201

    except Exception as e:
        sim.statut = 'echec'
        db.session.commit()
        return jsonify({'error': str(e), 'simulation_id': sim.id}), 500


@simulations_bp.route('/<int:sim_id>', methods=['GET', 'DELETE', 'POST'])
@jwt_required()
def simulation_handler(sim_id):
    if request.method == 'GET':
        sim = Simulation.query.get_or_404(sim_id)
        return jsonify(sim.to_dict())

    # DELETE or POST — supprimer
    sim = Simulation.query.get_or_404(sim_id)
    TransfertPropose.query.filter_by(simulation_id=sim.id).delete()
    ValidationSimulation.query.filter_by(simulation_id=sim.id).delete()
    db.session.delete(sim)
    db.session.commit()
    return jsonify({'message': 'Simulation supprimée'})


@simulations_bp.route('/<int:sim_id>/valider', methods=['POST'])
@jwt_required()
def valider_simulation(sim_id):
    uid = int(get_jwt_identity())
    sim = Simulation.query.get_or_404(sim_id)
    data = request.get_json()
    decision = data.get('decision')
    if decision not in ('approuvee', 'rejetee', 'modifiee'):
        return jsonify({'error': 'Décision invalide'}), 400

    if decision == 'approuvee':
        now = datetime.utcnow()
        source_saisie = SourceImport.query.filter_by(nom='saisie_manuelle').first()
        if not source_saisie:
            source_saisie = SourceImport(nom='saisie_manuelle', description='Saisie manuelle')
            db.session.add(source_saisie)
            db.session.flush()

        # Get latest consumption for all zones involved
        for transfert in sim.transferts:
            src_id = transfert.zone_source_id
            dst_id = transfert.zone_destination_id
            qty = float(transfert.quantite_mw)

            for zid in (src_id, dst_id):
                dernier = ReleveConsommation.query\
                    .filter_by(zone_id=zid, valide=True)\
                    .order_by(ReleveConsommation.horodatage.desc()).first()
                conso_actuelle = float(dernier.consommation_mw) if dernier else 0

                if zid == src_id:
                    nouvelle_conso = conso_actuelle + qty
                else:
                    nouvelle_conso = max(0, conso_actuelle - qty)

                relevé = ReleveConsommation(
                    zone_id=zid,
                    consommation_mw=nouvelle_conso,
                    horodatage=now,
                    source_id=source_saisie.id,
                    utilisateur_id=uid,
                    valide=True,
                    notes=f'Après simulation #{sim_id} approuvée'
                )
                db.session.add(relevé)

            # Resolve alerts for the destination zone
            Alerte.query.filter_by(zone_id=dst_id, resolue=False)\
                .update({'resolue': True, 'resolue_le': now})

    validation = ValidationSimulation(
        simulation_id=sim_id, utilisateur_id=uid,
        decision=decision, commentaire=data.get('commentaire'),
        modifications=data.get('modifications')
    )
    sim.statut = 'validee' if decision == 'approuvee' else 'rejetee'
    db.session.add(validation)
    db.session.commit()
    return jsonify({'message': f'Simulation {decision}', 'simulation': sim.to_dict()})


@simulations_bp.route('/graphe', methods=['GET'])
@jwt_required()
def get_graphe():
    """Retourne la topologie du réseau pour visualisation."""
    zones = Zone.query.filter_by(actif=True).all()
    connexions = ConnexionReseau.query.filter_by(actif=True).all()
    releves = get_releves_actuels()

    noeuds = []
    for z in zones:
        conso = releves.get(z.id, 0)
        capa = float(z.capacite_max_mw)
        taux = (conso / capa * 100) if capa > 0 else 0
        statut = ('critique' if taux >= 100 else
                  'surchargee' if taux >= float(z.seuil_alerte_pct) else
                  'excedentaire' if taux < 70 else 'normale')
        noeuds.append({
            'id': z.id, 'nom': z.nom, 'code': z.code,
            'capacite_mw': capa, 'capacite_max_mw': capa,
            'consommation_mw': conso,
            'taux_charge': round(taux, 1), 'taux_charge_pct': round(taux, 1),
            'statut': statut,
            'latitude': float(z.latitude) if z.latitude else None,
            'longitude': float(z.longitude) if z.longitude else None
        })

    aretes = [c.to_dict() for c in connexions]
    return jsonify({'noeuds': noeuds, 'aretes': aretes})
