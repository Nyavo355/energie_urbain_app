"""Routes connexions réseau"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db, bcrypt
from models.models import ConnexionReseau, Zone

connexions_bp = Blueprint('connexions', __name__)

@connexions_bp.route('', methods=['GET'])
@jwt_required()
def liste_connexions():
    connexions = ConnexionReseau.query.filter_by(actif=True).all()
    return jsonify([c.to_dict() for c in connexions])

@connexions_bp.route('', methods=['POST'])
@jwt_required()
def creer_connexion():
    data = request.get_json()
    required = ['zone_source_id', 'zone_destination_id', 'capacite_transit_mw']
    if not all(data.get(f) for f in required):
        return jsonify({'error': 'Champs requis manquants'}), 400

    Zone.query.get_or_404(data['zone_source_id'])
    Zone.query.get_or_404(data['zone_destination_id'])

    existing = ConnexionReseau.query.filter_by(
        zone_source_id=data['zone_source_id'],
        zone_destination_id=data['zone_destination_id']
    ).first()
    if existing:
        return jsonify({'error': 'Connexion déjà existante'}), 409

    cnx = ConnexionReseau(
        zone_source_id=data['zone_source_id'],
        zone_destination_id=data['zone_destination_id'],
        capacite_transit_mw=data['capacite_transit_mw'],
        pertes_pct=data.get('pertes_pct', 0),
        type_ligne=data.get('type_ligne', 'HTA'),
        distance_km=data.get('distance_km'),
        bidirectionnelle=data.get('bidirectionnelle', True)
    )
    db.session.add(cnx)
    db.session.commit()
    return jsonify(cnx.to_dict()), 201

@connexions_bp.route('/<int:cnx_id>', methods=['PUT'])
@jwt_required()
def modifier_connexion(cnx_id):
    cnx = ConnexionReseau.query.get_or_404(cnx_id)
    data = request.get_json()
    for field in ['capacite_transit_mw', 'pertes_pct', 'type_ligne', 'distance_km', 'bidirectionnelle', 'actif']:
        if field in data:
            setattr(cnx, field, data[field])
    db.session.commit()
    return jsonify(cnx.to_dict())

@connexions_bp.route('/<int:cnx_id>', methods=['DELETE'])
@jwt_required()
def supprimer_connexion(cnx_id):
    cnx = ConnexionReseau.query.get_or_404(cnx_id)
    cnx.actif = False
    db.session.commit()
    return jsonify({'message': 'Connexion désactivée'})
