"""Routes paramètres système"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db, bcrypt
from models.models import ParametreSysteme

parametres_bp = Blueprint('parametres', __name__)


def admin_only():
    uid = int(get_jwt_identity())
    # rôle récupéré via jointure implicite backref
    # On évite d’importer Role pour ne pas casser les imports.
    from models.models import Utilisateur
    current = Utilisateur.query.get_or_404(uid)
    if current.role.nom != 'Administrateur':
        return jsonify({'error': 'Accès refusé'}), 403
    return None


@parametres_bp.route('', methods=['GET'])
@jwt_required()
def lister_parametres():
    admin_resp = admin_only()
    if admin_resp:
        return admin_resp

    params = ParametreSysteme.query.all()
    return jsonify([{
        'cle': p.cle,
        'valeur': p.valeur,
        'type_valeur': p.type_valeur,
        'description': p.description,
        'modifiable_par': p.modifiable_par
    } for p in params])


@parametres_bp.route('', methods=['PUT'])
@jwt_required()
def modifier_parametres():
    admin_resp = admin_only()
    if admin_resp:
        return admin_resp

    data = request.get_json() or {}
    # data attendu: { "seuil_alerte_defaut_pct": "92", ... }
    uid = int(get_jwt_identity())

    updated = []
    for cle, valeur in data.items():
        p = ParametreSysteme.query.filter_by(cle=cle).first()
        if not p:
            continue
        p.valeur = str(valeur)
        # updated_by sera pris en compte via colonne updated_by si présente
        if hasattr(p, 'updated_by'):
            p.updated_by = uid
        updated.append(cle)

    db.session.commit()
    return jsonify({'message': 'Paramètres mis à jour', 'updated': updated})

