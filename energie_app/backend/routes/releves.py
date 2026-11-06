"""Routes relevés de consommation"""
import csv, io
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from extensions import db, bcrypt
from models.models import (ReleveConsommation, Zone, SourceImport, ImportFichier,
                            AnalyseCharge, Alerte, ParametreSysteme)

releves_bp = Blueprint('releves', __name__)


def analyser_releve(releve: ReleveConsommation) -> AnalyseCharge:
    """Crée une AnalyseCharge et des alertes si nécessaire."""
    zone = releve.zone
    conso = float(releve.consommation_mw)
    capa = float(zone.capacite_max_mw)
    taux = (conso / capa * 100) if capa > 0 else 0
    excedent = capa - conso

    if taux >= 100:
        statut = 'critique'
    elif taux >= float(zone.seuil_alerte_pct):
        statut = 'surchargee'
    elif taux < 70:
        statut = 'excedentaire'
    else:
        statut = 'normale'

    analyse = AnalyseCharge(
        zone_id=zone.id, releve_id=releve.id,
        horodatage=releve.horodatage,
        taux_charge_pct=round(taux, 3),
        consommation_mw=conso, capacite_mw=capa,
        excedent_mw=round(excedent, 3), statut=statut
    )
    db.session.add(analyse)
    db.session.flush()

    if statut in ('surchargee', 'critique'):
        niveau = 'emergency' if taux >= 100 else ('critical' if taux >= 95 else 'warning')
        alerte = Alerte(
            zone_id=zone.id, analyse_id=analyse.id,
            type_alerte='critique' if taux >= 100 else 'surcharge',
            niveau=niveau,
            message=f"Zone {zone.nom} : taux de charge {taux:.1f}% ({statut})",
            taux_charge_pct=taux
        )
        db.session.add(alerte)

    return analyse


@releves_bp.route('', methods=['GET'])
@jwt_required()
def liste_releves():
    zone_id = request.args.get('zone_id', type=int)
    limite = request.args.get('limite', 100, type=int)
    q = ReleveConsommation.query.filter_by(valide=True)
    if zone_id:
        q = q.filter_by(zone_id=zone_id)
    releves = q.order_by(ReleveConsommation.horodatage.desc()).limit(limite).all()
    return jsonify([r.to_dict() for r in releves])


@releves_bp.route('', methods=['POST'])
@jwt_required()
def saisir_releve():
    uid = int(get_jwt_identity())
    data = request.get_json()
    required = ['zone_id', 'consommation_mw', 'horodatage']
    if not all(data.get(f) is not None for f in required):
        return jsonify({'error': 'zone_id, consommation_mw, horodatage requis'}), 400

    zone = Zone.query.get_or_404(data['zone_id'])
    source = SourceImport.query.filter_by(nom='saisie_manuelle').first()

    horod = datetime.fromisoformat(data['horodatage'].replace('Z', '+00:00').replace('+00:00', ''))
    releve = ReleveConsommation(
        zone_id=zone.id, consommation_mw=data['consommation_mw'],
        horodatage=horod, source_id=source.id,
        utilisateur_id=uid, notes=data.get('notes')
    )
    db.session.add(releve)
    db.session.flush()
    analyse = analyser_releve(releve)
    db.session.commit()
    return jsonify({'releve': releve.to_dict(), 'analyse': analyse.to_dict()}), 201


@releves_bp.route('/import-csv', methods=['POST'])
@jwt_required()
def import_csv():
    uid = int(get_jwt_identity())
    if 'file' not in request.files:
        return jsonify({'error': 'Fichier manquant'}), 400

    f = request.files['file']
    source = SourceImport.query.filter_by(nom='csv').first()
    imp = ImportFichier(
        utilisateur_id=uid, source_id=source.id,
        nom_fichier=f.filename, statut='en_cours'
    )
    db.session.add(imp)
    db.session.flush()

    stream = io.StringIO(f.stream.read().decode('utf-8-sig'))
    reader = csv.DictReader(stream)
    ok, erreurs = 0, []

    for i, row in enumerate(reader, 1):
        try:
            zone = Zone.query.filter_by(code=row['code_zone'].strip().upper()).first()
            if not zone:
                raise ValueError(f"Zone {row['code_zone']} introuvable")
            conso = float(row['consommation_mw'])
            horod = datetime.fromisoformat(row['horodatage'])
            releve = ReleveConsommation(
                zone_id=zone.id, consommation_mw=conso,
                horodatage=horod, source_id=source.id,
                import_id=imp.id, utilisateur_id=uid
            )
            db.session.add(releve)
            db.session.flush()
            analyser_releve(releve)
            ok += 1
        except Exception as e:
            erreurs.append({'ligne': i, 'erreur': str(e)})

    imp.lignes_totales = ok + len(erreurs)
    imp.lignes_ok = ok
    imp.lignes_erreur = len(erreurs)
    imp.statut = 'succes' if not erreurs else ('partiel' if ok > 0 else 'echec')
    imp.erreurs = erreurs
    db.session.commit()
    return jsonify(imp.to_dict())
