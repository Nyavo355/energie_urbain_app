"""
Algorithmes de rééquilibrage énergétique
- Dijkstra : chemin optimal (min pertes)
- Bellman-Ford : gère poids négatifs / détection cycles
- Greedy : heuristique rapide pour pics de charge
"""
import heapq
import math
from typing import Dict, List, Tuple, Optional


class GrapheReseau:
    """
    Représente le réseau électrique comme un graphe orienté pondéré.
    Nœuds = zones, Arêtes = connexions avec poids = pertes (%).
    """

    def __init__(self):
        self.adjacence: Dict[int, List[Tuple[int, float, int]]] = {}
        # {zone_id: [(voisin_id, poids_pertes, connexion_id), ...]}
        self.zones: Dict[int, dict] = {}
        # {zone_id: {nom, capacite, consommation, excedent, statut}}

    def ajouter_zone(self, zone_id: int, nom: str, capacite_mw: float,
                     consommation_mw: float = 0, seuil_alerte_pct: float = 80):
        excedent = capacite_mw - consommation_mw
        taux = (consommation_mw / capacite_mw * 100) if capacite_mw > 0 else 0
        statut = ('excedentaire' if taux < 50 else
                  'normale' if taux < seuil_alerte_pct else
                  'surchargee' if taux < 100 else 'critique')
        self.zones[zone_id] = {
            'nom': nom, 'capacite_mw': capacite_mw,
            'consommation_mw': consommation_mw,
            'excedent_mw': excedent, 'taux_charge': taux, 'statut': statut
        }
        if zone_id not in self.adjacence:
            self.adjacence[zone_id] = []

    def ajouter_connexion(self, src: int, dst: int, pertes_pct: float,
                          capacite_mw: float, connexion_id: int,
                          bidirectionnelle: bool = True):
        poids = pertes_pct if pertes_pct > 0 else 0.001  # évite poids nul
        self.adjacence.setdefault(src, []).append((dst, poids, connexion_id))
        if bidirectionnelle:
            self.adjacence.setdefault(dst, []).append((src, poids, connexion_id))

    # ── Dijkstra ───────────────────────────────────────────────
    def dijkstra(self, source: int) -> Tuple[Dict[int, float], Dict[int, Optional[int]]]:
        """
        Retourne (distances, predecesseurs) depuis la source.
        distances[v] = coût minimum (pertes cumulées) pour atteindre v.
        """
        dist = {n: math.inf for n in self.adjacence}
        pred = {n: None for n in self.adjacence}
        dist[source] = 0
        heap = [(0, source)]

        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            for v, poids, _ in self.adjacence.get(u, []):
                nd = dist[u] + poids
                if nd < dist[v]:
                    dist[v] = nd
                    pred[v] = u
                    heapq.heappush(heap, (nd, v))

        return dist, pred

    def chemin_dijkstra(self, source: int, destination: int) -> Optional[dict]:
        """Retourne le chemin optimal source→destination avec coût."""
        dist, pred = self.dijkstra(source)
        if math.isinf(dist.get(destination, math.inf)):
            return None
        chemin = []
        noeud = destination
        while noeud is not None:
            chemin.append(noeud)
            noeud = pred[noeud]
        chemin.reverse()
        return {'chemin': chemin, 'cout': dist[destination]}

    # ── Bellman-Ford ───────────────────────────────────────────
    def bellman_ford(self, source: int) -> Tuple[Optional[Dict], Optional[Dict]]:
        """
        Retourne (distances, predecesseurs) ou (None, None) si cycle négatif.
        """
        dist = {n: math.inf for n in self.adjacence}
        pred = {n: None for n in self.adjacence}
        dist[source] = 0

        noeuds = list(self.adjacence.keys())
        n = len(noeuds)

        for _ in range(n - 1):
            updated = False
            for u in self.adjacence:
                if math.isinf(dist[u]):
                    continue
                for v, poids, _ in self.adjacence[u]:
                    if dist[u] + poids < dist[v]:
                        dist[v] = dist[u] + poids
                        pred[v] = u
                        updated = True
            if not updated:
                break

        # Détection cycle négatif
        for u in self.adjacence:
            for v, poids, _ in self.adjacence[u]:
                if dist[u] + poids < dist[v]:
                    return None, None  # Cycle absorbant détecté

        return dist, pred

    def chemin_bellman_ford(self, source: int, destination: int) -> Optional[dict]:
        dist, pred = self.bellman_ford(source)
        if dist is None or math.isinf(dist.get(destination, math.inf)):
            return None
        chemin = []
        noeud = destination
        while noeud is not None:
            chemin.append(noeud)
            noeud = pred[noeud]
        chemin.reverse()
        return {'chemin': chemin, 'cout': dist[destination]}

    # ── Greedy ─────────────────────────────────────────────────
    def reequilibrage_greedy(self) -> List[dict]:
        deficitaires = sorted(
            [(zid, z) for zid, z in self.zones.items()
             if z['statut'] in ('critique', 'surchargee')],
            key=lambda x: x[1]['taux_charge'], reverse=True
        )
        excedentaires = {
            zid: z['excedent_mw']
            for zid, z in self.zones.items()
            if z['statut'] in ('excedentaire', 'normale') and z['excedent_mw'] > 0
        }

        transferts = []
        for def_id, def_zone in deficitaires:
            besoin = abs(def_zone['excedent_mw']) * 0.9
            if besoin <= 0:
                continue

            dist, _ = self.dijkstra(def_id)
            sources_triees = sorted(
                [(exc_id, exc_mw, dist.get(exc_id, math.inf))
                 for exc_id, exc_mw in excedentaires.items()
                 if not math.isinf(dist.get(exc_id, math.inf))],
                key=lambda x: x[2]
            )

            for exc_id, exc_mw, cout in sources_triees:
                if besoin <= 0:
                    break
                chemin_info = self.chemin_dijkstra(exc_id, def_id)
                if not chemin_info:
                    continue

                transfert_mw = min(besoin, exc_mw)
                pertes = transfert_mw * cout / 100
                transferts.append({
                    'zone_source_id': exc_id,
                    'zone_destination_id': def_id,
                    'chemin_json': chemin_info['chemin'],
                    'quantite_mw': round(transfert_mw, 3),
                    'pertes_estimees_mw': round(pertes, 3),
                    'cout_chemin': round(cout, 5)
                })
                excedentaires[exc_id] -= transfert_mw
                besoin -= transfert_mw

        return transferts

    # ── Rééquilibrage avec algorithme au choix ─────────────────
    def calculer_reequilibrage(self, algorithme: str = 'dijkstra') -> dict:
        """Point d'entrée unifié pour le calcul de rééquilibrage."""
        import time
        debut = time.time()

        zones_critiques = [zid for zid, z in self.zones.items()
                           if z['statut'] in ('critique', 'surchargee')]
        zones_excedentaires = [zid for zid, z in self.zones.items()
                                if z['statut'] in ('excedentaire', 'normale')]

        if algorithme == 'greedy':
            transferts = self.reequilibrage_greedy()
        else:
            transferts = self._reequilibrage_optimal(algorithme)

        duree_ms = int((time.time() - debut) * 1000)
        energie_totale = sum(t['quantite_mw'] for t in transferts)

        return {
            'algorithme': algorithme,
            'nb_zones_critiques': len(zones_critiques),
            'nb_zones_excedentaires': len(zones_excedentaires),
            'energie_a_redistribuer_mw': round(energie_totale, 3),
            'transferts': transferts,
            'duree_calcul_ms': duree_ms
        }

    def _reequilibrage_optimal(self, algorithme: str) -> List[dict]:
        """Même logique que greedy mais avec Dijkstra ou Bellman-Ford."""
        deficitaires = sorted(
            [(zid, z) for zid, z in self.zones.items()
             if z['statut'] in ('critique', 'surchargee')],
            key=lambda x: x[1]['taux_charge'], reverse=True
        )
        excedentaires = {
            zid: z['excedent_mw']
            for zid, z in self.zones.items()
            if z['statut'] in ('excedentaire', 'normale') and z['excedent_mw'] > 0
        }

        transferts = []
        for def_id, def_zone in deficitaires:
            besoin = abs(def_zone['excedent_mw']) * 0.9
            if besoin <= 0:
                continue

            if algorithme == 'bellman_ford':
                dist, pred = self.bellman_ford(def_id)
            else:
                dist, pred = self.dijkstra(def_id)

            if dist is None:
                continue

            sources_triees = sorted(
                [(exc_id, exc_mw, dist.get(exc_id, math.inf))
                 for exc_id, exc_mw in excedentaires.items()
                 if not math.isinf(dist.get(exc_id, math.inf))],
                key=lambda x: x[2]
            )

            for exc_id, exc_mw, cout in sources_triees:
                if besoin <= 0:
                    break
                if algorithme == 'bellman_ford':
                    chemin_info = self.chemin_bellman_ford(exc_id, def_id)
                else:
                    chemin_info = self.chemin_dijkstra(exc_id, def_id)

                if not chemin_info:
                    continue

                transfert_mw = min(besoin, exc_mw)
                pertes = transfert_mw * cout / 100
                transferts.append({
                    'zone_source_id': exc_id,
                    'zone_destination_id': def_id,
                    'chemin_json': chemin_info['chemin'],
                    'quantite_mw': round(transfert_mw, 3),
                    'pertes_estimees_mw': round(pertes, 3),
                    'cout_chemin': round(cout, 5)
                })
                excedentaires[exc_id] -= transfert_mw
                besoin -= transfert_mw

        return transferts


def construire_graphe_depuis_db(zones, connexions, releves_actuels=None) -> GrapheReseau:
    """
    Construit un GrapheReseau depuis les objets SQLAlchemy.
    releves_actuels : {zone_id: consommation_mw}
    """
    g = GrapheReseau()
    releves = releves_actuels or {}

    for zone in zones:
        g.ajouter_zone(
            zone_id=zone.id,
            nom=zone.nom,
            capacite_mw=float(zone.capacite_max_mw),
            consommation_mw=releves.get(zone.id, 0),
            seuil_alerte_pct=float(zone.seuil_alerte_pct or 80)
        )

    for cnx in connexions:
        if cnx.actif:
            g.ajouter_connexion(
                src=cnx.zone_source_id,
                dst=cnx.zone_destination_id,
                pertes_pct=float(cnx.pertes_pct),
                capacite_mw=float(cnx.capacite_transit_mw),
                connexion_id=cnx.id,
                bidirectionnelle=cnx.bidirectionnelle
            )

    return g
