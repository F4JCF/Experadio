# Expé'Radio

Application pour préparer, saisir et clôturer vos **activations radioamateur en portable** :
POTA, SOTA, WWFF, IOTA et Bunkers on the Air (BOTA).

- **Fonctionne hors ligne** : après une première ouverture avec Internet, tout marche sans réseau, en pleine montagne.
- **Un seul logiciel pour tous les appareils** : PC Windows, tablette ou téléphone Android, dans le navigateur ou installé comme une application.
- **Rien à installer** : on ouvre un lien, c'est tout.
- **Vos données restent sur votre appareil** : aucun compte, aucune donnée envoyée.

**Ouvrir l'application : https://f4jcf.github.io/Experadio/**

Auteur : F4JCF — Licence GPL v3.

## Utilisation

1. Ouvrez https://f4jcf.github.io/Experadio/ dans Chrome ou Edge.
2. Dans **Réglages** (roue dentée), indiquez votre indicatif et votre locator.
3. **Nouvelle activation** : appuyez sur **Me localiser** pour obtenir votre locator et la liste des parcs POTA et sommets SOTA proches, puis choisissez-les en un clic. Cochez les autres programmes de la sortie (une même sortie peut compter pour POTA, SOTA et WWFF à la fois) et indiquez le matériel utilisé : poste, antenne, puissance.
4. Sur le terrain, saisissez vos QSO. Le pays et le drapeau du correspondant s'affichent tout seuls, les doublons sont signalés, et une barre par programme montre où vous en êtes.
5. **Terminer** : l'application indique si chaque activation est validée, affiche la **carte des contacts** (une ligne par correspondant, colorée selon la bande) et prépare un fichier par programme, dans le format attendu. La carte s'enregistre ou se partage en image.

### Localisation et confidentialité

Votre position GPS reste sur l'appareil : elle sert à calculer le locator et les distances. L'application télécharge les listes de parcs (api.pota.app) et de sommets (api2.sota.org.uk) de votre région, puis les garde en mémoire. Une zone consultée chez vous avant de partir reste donc disponible sur le terrain, même sans réseau.

### Installer sur l'appareil

- **Android (Chrome)** : menu ⋮ puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».
- **PC (Chrome ou Edge)** : icône d'installation à droite de la barre d'adresse, ou bouton « Installer l'application » sur l'accueil.

### Sauvegarde et changement d'appareil

Les activations sont enregistrées dans le navigateur de chaque appareil. Pensez à faire **Réglages › Télécharger une sauvegarde** régulièrement. Le même fichier se restaure sur un autre appareil.

## Règles prises en compte

| Programme | Validation | Fichier produit |
|---|---|---|
| POTA | 10 QSO dans la même journée UTC | ADIF `INDICATIF@PARC-AAAAMMJJ.adi`, à téléverser sur pota.app |
| SOTA | 4 correspondants différents dans la même journée UTC | CSV V2, pour la base de données SOTA |
| WWFF | 44 QSO, cumulables sur plusieurs sorties | ADIF `INDICATIF @ REF AAAAMMJJ.adi`, pour le gestionnaire de logs du pays |
| IOTA | pas de minimum | ADIF avec `MY_IOTA`, pour Club Log |
| BOTA | 25 QSO (5 en VHF/UHF uniquement) | ADIF avec `MY_SIG=BOTA` — format à confirmer avec le WWBOTA Logger |

Un **ADIF complet** avec toutes les références est aussi proposé pour vos carnets de trafic (QLog, Log4OM…).

Les QSO identiques (même indicatif, même bande, même mode, même journée UTC) ne comptent qu'une fois.

## Feuille de route

- [x] v0.1 — activations multi-programmes, saisie hors ligne, pays et drapeau, doublons, exports, sauvegarde
- [x] v0.2 — localisation (locator GPS, parcs POTA et sommets SOTA proches), matériel utilisé (MY_RIG, MY_ANTENNA, TX_PWR), carte des contacts par bande
- [ ] Recherche d'indicatifs (QRZ.com, HamQTH, QRZCQ) avec cache pour le terrain
- [ ] Réserves WWFF autour de soi
- [ ] Propagation du jour et checklist de matériel
- [ ] Pilotage CAT du poste depuis le PC (fréquence et mode automatiques)

## Développement

Application web progressive (PWA) en JavaScript, sans dépendance ni étape de compilation.
Chaque envoi sur la branche `main` lance les tests puis publie le site sur GitHub Pages (`.github/workflows/pages.yml`).

- Tests : `npm test` (Node 22)
- Table des pays : `js/dxcc-data.js`, générée par `tools/build-dxcc.mjs`
- Contours du planisphère : `js/world-data.js`, générés par `tools/build-world.mjs`
- Pour publier une mise à jour, changer `VERSION` dans `sw.js` et `APP_VERSION` dans `js/export.js`.

## Crédits

- Identification des pays : *Amateur Radio Country Files* de Jim Reisert AD1C (country-files.com), via `@ham2k/lib-country-files` (MIT).
- Drapeaux : police Twemoji Country Flags (graphismes Twemoji, CC-BY 4.0).
- Polices : Atkinson Hyperlegible et JetBrains Mono (SIL Open Font License).
- Planisphère : Natural Earth 1:110m (domaine public), via `world-atlas` (ISC).
- Parcs et sommets : Parks on the Air et Summits on the Air.
