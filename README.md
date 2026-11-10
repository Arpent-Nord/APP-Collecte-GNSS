# Collecte GNSS — Arpent-Nord

Application Android de collecte qui se branche directement aux récepteurs GNSS par Bluetooth, sans passer par les applications des fabricants.
**En essai (v0)** : connexion au récepteur, état RTK en direct, corrections NTRIP, mesure de points par moyenne avec critères, **travail avec système de coordonnées (MTM, CGVD28)**, export CSV.

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

## Versions (gestion des versions Arpent-Nord)

Numérotation `vMAJEUR.MINEUR.CORRECTIF` du système `01_Validation_des_versions` ; **v0 = en essai**, v1.0.0 à la mise en service.

- **Compilation d'essai** : chaque envoi sur `main` produit un APK `Collecte-GNSS-0.3.0-essai.N.apk` publié dans la pré-release **« essai »** (remplacée à chaque envoi, jamais « Latest »). Aucun tag de version n'est créé automatiquement.
- **Version officielle** : créée avec `01_GERER_VERSIONS.bat` (choix 2 : correctif, mineur, majeur) ou « Draft a new release » avec un tag `vX.Y.Z`. Sa publication relance la compilation, qui joint `Collecte-GNSS-X.Y.Z.apk` à la release ; elle devient « Latest ».
- Le numéro s'affiche au bas de l'application (« version 0.3.0 » ou « 0.3.0-essai.N »). Le code de version Android suit le numéro de compilation (toujours croissant).
- Message d'envoi : remplacer « Add files via upload » par ce qui a changé (il apparaît dans l'état des versions et les releases).

## Installer sur un appareil Android (téléphone, tablette, TSC5)

1. Ouvrir la page Releases du dépôt sur l'appareil et télécharger l'APK : release **Latest** (version officielle) ou pré-release **essai** (dernière compilation).
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

## Travail et systèmes de coordonnées

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

## Travaux (jobs)

- Le **travail en cours** est affiché en permanence sous le titre, dans tous les onglets (nom, date, nombre de points, état). Le toucher ouvre l'onglet Travail.
- **Ouvert / consultation** : seul critère, la **date** du travail (AAMMJJ du nom, sinon date de création). Un travail daté d'aujourd'hui reçoit des points (mesurés, calculés, inscrits, importés, copiés). Un travail d'un autre jour s'ouvre en consultation (liste, inverses, superficies, export, copie de ses points vers le travail du jour) ; pour mesurer, créer un nouveau travail. Le passage à minuit est détecté.
- Onglet Travail : **Ouvrir un travail de l'appareil** (liste avec date et nombre de points) et **Nouveau travail**.
- Les calculs et sélecteurs travaillent dans le **travail en cours** : un point choisi dans un autre travail y est **importé** (avec confirmation) et garde sa **trace d'origine** (`Leve_origine`, `Point_origine` au CSV, conservées même après plusieurs copies). Deux points du même nom ne peuvent pas coexister dans un travail.
- Onglet Points et export CSV : le travail en cours (option « tous les travaux »).
- Avertissement si le code d'arpenteur (SS) manque : les numéros AJJJSSNNN ne peuvent pas être produits.

## Calculs (COGO) — raccourcis à la Menarp

Onglet **Calculs** : taper le numéro (ou toucher le bouton). Les numéros reprennent ceux de Menarp / Cadarp 2000 (Roger Perreault, Développement Darp), connus de plusieurs arpenteurs.

| N° | Commande | Contenu |
|---|---|---|
| 1 | Enregistre | Inscrire un point (E, N, Z, code) ; importer un fichier (CSV Emlid Flow 360, P,N,E,Z,D ou P,E,N,Z,D) ; récupérer des points d'un autre levé (ex. matin vers après-midi, par 2 · Liste) |
| 2 | Liste | Séquence (1-10, 15…), mesurés ou théoriques, code, levé (en cours, un autre, tous) ; comparaison à une ligne (chaînage, écart, dZ) ; export CSV ; copie vers le levé en cours ou un autre (noms déjà présents ignorés) |
| 3 | Création de points | Commandes de la boîte à outils (mêmes règles que Validation de levé) : **2P** milieu, **2PD** point à une distance sur l'alignement (depuis 1 ou 2, déport), **2D** intersection de 2 distances (− = gauche), **3PP** perpendiculaire, **4P** intersection de 2 droites, **3C** centre du cercle (rayon), **RECT** 4e coin ; et azimut-distance, angle-distance, intersections azimut-azimut et azimut-distance |
| 4 | Inverse | Entre 2 points, en suite 1-2-3-4, en rayonnement 1-2, 1-3, 1-4 ; azimut, distance grille et sol, dZ, pente |
| 7 | Superficie | Polygone fermé : m² grille et sol, ha, pi², acres, périmètre |

- Angles en **DD.MMSS** (45.1230 = 45°12′30″), **degrés décimaux** ou **grades** (400 gon) ; azimuts du nord, sens horaire. Angle + = horaire, − = antihoraire ; déport + = à droite de l'axe, − = à gauche (bouton ± pour le signe).
- **Distances grille ou sol** : facteur combiné = facteur d'échelle MTM (identique à PROJ) × facteur d'altitude R / (R + h). Par défaut, **facteur du secteur de travail** comme Menarp : moyenne des facteurs d'échelle des points du levé × facteur de l'altitude moyenne (h = altitude + N). Aussi : au lieu de chaque calcul, inscrit, ou 1 (aucune correction).
- **Choisir sans taper** : toucher un champ de point vide ouvre le **levé en cours** (recherche par nom, code ou description ; autre levé ou tous ; ordre récents, plus proches de ma position, ou par nom). Bouton **Points** pour les séquences (touchés dans l'ordre), **Codes** pour la bibliothèque de Pcodes, **Saisir au clavier** au besoin.
- **Azimut ou distance par deux points** : inscrire `4-7` (ou bouton **2 pts**) donne l'azimut ou la distance de 4 vers 7 ; `4-7+90` ajoute un angle à l'azimut. La formule du point garde la mention (ex. « Az 90°00′00.0″ (4-7+90) »).
- **Code des points calculés** : 299 PCT (calculé sur le terrain) par défaut ; 300 PCB, 301 PCC ou autre code au choix.
- Rayonnement (option par défaut) : on reste au point de départ ; sinon le nouveau point devient la station (cheminement).
- Les points calculés, inscrits et importés sont **théoriques** (en italique) ; le CSV porte `Type_point` et `Formule` (ex. « 2PD A, B, D 10.000 depuis B » ou « Az-dist de S1, Az 45°00′00.0″, D 10.000 »).

## Levé par codes (strings en direct)

Onglet **Mesure → Levé par codes**. Même mesure que « point par point » (critères, moyenne, corrections) ; seule la description change de façon.

- **Boîtes de codes nommées** (Route, Bâtiment…), ajustables au terrain : « Modifier » → toucher un code pour le remplacer, le retirer ou le déplacer ; « + Code » ; « Nouvelle boîte » ; « Selon la nature » bâtit une boîte avec les codes les plus utilisés dans les levés de même nature (NAT) sur l'appareil.
- **Suivi des strings** à la Leica : toucher un code montre ses lignes (ouvertes, fermées), « + Nouvelle ligne », « Point seul », et les contrôles .1 .2 .3 .5 .4 .6 (combinés .1.3, .1.6, .4.2). La description `Pcode String.Contrôle` se compose seule ; après le point, le contrôle retombe à « Suivant » et une fermeture (.2) prépare la ligne suivante (.1). « Lier aussi à » ajoute une liaison multiple (`526 1.2_526 2.1`).
- **Croquis en direct** aux couleurs des calques Arpent-Nord, avec la position du récepteur et le segment à venir (pointillé) ; Tout, Moi, zoom, numéros ; pincer et glisser.
- **Poursuite** : chaque ligne ouverte attend son prochain point dans le prolongement de ses derniers points (droite, ou cercle des 3 derniers en courbe). Selon ta position, une bande au-dessus de Mesurer propose les 3 lignes les plus probables (« Suggéré 185 L2 · 3,2 m · dans l'axe ») ; un toucher l'active. Rien ne change sans toi ; si deux lignes sont trop proches pour décider, la bande dit « Ambigu ». Une ligne dépassée reste dans la liste.
- **Objectif fixé** : toucher une ligne sur le croquis (étiquettes « 185_2 » le long des lignes) l'active et la fixe comme objectif ; la suggestion se tait jusqu'à « Libérer ».
- **TERMINER / REPRENDRE** : la ligne s'arrête là (plus de point attendu, retirée de la poursuite) ; REPRENDRE la remet en jeu. Sans effet sur le fichier, noté au journal.
- **Anomalies en direct** (moteur de Validation de levé : lignes d'un point, croisements, fermetures courtes, doublons…) ; toucher pour centrer.
- **Outils de correction au toucher**, mêmes règles que Validation de levé : INV PTS, INV LIGNE, FERMER, LIER, DÉLIER, UNIR, DESCR., EFFACER, ANNULER. Seulement dans le travail du jour ; chaque correction garde la valeur d'origine et s'inscrit au journal du travail.
- **Export** (onglet Points → « Exporter le levé ») : `AAMMJJSECT#NATSS.txt` (brut, valeurs d'origine) et `AAMMJJSECT#NATSS_MODIF.txt` (corrigé, sans les points effacés), format P,N,E,Z,D sans en-tête (NDA-001, 6.6 et 10.1), prêts pour Validation de levé et la base de données Survey de Civil 3D.

Le moteur `js/moteur-leve.js` est extrait de Validation de levé par `node tools/maj-moteur-leve.js <index.html de validation-leve>` : relancer après chaque nouvelle version de l'outil de bureau.

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
