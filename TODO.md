# TODO - Energie Urbaine App

## Étape 1 — Rendre le backend compatible avec l’écran Paramètres
- [x] Ajouter `backend/routes/parametres.py`
- [x] Enregistrer le blueprint dans `backend/app.py` avec `url_prefix='/api/parametres'`

## Étape 2 — Corriger les problèmes d’exécution (à diagnostiquer)
- [ ] Lancer `py app.py` et vérifier `GET http://localhost:5000/api/health`
- [ ] Vérifier que MySQL est bien accessible avec `DB_NAME=energie_urbaine`
- [ ] Si échec: refaire `python init_db.py` (après création DB)

## Étape 3 — Tester le front
- [ ] Lancer `npm start` et vérifier que le login fonctionne
- [ ] Vérifier la page `/parametres`

