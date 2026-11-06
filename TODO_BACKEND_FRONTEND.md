# TODO - Faire fonctionner le projet (backend + frontend)

## Étapes à faire
1. Vérifier le backend : fichier `energie_app/backend/.env` (à créer depuis `.env.example`).
   - `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_HOST`, `DB_PORT`
   - `SECRET_KEY`, `JWT_SECRET_KEY` (optionnel si valeurs par défaut acceptées)

2. Installer le backend :
   - `cd energie_app/backend`
   - `python -m venv venv`
   - `venv\Scripts\activate`
   - `pip install -r requirements.txt`

3. Initialiser les données applicatives (si nécessaire) :
   - `python init_db.py`

4. Lancer le backend :
   - `python app.py`
   - tester `http://localhost:5000/api/health`

5. Installer le frontend :
   - `cd energie_app/frontend`
   - `npm install`

6. Lancer le frontend :
   - `npm start`
   - tester `http://localhost:3000`

7. Tester le login :
   - `admin@energie.mg`
   - `Admin@2024` (si `init_db.py` a été exécuté avec défaut)

8. Si échec : diagnostiquer l’erreur.
   - erreurs DB => corriger `.env` (DB_NAME/DB_PASS)
   - erreurs tables => réimporter `database/schema.sql` ou relancer `init_db.py`

