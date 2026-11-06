from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity
from models.models import Utilisateur

def permission_required(permission):
    """
    Décorateur pour vérifier qu'un utilisateur possède une permission spécifique.
    Usage: @permission_required('manage_users')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = get_jwt_identity()
            if not user_id:
                return jsonify({'error': 'Token invalide'}), 401
            user = Utilisateur.query.get(int(user_id))
            if not user or not user.actif:
                return jsonify({'error': 'Utilisateur inactif ou inexistant'}), 403
            perms = user.role.permissions or {}
            if not perms.get(permission, False):
                return jsonify({'error': f'Permission "{permission}" requise'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator