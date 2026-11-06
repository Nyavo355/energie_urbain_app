"""Routes analyses de charge"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models.models import AnalyseCharge, Alerte
from extensions import db, bcrypt
from datetime import datetime

analyses_bp = Blueprint('analyses', __name__)

@analyses_bp.route('', methods=['GET'])
@jwt_required()
def liste_analyses():
    zone_id = request.args.get('zone_id', type=int)
    statut = request.args.get('statut')
    limite = request.args.get('limite', 200, type=int)
    q = AnalyseCharge.query
    if zone_id:
        q = q.filter_by(zone_id=zone_id)
    if statut:
        q = q.filter_by(statut=statut)
    analyses = q.order_by(AnalyseCharge.horodatage.desc()).limit(limite).all()
    return jsonify([a.to_dict() for a in analyses])

@analyses_bp.route('/critiques', methods=['GET'])
@jwt_required()
def zones_critiques():
    # Dernière analyse par zone avec statut critique ou surchargee
    from sqlalchemy import func
    from models.models import Zone
    zones_critiques = AnalyseCharge.query.filter(
        AnalyseCharge.statut.in_(['critique', 'surchargee'])
    ).order_by(AnalyseCharge.taux_charge_pct.desc()).limit(50).all()
    return jsonify([a.to_dict() for a in zones_critiques])

@analyses_bp.route('/alertes', methods=['GET'])
@jwt_required()
def liste_alertes():
    resolue = request.args.get('resolue', 'false').lower() == 'true'
    alertes = Alerte.query.filter_by(resolue=resolue).order_by(Alerte.created_at.desc()).limit(100).all()
    return jsonify([a.to_dict() for a in alertes])

@analyses_bp.route('/alertes/<int:alerte_id>/acquitter', methods=['PUT'])
@jwt_required()
def acquitter_alerte(alerte_id):
    from flask_jwt_extended import get_jwt_identity
    uid = int(get_jwt_identity())
    alerte = Alerte.query.get_or_404(alerte_id)
    alerte.acquittee = True
    alerte.acquittee_par = uid
    alerte.acquittee_le = datetime.utcnow()
    db.session.commit()
    return jsonify(alerte.to_dict())

@analyses_bp.route('/alertes/<int:alerte_id>/resoudre', methods=['PUT'])
@jwt_required()
def resoudre_alerte(alerte_id):
    alerte = Alerte.query.get_or_404(alerte_id)
    alerte.resolue = True
    alerte.resolue_le = datetime.utcnow()
    db.session.commit()
    return jsonify(alerte.to_dict())
