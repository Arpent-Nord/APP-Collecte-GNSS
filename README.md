# Collecte GNSS — Arpent-Nord

Application Android de collecte qui se branche directement aux récepteurs GNSS par Bluetooth, sans passer par les applications des fabricants.
**Version 0.2** : connexion au récepteur, état RTK en direct, corrections NTRIP, mesure de points par moyenne avec critères, **travail avec système de coordonnées (MTM, CGVD28)**, export CSV.

## Principe

```
Récepteur (Emlid, Trimble…) ──Bluetooth──► Module natif Android ──► Interface web (HTML/JS)
                                   ▲                                   │ pilotes par marque
                 corrections RTCM  │                                   │ mesure, critères, export
Serveur NTRIP ──Internet──► Client NTRIP                               ▼
                                                               CSV → SharePoint / OneDrive
```

- **Pilotes par marque** (`www/js/drivers.js`) : Emlid RX, RX2, RS4, Trimble R8 à R12 (NMEA), Leica GS07/GS16/GS18 (NMEA), NMEA générique, simulation. Ajouter un récepteur = ajouter un pilote.
- **Noyau** indépendant du récepteur : `nmea.js` (décodage), `survey.js` (moyenne, contrôle de qualité, CSV).
- **Module natif** (Java, sans dépendance externe) : `GnssService` (service au premier plan qui porte la collecte, écran éteint compris), `BluetoothLink` (port série Bluetooth), `NtripClient` (corrections), `RtcmScanner` (position de la base), `GnssBridge` (pont avec l'interface).
- Données (réglages, points, identifiants NTRIP) **conservées sur l'appareil seulement**. Rien de privé dans ce dépôt.

## Structure

| Emplacement | Contenu |
|---|---|
| `app/src/main/assets/www/` | Interface : `index.html`, `js/`, polices Barlow |
| `app/src/main/java/com/arpentnord/collecte/` | Module natif Android |
| `tests/core.test.js` | Tests du noyau (`node tests/core.test.js`) |
| `tools/maj-codes.js` | Mise à jour de la liste des codes à partir de « Recherche de codes » |
| `.github/workflows/build-apk.yml` | Compilation automatique de l'APK par GitHub |

## Mise en place (une seule fois)

1. Créer le dépôt **`Arpent-Nord/APP-Collecte-GNSS`** et y téléverser tout le contenu de ce dossier (y compris le dossier caché `.github`).
2. Dans le dépôt : **Settings › Secrets and variables › Actions › New repository secret**, ajouter les 4 secrets fournis à part (fichier confidentiel) :
   `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
   Sans eux, l'APK fonctionne, mais chaque nouvelle version exige de désinstaller l'ancienne (et efface les points sur l'appareil).
3. Onglet **Actions** : la compilation démarre à chaque envoi sur `main` (environ 5 min). On peut aussi la lancer avec « Run workflow ».
4. L'APK apparaît dans **Releases** : `Collecte-GNSS-0.1.N.apk`.

## Installer sur un appareil Android (téléphone, tablette, TSC5)

1. Ouvrir la page Releases du dépôt sur l'appareil et télécharger l'APK.
2. Autoriser l'installation d'applications de cette source quand Android le demande.
3. Au premier lancement, accepter l'autorisation **Appareils à proximité** (Bluetooth).

## Préparer les récepteurs

**Apparier** chaque récepteur dans *Réglages Android › Bluetooth* avant d'ouvrir l'application. Un récepteur Bluetooth ne se connecte qu'à un seul appareil à la fois : fermer Emlid Flow ou Trimble Access.

- **Emlid RS4 / RX2** : dans Emlid Flow, une seule fois : *Sortie de position* = Bluetooth, NMEA (GGA, GST, RMC). *Entrée des corrections* = Bluetooth. (Noms de menus à valider selon le firmware.)
- **Emlid RX** : apparier. Vérifier que les corrections relayées par l'application sont acceptées.
- **Trimble R8 à R12** : avec Trimble Access, l'interface web du récepteur ou un utilitaire Trimble, activer la sortie NMEA **GGA + GST** sur le port Bluetooth et l'enregistrer comme réglage au démarrage. Vérifier l'entrée RTCM par Bluetooth pour chaque modèle.

## Essai terrain — liste de vérification (étape 0)

- [ ] Le récepteur apparaît dans la liste et se connecte.
- [ ] La solution passe de *Autonome* à *RTK flottant* puis *RTK fixe* une fois les corrections démarrées.
- [ ] L'âge des corrections reste sous 2 à 3 s.
- [ ] Les précisions H et V s'affichent (sinon : activer la trame GST dans le récepteur).
- [ ] Mesure d'un point connu : comparer avec Emlid Flow (même point, même canne, même correction).
- [ ] Hauteur : confirmer la valeur à inscrire dans « Décalage récepteur » pour chaque modèle (doit donner la même hauteur au sol qu'Emlid Flow).
- [ ] Export CSV vers le dossier SharePoint/OneDrive du mandat.
- [ ] Coupure volontaire (récepteur éteint, perte réseau) : l'application le signale et les corrections reprennent seules.

## Travail et systèmes de coordonnées (version 0.2)

Onglet **Travail** :

- **Nom du levé** : le gabarit `AAMMJJSECT#NATSS` reste affiché en gris pendant la saisie. Le bouton « Date du jour » inscrit AAMMJJ.
- **Coordonnées planes** : NAD83(SCRS) / MTM 6, 7, 8 (EPSG 2948, 2949, 2950). La projection est vérifiée contre PROJ (écart < 1 mm) et contre Emlid Flow (point d'essai identique au millimètre).
- NAD83 / MTM 6, 7, 8 (EPSG 32186, 32187, 32188) : conversion NAD83(SCRS) → NAD83 (1986) par la grille NTv2 officielle **NA83SCRS** du MRN (14 sous-grilles, `www/grids/na83scrs.js`). Aller et retour identiques à PROJ à moins de 1 mm.
- **Altitudes CGVD28 (HTv2.0, EPSG 10588)** :
  - **modèle HT2_2010v70** (par défaut, standard Arpent-Nord, comme « CGVD28 height » dans Emlid Flow) : `www/grids/ht2_2010v70.js`.
  - modèle HT2_2002v70 (NAD83(SCRS)v4, époque 2002) : `www/grids/ht2_2002v70.js`. Au point d'essai, altitude identique à l'export Flow fait en 2002v70 (200,788).
  - Grilles de Ressources naturelles Canada (PROJ-data), extrait Québec 44,8–63° N, 57–80° O, identiques à PROJ à moins de 1 mm.
  - **séparation fixe du chantier** (N, en m) : altitude = hauteur ellipsoïdale − N.
- Projection MTM vérifiée aussi sur les exemples officiels du *Guide des référentiels géodésique et altimétrique au Québec* (MRNF, 2010).

Mesure :

- **Décalage vertical du récepteur** retenu par modèle (Emlid Reach RX : 0,145 m, valeur d'Emlid Flow).
- La durée est comptée **à partir de la première époque en RTK fixe** : les époques en flottant sont rejetées et n'entrent jamais dans la moyenne.
- Chaque précision (trame GST) est associée à l'époque de la même heure seulement.
- Bouton ✕ pour annuler une mesure en cours.

## Travail écran éteint

Dès que le récepteur est connecté, un **service Android au premier plan** prend le relais (notification « Collecte GNSS ») :

- le lien Bluetooth, la session NTRIP et le relais des corrections restent actifs écran éteint ou application en arrière-plan (verrous processeur et Wi-Fi) ;
- la position (GGA) est envoyée au serveur NTRIP aux 10 s par le module natif, ce qui garde la VRS en vie même si l'interface dort ;
- la notification affiche la solution (RTK fixe, flottant…), le nombre de satellites et le débit des corrections ; son bouton **Arrêter** coupe tout ;
- si le lien Bluetooth se coupe (récepteur trop loin, redémarré), l'application **se reconnecte seule** aux 5 s pendant 15 minutes, sans fermer la session NTRIP ;
- retirer l'application des applications récentes, ou « Déconnecter », arrête le service et libère le récepteur.

Onglet Récepteur, carte « Travail écran éteint » : option « Garder l'écran allumé » et bouton **Autoriser l'arrière-plan** (exclusion de l'optimisation de la batterie, recommandée sur les tablettes Samsung).

## Codes de points et nomenclature (NDA-001)

- **Code (Pcode)** (onglet Mesure) : recherche par numéro, abréviation ou mot (526, GAR, garde), comme « Recherche de codes ». Les 8 derniers codes utilisés restent en raccourci.
- **Description du point** au format `Pcode String.Contrôle` (ex. `526 1.1`) : numéro de ligne (bouton **Nouvelle** = ligne suivante + `.1`) et code de contrôle (.1 à .7). Le contrôle ne vaut que pour un point ; après `.2` (fermer), la ligne suivante est préparée. **Liaisons et calculs** : `_`, 2P, 2PD, 2D, 3PP, 4P, 3C, RECT s'ajoutent à la description.
- **Nom du levé** `AAMMJJSECT#NATSS` (onglet Travail) : vérifié pendant la saisie (date, type, nature, votre code) ; « Composer le nom du levé » l'assemble à partir du secteur, du type et de la nature.
- **Numéros de points** `AJJJSSNNN` (NDA-001 V03, 10.3 ; ex. 605957001) : A = dernier chiffre de l’année, JJJ = jour de l’année, SS = votre code (01 à 99), NNN = 001 à 199 en levé, 200 à 400 en implantation (type 2 du nom du levé). Le prochain numéro libre du jour est proposé (bouton **Prochain**). Mode « Libre » offert. Année en 0 : chiffre A à inscrire.
- **Secteur** : inscrire un numéro de contrat (AN-26-005) donne le secteur par défaut (A005, NDA-001 5.3).
- **reference.json** (Administration, `01_TRAITEMENT/_SYSTEME`) : se charge depuis l'onglet Travail ; seuls les codes d'arpenteurs et la table des natures sont gardés, **sur l'appareil seulement**. Sans lui : copie publique des natures.
- La liste des codes (`www/js/codes-data.js`) est **générée** à partir de la version publiée de « Recherche de codes » :
  `node tools/maj-codes.js chemin/APP-PCodes/index.html` (dépôt public `Arpent-Nord/APP-PCodes`). À refaire quand la liste change.
- CSV : colonne `Description_code` ajoutée à la fin.

## Corrections par radio (LoRa, UHF) ou modem du récepteur

Onglet Récepteur, carte « Corrections RTK », **Source des corrections** :

- **NTRIP par la tablette** : la tablette reçoit les corrections par Internet et les relaie au récepteur par Bluetooth (fonctionnement habituel).
- **Radio du récepteur** : le récepteur (ex. RS4 en LoRa, Trimble en UHF) reçoit les corrections directement de la base. Son entrée de corrections se règle une fois dans le logiciel du fabricant. La section NTRIP est masquée et ne peut pas être démarrée (pas de double source).
  - Ligne de base : inscrire Est / Nord (et Altitude, facultative) de la base dans le système du travail, ou les prendre d'un point déjà mesuré. Le nom de la base va dans la colonne `Station_base`.
- Pour les deux sources : **alerte d'âge des corrections** (5 s par défaut). La barre d'état passe en orange ; une mesure qui a connu un âge plus élevé est signalée.
- CSV : deux colonnes ajoutées **à la fin** (l'ordre des autres ne change pas) : `Source_corrections`, `Age_corr_max_s`.

## Leica (à valider aux essais)

Pilote « Leica GS07, GS16, GS18 (NMEA) » : sortie NMEA GGA + GST sur le port Bluetooth, configurée une fois dans Captivate.
À vérifier pour chaque modèle : option NMEA sous licence, entrée RTCM par Bluetooth (NTRIP par la tablette),
hauteur de référence du NMEA (comparer à Captivate sur un point connu). La compensation d'inclinaison n'est pas transmise en NMEA.

## Limites connues

- Pas encore de carte (orthophoto, routes), ni d'implantation.
- Trimble : NMEA seulement. Le décodeur GSOF est prévu.

## Feuille de route

1. Calage sur repère, codes (Pcodes), nommage `AAMMJJSECT#NATSS` à partir de `reference.json`, projets préparés au bureau, carte.
2. Validation de levé (2P/2PD/2D) et Contrôle d'implantation directement sur le terrain.
3. Pilote Trimble GSOF, puis autres marques.

## Développement

- Essayer l'interface dans un navigateur : ouvrir `app/src/main/assets/www/index.html` (mode simulation seulement).
- Tests : `node tests/core.test.js`.
- Compilation locale (Android Studio ou SDK Android installé) : `gradle assembleRelease`.
