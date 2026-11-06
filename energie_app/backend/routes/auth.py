"""Routes d'authentification"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from datetime import datetime
from extensions import db, bcrypt
from models.models import Utilisateur, Role, LogActivite

auth_bp = Blueprint('auth', __name__)


def log_action(user_id, action, details=None):
    log = LogActivite(
        utilisateur_id=user_id, action=action,
        details=details,
        ip_address=request.remote_addr
    )
    db.session.add(log)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    mdp = data.get('mot_de_passe', '')

    if not email or not mdp:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    user = Utilisateur.query.filter_by(email=email, actif=True).first()
    if not user or not bcrypt.check_password_hash(user.mot_de_passe_hash, mdp):
        return jsonify({'error': 'Identifiants incorrects'}), 401

    user.derniere_connexion = datetime.utcnow()
    log_action(user.id, 'LOGIN')
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({'access_token': token, 'utilisateur': user.to_dict()})


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    uid = int(get_jwt_identity())
    user = Utilisateur.query.get_or_404(uid)
    return jsonify(user.to_dict())


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    uid = int(get_jwt_identity())
    log_action(uid, 'LOGOUT')
    db.session.commit()
    return jsonify({'message': 'Déconnexion réussie'})


@auth_bp.route('/utilisateurs', methods=['GET'])
@jwt_required()
def liste_utilisateurs():
    uid = int(get_jwt_identity())
    current = Utilisateur.query.get_or_404(uid)
    if current.role.nom != 'Administrateur':
        return jsonify({'error': 'Accès refusé'}), 403
    users = Utilisateur.query.all()
    return jsonify([u.to_dict() for u in users])


@auth_bp.route('/utilisateurs', methods=['POST'])
@jwt_required()
def creer_utilisateur():
    uid = int(get_jwt_identity())
    current = Utilisateur.query.get_or_404(uid)
    if current.role.nom != 'Administrateur':
        return jsonify({'error': 'Accès refusé'}), 403

    data = request.get_json()
    required = ['nom', 'email', 'mot_de_passe', 'role_id']
    if not all(data.get(f) for f in required):
        return jsonify({'error': 'Champs requis manquants'}), 400

    if Utilisateur.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email déjà utilisé'}), 409

    hash_mdp = bcrypt.generate_password_hash(data['mot_de_passe']).decode('utf-8')
    user = Utilisateur(
        nom=data['nom'], email=data['email'].lower(),
        mot_de_passe_hash=hash_mdp, role_id=data['role_id']
    )
    db.session.add(user)
    log_action(uid, 'CREATE_USER', {'email': data['email']})
    db.session.commit()
    return jsonify(user.to_dict()), 201


@auth_bp.route('/utilisateurs/<int:user_id>', methods=['PUT'])
@jwt_required()
def modifier_utilisateur(user_id):
    uid = int(get_jwt_identity())
    current = Utilisateur.query.get_or_404(uid)
    if current.role.nom != 'Administrateur' and uid != user_id:
        return jsonify({'error': 'Accès refusé'}), 403

    user = Utilisateur.query.get_or_404(user_id)
    data = request.get_json()

    if 'nom' in data:
        user.nom = data['nom']
    if 'actif' in data and current.role.nom == 'Administrateur':
        user.actif = data['actif']
    if 'mot_de_passe' in data and data['mot_de_passe']:
        user.mot_de_passe_hash = bcrypt.generate_password_hash(data['mot_de_passe']).decode('utf-8')

    log_action(uid, 'UPDATE_USER', {'user_id': user_id})
    db.session.commit()
    return jsonify(user.to_dict())


@auth_bp.route('/roles', methods=['GET'])
@jwt_required()
def liste_roles():
    roles = Role.query.all()
    return jsonify([r.to_dict() for r in roles])
