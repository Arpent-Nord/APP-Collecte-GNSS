# Collecte GNSS — Arpent-Nord

Application Android de collecte qui se branche directement aux récepteurs GNSS par Bluetooth, sans passer par les applications des fabricants.
**Prototype — étape 0** : connexion au récepteur, état RTK en direct, corrections NTRIP, mesure de points par moyenne avec critères, export CSV.

## Principe

```
Récepteur (Emlid, Trimble…) ──Bluetooth──► Module natif Android ──► Interface web (HTML/JS)
                                   ▲                                   │ pilotes par marque
                 corrections RTCM  │                                   │ mesure, critères, export
Serveur NTRIP ──Internet──► Client NTRIP                               ▼
                                                               CSV → SharePoint / OneDrive
```

- **Pilotes par marque** (`www/js/drivers.js`) : Emlid RX, RX2, RS4, Trimble R8 à R12 (NMEA), NMEA générique, simulation. Ajouter un récepteur = ajouter un pilote.
- **Noyau** indépendant du récepteur : `nmea.js` (décodage), `survey.js` (moyenne, contrôle de qualité, CSV).
- **Module natif** (Java, sans dépendance externe) : `BluetoothLink` (port série Bluetooth), `NtripClient` (corrections), `GnssBridge` (pont avec l'interface).
- Données (réglages, points, identifiants NTRIP) **conservées sur l'appareil seulement**. Rien de privé dans ce dépôt.

## Structure

| Emplacement | Contenu |
|---|---|
| `app/src/main/assets/www/` | Interface : `index.html`, `js/`, polices Barlow |
| `app/src/main/java/com/arpentnord/collecte/` | Module natif Android |
| `tests/core.test.js` | Tests du noyau (`node tests/core.test.js`) |
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

## Limites connues du prototype

- Coordonnées **géographiques** et hauteur **ellipsoïdale** dans le système des corrections reçues. La colonne `H_geoide_recepteur` utilise le géoïde interne du récepteur, **pas** CGVD2013.
- L'application doit rester à l'écran pendant la collecte (l'écran reste allumé). Le fonctionnement en arrière-plan viendra à l'étape 1.
- Pas encore de projections MTM, de liste de codes, ni d'implantation.
- Trimble : NMEA seulement. Le décodeur GSOF est prévu.

## Feuille de route

1. Projections MTM et géoïde CGVD2013 (HTv2.0), codes (Pcodes), nommage `AAMMJJSECT#NATSS` à partir de `reference.json`, projets préparés au bureau, fonctionnement en arrière-plan.
2. Validation de levé (2P/2PD/2D) et Contrôle d'implantation directement sur le terrain.
3. Pilote Trimble GSOF, puis autres marques.

## Développement

- Essayer l'interface dans un navigateur : ouvrir `app/src/main/assets/www/index.html` (mode simulation seulement).
- Tests : `node tests/core.test.js`.
- Compilation locale (Android Studio ou SDK Android installé) : `gradle assembleRelease`.
