"""Routes rapports avec génération de contenu détaillé"""
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from extensions import db, bcrypt
from models.models import (
    Rapport, Simulation, TransfertPropose, Zone,
    ReleveConsommation, AnalyseCharge, Alerte, ConnexionReseau
)

rapports_bp = Blueprint('rapports', __name__)

@rapports_bp.route('', methods=['GET'])
@jwt_required()
def liste_rapports():
    rapports = Rapport.query.order_by(Rapport.created_at.desc()).limit(50).all()
    return jsonify([{
        'id': r.id, 'titre': r.titre, 'type_rapport': r.type_rapport,
        'format_export': r.format_export, 'statut': r.statut,
        'created_at': r.created_at.isoformat()
    } for r in rapports])

@rapports_bp.route('/<int:rid>', methods=['GET'])
@jwt_required()
def detail_rapport(rid):
    r = Rapport.query.get_or_404(rid)
    d = r.to_dict()
    u = r.utilisateur
    d['utilisateur_nom'] = u.nom if u else None
    return jsonify(d)

@rapports_bp.route('', methods=['POST'])
@jwt_required()
def generer_rapport():
    uid = int(get_jwt_identity())
    data = request.get_json()
    type_rapport = data.get('type_rapport', 'consommation')
    zones_ids = data.get('zones_ids')
    debut = datetime.fromisoformat(data['periode_debut']) if data.get('periode_debut') else None
    fin = datetime.fromisoformat(data['periode_fin']) if data.get('periode_fin') else None

    contenu = generer_contenu_rapport(type_rapport, zones_ids, debut, fin)

    rapport = Rapport(
        utilisateur_id=uid,
        titre=data.get('titre', 'Rapport'),
        type_rapport=type_rapport,
        periode_debut=debut,
        periode_fin=fin,
        zones_ids=zones_ids,
        format_export=data.get('format_export', 'pdf'),
        statut='genere',
        contenu=json.dumps(contenu, ensure_ascii=False, default=str)
    )
    db.session.add(rapport)
    db.session.commit()
    return jsonify({'id': rapport.id, 'message': 'Rapport créé'}), 201


def generer_contenu_rapport(type_rapport, zones_ids, debut, fin):
    base = {
        'resume': '',
        'sections': [],
        'plan_action': None,
        'decisions': [],
        'generated_at': datetime.utcnow().isoformat()
    }

    if type_rapport == 'consommation':
        return _generer_rapport_consommation(base, zones_ids, debut, fin)
    elif type_rapport == 'historique_reequilibrage':
        return _generer_rapport_reequilibrage(base, zones_ids)
    elif type_rapport == 'charge':
        return _generer_rapport_charge(base, zones_ids)
    elif type_rapport == 'alertes':
        return _generer_rapport_alertes(base, zones_ids)
    return base


def _query_zones(zones_ids=None):
    q = Zone.query.filter_by(actif=True)
    if zones_ids:
        q = q.filter(Zone.id.in_(zones_ids))
    return q.all()


def _generer_rapport_consommation(base, zones_ids, debut, fin):
    zones = _query_zones(zones_ids)
    sections = []
    total_conso = 0
    total_capa = 0
    lignes = []

    for z in zones:
        q = ReleveConsommation.query.filter_by(zone_id=z.id, valide=True)
        if debut:
            q = q.filter(ReleveConsommation.horodatage >= debut)
        if fin:
            q = q.filter(ReleveConsommation.horodatage <= fin)
        stats = q.with_entities(
            db.func.avg(ReleveConsommation.consommation_mw),
            db.func.max(ReleveConsommation.consommation_mw),
            db.func.min(ReleveConsommation.consommation_mw),
            db.func.count(ReleveConsommation.id)
        ).first()
        if stats and stats[0]:
            avg_c, max_c, min_c, nb = stats
            cap = float(z.capacite_max_mw)
            taux = round(avg_c / cap * 100, 1) if cap else 0
            lignes.append({
                'zone': z.nom, 'code': z.code,
                'moyenne_mw': round(avg_c, 2), 'max_mw': round(max_c, 2),
                'min_mw': round(min_c, 2), 'capacite_mw': cap,
                'taux_occupation_pct': taux, 'nb_releves': nb
            })
            total_conso += avg_c
            total_capa += cap

    sections.append({
        'titre': 'Tableau des consommations par zone',
        'type': 'tableau',
        'colonnes': ['Zone', 'Code', 'Moyenne (MW)', 'Max (MW)', 'Min (MW)',
                     'Capacité (MW)', 'Taux occupation', '# Relevés'],
        'lignes': [[l['zone'], l['code'], l['moyenne_mw'], l['max_mw'],
                     l['min_mw'], l['capacite_mw'], f"{l['taux_occupation_pct']}%",
                     l['nb_releves']] for l in lignes]
    })

    if lignes:
        critique = [l for l in lignes if l['taux_occupation_pct'] >= 100]
        surcharge = [l for l in lignes if 85 <= l['taux_occupation_pct'] < 100]
        excedent = [l for l in lignes if l['taux_occupation_pct'] < 70]

        sections.append({
            'titre': 'Synthèse des statuts',
            'type': 'statistiques',
            'donnees': {
                'total_zones': len(lignes),
                'critiques': len(critique),
                'surchargees': len(surcharge),
                'normales': len(lignes) - len(critique) - len(surcharge) - len(excedent),
                'excedentaires': len(excedent),
                'consommation_moyenne_totale_mw': round(total_conso, 2),
                'capacite_totale_mw': round(total_capa, 2)
            }
        })

        zones_critiques = [{'zone': z['zone'], 'code': z['code'],
                            'taux': z['taux_occupation_pct'],
                            'besoin_mw': round(z['capacite_mw'] - z['moyenne_mw'], 2)
                            } for z in critique]
        sections.append({
            'titre': 'Zones nécessitant une action prioritaire',
            'type': 'priorites',
            'donnees': zones_critiques
        })

    total_zones = len(lignes)
    nb_critique = len([l for l in lignes if l['taux_occupation_pct'] >= 100])
    base['resume'] = (
        f"Rapport couvrant {total_zones} zones. "
        f"{nb_critique} zone(s) en situation critique nécessitant un rééquilibrage immédiat. "
        f"Consommation moyenne totale : {round(total_conso, 2)} MW / {round(total_capa, 2)} MW de capacité."
    )
    base['sections'] = sections
    base['plan_action'] = {
        'priorite_haute': [l['zone'] for l in lignes if l['taux_occupation_pct'] >= 100],
        'actions_recommandees': [
            'Activer le rééquilibrage via l\'algorithme Dijkstra',
            'Contacter les zones excédentaires pour transfert d\'énergie',
            'Planifier une maintenance des zones les plus sollicitées'
        ]
    }
    return base


def _generer_rapport_reequilibrage(base, zones_ids):
    sims = Simulation.query.order_by(Simulation.id.desc()).limit(10).all()
    sections = []
    sim_data = []

    for s in sims:
        transferts = TransfertPropose.query.filter_by(simulation_id=s.id).all()
        t_data = []
        total_energie = 0
        for t in transferts:
            src = Zone.query.get(t.zone_source_id)
            dst = Zone.query.get(t.zone_destination_id)
            t_data.append({
                'source': src.nom if src else f'#{t.zone_source_id}',
                'destination': dst.nom if dst else f'#{t.zone_destination_id}',
                'quantite_mw': t.quantite_mw,
                'pertes_mw': t.pertes_estimees_mw,
                'cout': t.cout_chemin
            })
            total_energie += t.quantite_mw

        sim_data.append({
            'id': s.id,
            'algorithme': s.algorithme,
            'statut': s.statut,
            'date': s.horodatage_analyse.isoformat() if s.horodatage_analyse else None,
            'zones_critiques': s.nb_zones_critiques,
            'zones_excedentaires': s.nb_zones_excedentaires,
            'energie_redistribuee_mw': round(total_energie, 2) if total_energie else s.energie_a_redistribuer_mw,
            'duree_ms': s.duree_calcul_ms,
            'transferts': t_data
        })

    sections.append({
        'titre': 'Historique des simulations de rééquilibrage',
        'type': 'simulations',
        'donnees': sim_data
    })

    meilleure_sim = None
    for s in sim_data:
        if s['statut'] == 'complete' and s['transferts']:
            if not meilleure_sim or s['energie_redistribuee_mw'] > meilleure_sim['energie_redistribuee_mw']:
                meilleure_sim = s

    if meilleure_sim:
        sections.append({
            'titre': 'Meilleur plan de rééquilibrage retenu',
            'type': 'plan_action',
            'donnees': {
                'algorithme': meilleure_sim['algorithme'],
                'date': meilleure_sim['date'],
                'energie_redistribuee_mw': meilleure_sim['energie_redistribuee_mw'],
                'nombre_transferts': len(meilleure_sim['transferts']),
                'transferts': [{
                    'de': t['source'], 'vers': t['destination'],
                    'quantite_mw': t['quantite_mw']
                } for t in meilleure_sim['transferts']]
            }
        })

        base['decisions'] = [
            f"Algorithme sélectionné : {meilleure_sim['algorithme'].upper()} "
            f"({meilleure_sim['energie_redistribuee_mw']} MW redistribués)",
            f"Nombre de transferts planifiés : {len(meilleure_sim['transferts'])}",
            "Validation du plan d'action et déploiement progressif"
        ]

    base['resume'] = (
        f"{len(sim_data)} simulation(s) de rééquilibrage analysées. "
        f"{'Meilleur plan trouvé avec ' + meilleure_sim['algorithme'] + ' (' + str(meilleure_sim['energie_redistribuee_mw']) + ' MW redistribués)' if meilleure_sim else 'Aucun plan de rééquilibrage disponible'}"
    )
    base['sections'] = sections
    return base


def _generer_rapport_charge(base, zones_ids):
    zones = _query_zones(zones_ids)
    sections = []
    analyses_list = []

    for z in zones:
        derniere = AnalyseCharge.query.filter_by(zone_id=z.id)\
            .order_by(AnalyseCharge.id.desc()).first()
        if not derniere:
            continue
        analyses_list.append({
            'zone': z.nom, 'code': z.code,
            'taux_charge_pct': derniere.taux_charge_pct,
            'consommation_mw': derniere.consommation_mw,
            'capacite_mw': derniere.capacite_mw,
            'excedent_mw': derniere.excedent_mw or 0,
            'statut': derniere.statut,
            'date': derniere.horodatage.isoformat() if derniere.horodatage else None
        })

    sections.append({
        'titre': 'Analyse de charge par zone',
        'type': 'tableau',
        'colonnes': ['Zone', 'Code', 'Taux charge', 'Conso (MW)',
                     'Capacité (MW)', 'Excédent (MW)', 'Statut'],
        'lignes': [[a['zone'], a['code'], f"{a['taux_charge_pct']}%",
                     a['consommation_mw'], a['capacite_mw'], a['excedent_mw'],
                     a['statut']] for a in analyses_list]
    })

    if analyses_list:
        charge_moy = sum(a['taux_charge_pct'] for a in analyses_list) / len(analyses_list)
        sections.append({
            'titre': 'Indicateurs globaux de charge',
            'type': 'statistiques',
            'donnees': {
                'charge_moyenne_pct': round(charge_moy, 1),
                'zones_analysees': len(analyses_list),
                'capacite_reserve_totale_mw': round(
                    sum(a['excedent_mw'] for a in analyses_list if a['statut'] == 'excedentaire'), 2
                )
            }
        })

    base['resume'] = (
        f"Analyse de charge sur {len(analyses_list)} zone(s). "
        f"Charge moyenne : {round(charge_moy, 1) if analyses_list else 0}%. "
        f"{len([a for a in analyses_list if a['statut'] == 'critique'])} zone(s) en état critique."
    )
    base['sections'] = sections
    base['plan_action'] = {
        'charge_moyenne_pct': round(charge_moy, 1) if analyses_list else 0,
        'actions_recommandees': [
            'Réduire la charge des zones critiques par rééquilibrage',
            'Optimiser la distribution depuis les zones excédentaires',
            'Planifier des audits énergétiques pour les zones en surcharge'
        ]
    }
    return base


def _generer_rapport_alertes(base, zones_ids):
    alertes = Alerte.query.filter_by(resolue=False)\
        .order_by(Alerte.created_at.desc()).limit(50).all()
    sections = []
    alertes_list = []

    for a in alertes:
        z = Zone.query.get(a.zone_id)
        alertes_list.append({
            'id': a.id,
            'zone': z.nom if z else f'#{a.zone_id}',
            'type': a.type_alerte,
            'niveau': a.niveau,
            'message': a.message,
            'taux_charge': a.taux_charge_pct,
            'date': a.created_at.isoformat() if a.created_at else None
        })

    sections.append({
        'titre': 'Alertes actives',
        'type': 'tableau',
        'colonnes': ['Zone', 'Type', 'Niveau', 'Message', 'Taux charge', 'Date'],
        'lignes': [[a['zone'], a['type'], a['niveau'],
                     a['message'], f"{a['taux_charge']}%" if a['taux_charge'] else '-',
                     a['date']] for a in alertes_list]
    })

    if alertes_list:
        par_niveau = {}
        for a in alertes_list:
            par_niveau[a['niveau']] = par_niveau.get(a['niveau'], 0) + 1
        sections.append({
            'titre': 'Répartition des alertes par niveau',
            'type': 'statistiques',
            'donnees': {
                'total_alertes': len(alertes_list),
                'par_niveau': par_niveau,
                'zones_les_plus_alertees': list(set(a['zone'] for a in alertes_list))
            }
        })

    base['resume'] = (
        f"{len(alertes_list)} alerte(s) active(s) non résolue(s). "
        f"Intervention prioritaire recommandée sur les zones critiques."
    )
    base['sections'] = sections
    base['plan_action'] = {
        'total_alertes': len(alertes_list),
        'priorites': sorted(set(a['niveau'] for a in alertes_list)),
        'actions_recommandees': [
            'Traiter les alertes de niveau "emergency" en priorité',
            'Déclencher le rééquilibrage pour les zones en surcharge critique',
            'Affecter des équipes de maintenance sur site'
        ]
    }
    return base
