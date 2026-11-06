"""Routes zones"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db, bcrypt
from models.models import Zone, Region, Utilisateur, LogActivite

zones_bp = Blueprint('zones', __name__)

def log_action(user_id, action, entite=None, entite_id=None, details=None):
    log = LogActivite(utilisateur_id=user_id, action=action, entite=entite,
                      entite_id=entite_id, details=details, ip_address=request.remote_addr)
    db.session.add(log)

@zones_bp.route('', methods=['GET'])
@jwt_required()
def liste_zones():
    actif = request.args.get('actif', 'true').lower() == 'true'
    zones = Zone.query.filter_by(actif=actif).all() if request.args.get('actif') else Zone.query.all()
    return jsonify([z.to_dict() for z in zones])

@zones_bp.route('/<int:zone_id>', methods=['GET'])
@jwt_required()
def get_zone(zone_id):
    zone = Zone.query.get_or_404(zone_id)
    return jsonify(zone.to_dict())

@zones_bp.route('', methods=['POST'])
@jwt_required()
def creer_zone():
    uid = int(get_jwt_identity())
    data = request.get_json()
    required = ['nom', 'code', 'capacite_max_mw']
    if not all(data.get(f) for f in required):
        return jsonify({'error': 'Champs requis: nom, code, capacite_max_mw'}), 400
    if Zone.query.filter_by(code=data['code'], actif=True).first():
        return jsonify({'error': 'Code zone déjà utilisé'}), 409

    zone = Zone(
        nom=data['nom'], code=data['code'].upper(),
        region_id=data.get('region_id'),
        capacite_max_mw=data['capacite_max_mw'],
        seuil_alerte_pct=data.get('seuil_alerte_pct', 90.0),
        latitude=data.get('latitude'), longitude=data.get('longitude'),
        description=data.get('description')
    )
    db.session.add(zone)
    log_action(uid, 'CREATE_ZONE', 'zones', None, {'code': data['code']})
    db.session.commit()
    return jsonify(zone.to_dict()), 201

@zones_bp.route('/<int:zone_id>', methods=['PUT'])
@jwt_required()
def modifier_zone(zone_id):
    uid = int(get_jwt_identity())
    zone = Zone.query.get_or_404(zone_id)
    data = request.get_json()
    for field in ['nom', 'capacite_max_mw', 'seuil_alerte_pct', 'latitude', 'longitude', 'description', 'actif', 'region_id']:
        if field in data:
            setattr(zone, field, data[field])
    log_action(uid, 'UPDATE_ZONE', 'zones', zone_id)
    db.session.commit()
    return jsonify(zone.to_dict())

@zones_bp.route('/<int:zone_id>', methods=['DELETE'])
@jwt_required()
def supprimer_zone(zone_id):
    uid = int(get_jwt_identity())
    zone = Zone.query.get_or_404(zone_id)
    zone.actif = False
    log_action(uid, 'DELETE_ZONE', 'zones', zone_id)
    db.session.commit()
    return jsonify({'message': 'Zone désactivée'})

@zones_bp.route('/regions', methods=['GET'])
@jwt_required()
def liste_regions():
    regions = Region.query.all()
    return jsonify([r.to_dict() for r in regions])

@zones_bp.route('/regions', methods=['POST'])
@jwt_required()
def creer_region():
    uid = int(get_jwt_identity())
    data = request.get_json()
    if not data.get('nom'):
        return jsonify({'error': 'Nom requis'}), 400
    region = Region(nom=data['nom'], description=data.get('description'))
    db.session.add(region)
    log_action(uid, 'CREATE_REGION')
    db.session.commit()
    return jsonify(region.to_dict()), 201
