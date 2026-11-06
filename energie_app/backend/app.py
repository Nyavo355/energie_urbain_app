"""
Système de Rééquilibrage Énergétique Urbain
Backend Flask - Point d'entrée principal
"""
from flask import Flask
from extensions import db, bcrypt, jwt
from flask_cors import CORS
from datetime import timedelta
import os




def create_app(config_name=None):
    app = Flask(__name__)

    # ── Configuration ──────────────────────────────────────────
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'energie-urbaine-secret-2024')
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-energie-secret-2024')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=8)

    DB_USER = os.environ.get('DB_USER', 'root')
    DB_PASS = os.environ.get('DB_PASS', '')
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = os.environ.get('DB_PORT', '3306')
    DB_NAME = os.environ.get('DB_NAME', 'energie_urbaine')

    app.config['SQLALCHEMY_DATABASE_URI'] = (
        f'mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # ── Extensions ─────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Blueprints ─────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.zones import zones_bp
    from routes.releves import releves_bp
    from routes.analyses import analyses_bp
    from routes.simulations import simulations_bp
    from routes.rapports import rapports_bp
    from routes.dashboard import dashboard_bp
    from routes.connexions import connexions_bp
    from routes.parametres import parametres_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(parametres_bp, url_prefix='/api/parametres')
    app.register_blueprint(zones_bp, url_prefix='/api/zones')
    app.register_blueprint(releves_bp, url_prefix='/api/releves')
    app.register_blueprint(analyses_bp, url_prefix='/api/analyses')
    app.register_blueprint(simulations_bp, url_prefix='/api/simulations')
    app.register_blueprint(rapports_bp, url_prefix='/api/rapports')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(connexions_bp, url_prefix='/api/connexions')

    @app.route('/api/health')
    def health():
        return {'status': 'ok', 'service': 'Energie Urbaine API'}

    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)
