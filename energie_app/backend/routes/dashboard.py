"""Routes tableau de bord"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime, timedelta
from sqlalchemy import func
from models.models import Zone, ReleveConsommation, AnalyseCharge, Alerte, Simulation
from extensions import db, bcrypt

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/resume', methods=['GET'])
@jwt_required()
def resume():
    nb_zones = Zone.query.filter_by(actif=True).count()
    nb_alertes = Alerte.query.filter_by(resolue=False).count()

    zones = Zone.query.filter_by(actif=True).all()
    charge_totale, capa_totale = 0, 0
    nb_critiques = 0

    for z in zones:
        r = ReleveConsommation.query.filter_by(zone_id=z.id, valide=True)\
            .order_by(ReleveConsommation.horodatage.desc()).first()
        if r:
            conso = float(r.consommation_mw)
            capa = float(z.capacite_max_mw)
            charge_totale += conso
            capa_totale += capa
            taux = (conso / capa * 100) if capa > 0 else 0
            if taux >= float(z.seuil_alerte_pct):
                nb_critiques += 1

    charge_globale_pct = (charge_totale / capa_totale * 100) if capa_totale > 0 else 0
    nb_simulations = Simulation.query.filter_by(statut='complete').count()

    return jsonify({
        'nb_zones': nb_zones,
        'nb_zones_critiques': nb_critiques,
        'nb_alertes_actives': nb_alertes,
        'charge_globale_pct': round(charge_globale_pct, 1),
        'charge_totale_mw': round(charge_totale, 2),
        'capacite_totale_mw': round(capa_totale, 2),
        'nb_simulations': nb_simulations
    })


@dashboard_bp.route('/consommation-par-heure', methods=['GET'])
@jwt_required()
def consommation_par_heure():
    """Données pour le graphique courbe consommation par heure."""
    heures = request.args.get('heures', 24, type=int)
    zone_id = request.args.get('zone_id', type=int)
    depuis = datetime.utcnow() - timedelta(hours=heures)

    q = ReleveConsommation.query.filter(
        ReleveConsommation.horodatage >= depuis,
        ReleveConsommation.valide == True
    )
    if zone_id:
        q = q.filter_by(zone_id=zone_id)

    releves = q.order_by(ReleveConsommation.horodatage).all()
    data = [{'horodatage': r.horodatage.isoformat(),
             'zone_id': r.zone_id, 'zone_nom': r.zone.nom,
             'consommation_mw': float(r.consommation_mw)} for r in releves]
    return jsonify(data)


@dashboard_bp.route('/statut-zones', methods=['GET'])
@jwt_required()
def statut_zones():
    zones = Zone.query.filter_by(actif=True).all()
    result = []
    for z in zones:
        r = ReleveConsommation.query.filter_by(zone_id=z.id, valide=True)\
            .order_by(ReleveConsommation.horodatage.desc()).first()
        conso = float(r.consommation_mw) if r else 0
        capa = float(z.capacite_max_mw)
        taux = (conso / capa * 100) if capa > 0 else 0
        statut = ('critique' if taux >= 100 else
                  'surchargee' if taux >= float(z.seuil_alerte_pct) else
                  'excedentaire' if taux < 70 else 'normale')
        result.append({
            'zone_id': z.id, 'zone_nom': z.nom, 'zone_code': z.code,
            'consommation_mw': conso, 'capacite_mw': capa,
            'taux_charge_pct': round(taux, 1), 'statut': statut,
            'derniere_maj': r.horodatage.isoformat() if r else None
        })
    return jsonify(result)
