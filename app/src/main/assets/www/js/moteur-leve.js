/* Collecte GNSS — Arpent-Nord
 * moteur-leve.js : GÉNÉRÉ par tools/maj-moteur-leve.js à partir de « Validation de levé » (Arpent-Nord/validation-leve, v9.7).
 * Ne pas modifier à la main : corriger dans Validation de levé, puis régénérer.
 * Extrait le 2026-11-09 : 16 fonctions (lecture des descriptions « Pcode String.Contrôle »,
 * analyse des strings et anomalies, tracé des lignes, courbes et cercles, commandes 2P à RECT) et couleurs des calques.
 */
(function (root) {
  'use strict';
  var DICT = {"codes":[[88,"C-BAT-MUR-AMENAGEMEN"],[110,"C-BAT-PRINCIPAL"],[111,"C-BAT-TOITURE"],[112,"C-BAT-PRINCIPAL"],[113,"C-BAT-PRINCIPAL"],[116,"C-BAT-PRINCIPAL"],[120,"C-BAT-PRINCIPAL"],[121,"C-BAT-PRINCIPAL"],[123,"C-BAT-ACCESSOIRE"],[124,"C-BAT-ACCESSOIRE"],[126,"C-BAT-ANNEXE"],[127,"C-BAT-ANNEXE"],[128,"C-BAT-PRINCIPAL"],[129,"C-BAT-PRINCIPAL"],[130,"C-BAT-RUINE"],[133,"C-BAT-ACCESSOIRE"],[134,"C-BAT-FONDATION"],[135,"C-BAT-ACCESSOIRE"],[137,"C-BAT-ACCESSOIRE"],[138,"C-BAT-ACCESSOIRE"],[140,"C-BAT-ACCESSOIRE"],[141,"C-BAT-ACCESSOIRE"],[142,"C-BAT-ACCESSOIRE"],[144,"C-BAT-ACCESSOIRE"],[145,"C-BAT-ACCESSOIRE"],[148,"C-BAT-PRINCIPAL"],[151,"C-BAT-ACCESSOIRE"],[152,"C-BAT-ACCESSOIRE"],[153,"C-BAT-ACCESSOIRE"],[155,"C-BAT-CHAMP-EPURATIO"],[156,"C-BAT-ANNEXE"],[157,"C-BAT-ACCESSOIRE"],[160,"C-BAT-ACCESSOIRE"],[235,"C-BAT-ACCESSOIRE"],[236,"C-BAT-ACCESSOIRE"],[254,"C-BAT-ACCESSOIRE"],[413,"C-STR-MUR-ANTI_BRUIT"],[446,"C-STR-MUR-ANTI_BRUIT"],[447,"C-STR-PONT"],[490,"C-SER-ACCESSOIRE"],[515,"C-VOI-AIRE-ENTREPOSAGE"],[517,"C-VOI-CITERNE"],[518,"C-VOI-CONTENEUR"],[519,"C-VOI-PLATEFORME"],[521,"C-VOI-PLATEFORME"],[522,"C-VOI-ACCES-BATIMENT"],[523,"C-VOI-ACCES-BATIMENT"],[525,"C-VOI-PROTECTION"],[526,"C-VOI-ROULOTTE"],[527,"C-BAT-ANNEXE"],[528,"C-BAT-ANNEXE"],[529,"C-BAT-ANNEXE"],[530,"C-BAT-DIVERS"],[640,"C-BAT-MEMBRANE-PROJETÉE"],[641,"C-BAT-ACCESSOIRE"],[642,"C-BAT-ACCESSOIRE"],[531,"C-BAT-CHAMBRE-ELECTRIQUE"],[65,"C-DRA-FOSSE-FOND"],[67,"C-DRA-DALOT"],[68,"C-DRA-CANIVEAU"],[69,"C-DRA-FOSSE-CENTRE"],[70,"C-DRA-FOSSE-BORD"],[74,"C-DRA-EAU-NORM-BASS"],[76,"C-DRA-EAU-JOUR"],[77,"C-DRA-EAU-CENTRE"],[78,"C-DRA-EAU-NORM-HAUT"],[79,"C-DRA-EAU-EXTREME"],[85,"C-DRA-MUR"],[195,"C-DRA-PONCEAU"],[196,"C-DRA-PONCEAU"],[197,"C-DRA-PONCEAU"],[199,"C-DRA-PONCEAU"],[204,"C-DRA-BUSE"],[231,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[233,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[234,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[241,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[257,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[266,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[286,"C-DRA-AGRICOLE"],[290,"C-DRA-PROTECTION"],[366,"C-DRA-PONCEAU"],[403,"C-DRA-DRAIN"],[409,"C-MOD-SONDAGE"],[411,"C-DRA-PONCEAU"],[412,"C-DRA-EGOUT-PLUVIAL"],[4002,"C-DRA-DRAIN"],[415,"C-MOD-GEOTEXTILE"],[418,"C-DRA-PROTECTION"],[421,"C-DRA-PONCEAU"],[443,"C-MOD-SONDAGE"],[469,"C-DRA-DIGUE"],[470,"C-DRA-DIGUE"],[471,"C-DRA-DRAIN"],[472,"C-DRA-DRAIN"],[473,"C-DRA-PONCEAU"],[478,"C-DRA-PONCEAU"],[480,"C-DRA-DIVERS"],[481,"C-DRA-EAU-JOUR"],[482,"C-DRA-RIVE"],[483,"C-DRA-RIVIERE-BORD"],[484,"C-DRA-RIVIERE-CENTRE"],[485,"C-DRA-RIVIERE-BORD"],[486,"C-DRA-RIVIERE-CENTRE"],[487,"C-DRA-ZONE-INONDABLE"],[488,"C-DRA-DIVERS"],[177,"C-FER-VOIE"],[178,"C-FER-RAIL"],[244,"C-FER-ACCESSOIRE"],[245,"C-FER-ACCESSOIRE"],[246,"C-FER-ACCESSOIRE"],[247,"C-FER-ACCESSOIRE"],[438,"C-FER-ACCESSOIRE"],[444,"C-FER-ACCESSOIRE"],[900,"C-FER-ACCESSOIRE"],[4000,"C-FER-ACCESSOIRE"],[4001,"C-FER-ACCESSOIRE"],[161,"C-SIG-PETITE"],[162,"C-SIG-MARQ-DOUB-CONT"],[163,"C-SIG-MARQ-DOUB-MIXT"],[164,"C-SIG-SUPER-LATERALE"],[165,"C-SIG-SUPER-AERIENNE"],[166,"C-SIG-MARQ-CONTINUIT"],[167,"C-SIG-MARQ-GUIDAGE"],[168,"C-SIG-MARQ-SIMP-CONT"],[169,"C-SIG-MARQ-DISCONTIN"],[171,"C-SIG-MARQ-VOI-RESER"],[172,"C-SIG-PANN-PUBLICITA"],[173,"C-SIG-PANNEAU"],[174,"C-SIG-MARQ-PICTOGRAM"],[206,"C-SIG-FEUX"],[207,"C-SIG-FEUX"],[210,"C-SIG-ECLAIRAGE"],[224,"C-SIG-ECLAIRAGE"],[225,"C-SIG-ECLAIRAGE"],[226,"C-SIG-ECLAIRAGE"],[227,"C-SIG-ECLAIRAGE"],[228,"C-SIG-FEUX"],[229,"C-SIG-FEUX"],[230,"C-SIG-FEUX"],[237,"C-SIG-FEUX"],[369,"C-SIG-ACCESSOIRE"],[370,"C-SIG-ACCESSOIRE"],[371,"C-SIG-ACCESSOIRE"],[372,"C-SIG-ACCESSOIRE"],[30,"C-GEO-LIGNE-REFERENC"],[299,"C-GEO-POINT-CALCUL"],[300,"C-GEO-POINT-CALCUL"],[301,"C-GEO-POINT-CALCUL"],[405,"C-GEO-LIGNE-REFERENC"],[406,"C-GEO-LIGNE-REFERENC"],[419,"C-GEO-LIGNE-REFERENC"],[1000,"C-STR-CAISSON-AV-BETON"],[1100,"C-STR-CAISSON-TQC"],[2000,"C-STR-COLONNE-AV-BETON"],[2100,"C-STR-COLONNE-TQC"],[2200,"C-STR-COLONNE-ACIER"],[3000,"C-STR-ECROU-AV-BETON"],[3001,"C-STR-CHEVETRE-AV-BETON"],[3002,"C-STR-ASSISE-AV-BETON"],[3003,"C-STR-CLE-CIS-AV-BETON"],[3004,"C-STR-DIVERS_STRUCTURE"],[3100,"C-STR-ECROU-TQC"],[3101,"C-STR-CHEVETRE-TQC"],[3102,"C-STR-ASSISE-TQC"],[3103,"C-STR-CLE-CIS-TQC"],[3104,"C-STR-DIVERS_STRUCTURE"],[61,"C-FON-CLOTURE"],[63,"C-FON-CLOTURE-MAILLE"],[71,"C-FON-OCCUPATION"],[73,"C-FON-OCCUPATION"],[87,"C-FON-MUR-MITOYEN"],[98,"C-FON-ALIGNEM-ROCHES"],[200,"C-FON-CLOTURE"],[108,"C-MOD-FRONTIERE"],[109,"C-MOD-FRONTIERE"],[170,"C-VOI-ACCOT-NONPAVE"],[175,"C-VOI-PAVAGE-CENTRE"],[176,"C-VOI-GRAVIER-CENTRE"],[180,"C-VOI-ENTREE-GRAVIER"],[181,"C-VOI-PAVAGE-BORD"],[182,"C-VOI-GRAVIER-BORD"],[183,"C-VOI-ENTREE-PAVE"],[184,"C-VOI-GLI-NON-ID"],[185,"C-VOI-TROTTOI-BORDUR"],[186,"C-VOI-ACCOT-PAVE"],[187,"C-VOI-TROTTOI-BORDUR"],[191,"C-VOI-GLI-TOL-BO"],[192,"C-VOI-GLI-TOL-AC"],[193,"C-VOI-GLI-BET-2F"],[194,"C-VOI-GLI-CAB-AC"],[198,"C-VOI-PROTECTION"],[201,"C-VOI-GLI-BET-1F"],[202,"C-VOI-GLI-CAB-BO"],[203,"C-VOI-GLI-TUB-AC"],[264,"C-MOD-SONDAGE"],[267,"C-VOI-BANDE"],[347,"C-MOD-PALIER-EXT"],[348,"C-MOD-PALIER-INT"],[349,"C-MOD-PREDECOUP-ROC"],[350,"C-MOD-INITIAL"],[351,"C-MOD-INITIAL"],[352,"C-TOP-ROC-EN-SURFACE"],[353,"C-MOD-INITIAL"],[354,"C-MOD-INITIAL"],[355,"C-MOD-INITIAL"],[356,"C-MOD-FINAL"],[357,"C-MOD-FINAL"],[358,"C-MOD-FINAL"],[359,"C-MOD-FINAL"],[360,"C-MOD-FINAL"],[361,"C-MOD-FINAL"],[362,"C-MOD-FINAL"],[363,"C-MOD-FINAL"],[364,"C-MOD-FINAL"],[365,"C-MOD-FINAL"],[367,"C-VOI-GLI-CAB-AC-2F"],[368,"C-VOI-GLI-TOL-AC-2F"],[381,"C-TOP-EXCAVATION"],[385,"C-VOI-GLI-BET-2F"],[393,"C-VOI-DIVERS"],[397,"C-STR-PARAPET"],[402,"C-MOD-SONDAGE"],[404,"C-STR-PALPLANCHE"],[408,"C-TOP-DIVERS"],[417,"C-MOD-SONDAGE"],[437,"C-MOD-SONDAGE"],[440,"C-FER-ACCESSOIRE"],[441,"C-MOD-SONDAGE"],[454,"C-TOP-EXCAVATION"],[540,"C-BAT-ACCES-BETON"],[541,"C-BAT-ACCES-PAVE-UNI"],[542,"C-VOI-PISTE-CYCLABLE"],[543,"C-VOI-SENTIER"],[544,"C-VOI-SENTIER"],[545,"C-VOI-DIVERS"],[546,"C-TOP-DÉCAPAGE"],[610,"C-VOI-BET-PROJETE"],[670,"C-VOI-COURS-EAU-VOIRIE"],[903,"C-VOI-TERRE-REMAN"],[904,"C-VOI-PC50"],[905,"C-VOI-PC50"],[906,"C-VOI-PC300"],[907,"C-VOI-MR"],[908,"C-VOI-SABLE"],[909,"C-VOI-MG20"],[911,"C-VOI-MG112"],[913,"C-VOI-MG56"],[916,"C-VOI-POU-PIERRE"],[1,"C-REP-CONTROLE-PHOTO"],[2,"C-REP-CONTROLE-PHOTO"],[3,"C-REP-CONTROLE-PHOTO"],[4,"C-REP-ARPENTAGE"],[6,"C-REP-CHEMINEMENT"],[7,"C-REP-ARPENTAGE"],[8,"C-REP-ARPENTAGE"],[9,"C-REP-GEODESIQUE"],[10,"C-REP-GEODESIQUE"],[14,"C-REP-GEODESIQUE"],[15,"C-REP-ARPENTAGE"],[17,"C-REP-CHEMINEMENT"],[18,"C-REP-CHEMINEMENT"],[19,"C-REP-ARPENTAGE"],[20,"C-REP-ARPENTAGE"],[21,"C-REP-ARPENTAGE"],[24,"C-REP-ARPENTAGE"],[26,"C-REP-ARPENTAGE"],[27,"C-REP-ARPENTAGE"],[28,"C-REP-ARPENTAGE"],[29,"C-REP-ARPENTAGE"],[400,"C-REP-CHEMINEMENT"],[410,"C-REP-CHEMINEMENT"],[449,"C-STR-TROU_ARPENTAGE"],[455,"C-SER-DIVERS"],[650,"C-REP-CIBLES"],[651,"C-REP-GEODESIQUE"],[652,"C-REP-GEODESIQUE"],[653,"C-REP-ARPENTAGE"],[654,"C-REP-ARPENTAGE"],[700,"C-REP-ARPENTAGE"],[701,"C-REP-POLYGONALE"],[56,"C-VEG-ALIGNEM-ARBRES"],[75,"C-VEG-BOISE"],[80,"C-VEG-HAIE"],[90,"C-VEG-PLANTATION"],[136,"C-VEG-CULTURE"],[280,"C-VEG-ARBRE"],[281,"C-VEG-ARBRE"],[282,"C-VEG-ARBRE"],[283,"C-VEG-MARECAGE"],[489,"C-VEG-PLANTATION"],[491,"C-VEG-ENGAZONNEMENT"],[492,"C-VEG-JARDIN-LIMITE"],[493,"C-VEG-ARBRE"],[494,"C-VEG-DIVERS"],[81,"C-TOP-TALUS-HAUT"],[82,"C-TOP-TALUS-BAS"],[84,"C-TOP-DECROCHEMENT"],[89,"C-TOP-ROC-EN-SURFACE"],[91,"C-TOP-COTE-BATHYMETR"],[94,"C-TOP-COTE-ALTIME"],[95,"C-TOP-CHANG-PENTE"],[96,"C-TOP-CHANG-PENTE-AP"],[97,"C-TOP-COTE-ALTIME-AP"],[99,"C-TOP-BANC-EMPRUNT"],[289,"C-TOP-EMPILEMENT"],[298,"C-TOP-DIVERS"],[428,"C-STR-PONT"],[430,"C-MOD-INITIAL"],[600,"C-TOP-FOUIL-ARCHEO"],[601,"C-TOP-FOND-FOUILLE"],[83,"C-STR-MUR-SOUTENEMEN"],[131,"C-STR-MASSIF-ANCRAGE"],[139,"C-STR-PONT"],[143,"C-STR-BUTOIR"],[146,"C-STR-JOINT"],[147,"C-STR-QUAI"],[149,"C-STR-PONT"],[179,"C-STR-PARAPET"],[188,"C-STR-PONT"],[189,"C-STR-PONT"],[190,"C-STR-PONT"],[255,"C-STR-DEBARCADERE"],[287,"C-STR-BARRAGE"],[288,"C-STR-PONT"],[382,"C-STR-PIEU"],[383,"C-STR-PIEU"],[384,"C-STR-ANCRAGE"],[386,"C-STR-PONT"],[387,"C-STR-COFFRAGE"],[388,"C-STR-ARMATURE"],[389,"C-STR-ARMATURE"],[390,"C-STR-PIEU"],[391,"C-STR-PIEU"],[394,"C-STR-PONT"],[395,"C-STR-DIVERS_STRUCTURE"],[396,"C-STR-PONT"],[414,"C-STR-PONT"],[407,"C-STR-PARAPET"],[416,"C-VOI-DIVERS"],[420,"C-STR-DIVERS_STRUCTURE"],[426,"C-STR-DIVERS_STRUCTURE"],[398,"C-STR-PARAPET"],[399,"C-STR-JOINT"],[401,"C-STR-ANCRAGE"],[422,"C-STR-APPUI"],[423,"C-STR-PLAQUE-ANCRAGE"],[429,"C-STR-APPUI"],[436,"C-STR-BLOC-BETON"],[442,"C-STR-PONT"],[448,"C-STR-PONT"],[450,"C-STR-TUNNEL"],[451,"C-STR-VIADUC"],[452,"C-STR-VOUTE"],[453,"C-STR-DIVERS_STRUCTURE"],[547,"C-STR-MURET"],[660,"C-STR-MUR-BERLINOIS"],[661,"C-STR-ROC-BOLT"],[662,"C-STR-DYNAMITAGE-BLAST"],[755,"C-STR-PATRON-FORAGE"],[918,"C-STR-DIVERS_STRUCTURE"],[919,"C-STR-DIVERS_STRUCTURE"],[920,"C-STR-DIVERS_STRUCTURE"],[921,"C-STR-DIVERS_STRUCTURE"],[922,"C-STR-DIVERS_STRUCTURE"],[923,"C-STR-DIVERS_STRUCTURE"],[925,"C-STR-DIVERS_STRUCTURE"],[4003,"C-STR-CAISSON"],[4004,"C-TOP-DIVERS"],[4005,"C-STR-DIVERS_STRUCTURE"],[205,"C-SER-ELEC-TEL-NON-ID"],[208,"C-SER-ELEC-TEL-SOUT"],[209,"C-SER-ELEC-SOUTER"],[211,"C-SER-ELEC"],[212,"C-SER-TEL"],[213,"C-SER-ELEC-TEL"],[214,"C-SER-ELEC-TEL-HAUBAN"],[215,"C-SER-ELEC"],[216,"C-SER-ELEC-TEL"],[217,"C-SER-ELEC-LAMPAD"],[218,"C-SER-ELEC-TEL-LAMP"],[219,"C-SER-ELEC-LAMPAD"],[220,"C-SER-ELEC-TEL-LAMP"],[221,"C-SER-ELEC-TEL-HAUBAN"],[222,"C-SER-ELEC-SOUTER"],[223,"C-SER-ELEC"],[232,"C-SER-REGAR-NON-ID"],[238,"C-SER-AQUEDUC-ELEMENT"],[239,"C-SER-MOUSSE-CARBONI"],[240,"C-SER-AQUEDUC-ELEMENT"],[242,"C-SER-TEL-SOUTER"],[243,"C-SER-GAZODUC"],[248,"C-SER-ELEC"],[249,"C-SER-ELEC"],[250,"C-SER-ELEC-SOUTER"],[251,"C-SER-AQUEDUC-ELEMENT"],[252,"C-SER-EGOUT-COMBINE-ELEMENT"],[253,"C-SER-TEL"],[256,"C-SER-GAZODUC"],[258,"C-SER-ELEC-SOUTER"],[259,"C-SER-TEL-SOUTER"],[260,"C-SER-EGOUT-SANITAIR-ELEMENT"],[261,"C-SER-GAZODUC"],[262,"C-SER-OLEODUC"],[263,"C-SER-OLEODUC"],[265,"C-SER-ELEC-SOUTER"],[268,"C-SER-AQUEDUC-ELEMENT"],[295,"C-SER-TEL"],[296,"C-SER-ELEC-TEL-AERIEN"],[380,"C-SER-ELEC-SOUTER"],[392,"C-SER-ELEC"],[424,"C-SER-MANCHON"],[425,"C-SER-ELEC-CONDUIT"],[435,"C-SER-ELEC"],[456,"C-SER-GAZODUC"],[457,"C-SER-ELEC"],[458,"C-SER-TEL"],[459,"C-SER-TEL-AERIEN-FO"],[460,"C-SER-TEL-SOUTER-FO"],[461,"C-SER-GAZODUC-SOUTER"],[463,"C-SER-TEL-SOUTER-CONDUIT-FO"],[462,"C-SER-OLEODUC SOUTER"],[464,"C-SER-ACCESSOIRE"],[465,"C-SER-TEL"],[466,"C-SER-TEL-SOUTER-FO"],[467,"C-SER-AQUEDUC"],[468,"C-SER-DIVERS"],[474,"C-DRA-POSTE-POMPAGE"],[475,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[476,"C-DRA-EGOUT-PLUVIAL-ELEMENT"],[477,"C-DRA-SOURCE"],[479,"C-DRA-ELEMENT"],[495,"C-SER-AQUEDUC"],[496,"C-DRA-EGOUT-PLUVIAL"],[497,"C-SER-EGOUT-SANITAIR"],[498,"C-SER-EGOUT-COMBINE"],[499,"C-SER-BRANCHEMENT-COND"],[620,"C-SER-BRIDE"],[917,"C-SER-AQUEDUC"],[924,"C-SER-AQUEDUC-ELEMENT"]],"layers":{"C-BAT-MUR-AMENAGEMEN":33,"C-BAT-PRINCIPAL":31,"C-BAT-TOITURE":31,"C-BAT-ACCESSOIRE":33,"C-BAT-ANNEXE":33,"C-BAT-RUINE":33,"C-BAT-FONDATION":33,"C-BAT-CHAMP-EPURATIO":33,"C-STR-MUR-ANTI_BRUIT":9,"C-STR-PONT":9,"C-SER-ACCESSOIRE":57,"C-VOI-AIRE-ENTREPOSAGE":9,"C-VOI-CITERNE":9,"C-VOI-CONTENEUR":9,"C-VOI-PLATEFORME":9,"C-VOI-ACCES-BATIMENT":9,"C-VOI-PROTECTION":193,"C-VOI-ROULOTTE":9,"C-BAT-DIVERS":33,"C-BAT-MEMBRANE-PROJETÉE":36,"C-BAT-CHAMBRE-ELECTRIQUE":145,"C-DRA-FOSSE-FOND":121,"C-DRA-DALOT":121,"C-DRA-CANIVEAU":121,"C-DRA-FOSSE-CENTRE":121,"C-DRA-FOSSE-BORD":121,"C-DRA-EAU-NORM-BASS":121,"C-DRA-EAU-JOUR":131,"C-DRA-EAU-CENTRE":121,"C-DRA-EAU-NORM-HAUT":121,"C-DRA-EAU-EXTREME":121,"C-DRA-MUR":121,"C-DRA-PONCEAU":121,"C-DRA-BUSE":121,"C-DRA-EGOUT-PLUVIAL-ELEMENT":121,"C-DRA-AGRICOLE":121,"C-DRA-PROTECTION":121,"C-DRA-DRAIN":121,"C-MOD-SONDAGE":43,"C-DRA-EGOUT-PLUVIAL":121,"C-MOD-GEOTEXTILE":43,"C-DRA-DIGUE":121,"C-DRA-DIVERS":121,"C-DRA-RIVE":121,"C-DRA-RIVIERE-BORD":121,"C-DRA-RIVIERE-CENTRE":121,"C-DRA-ZONE-INONDABLE":121,"C-FER-VOIE":23,"C-FER-RAIL":23,"C-FER-ACCESSOIRE":23,"C-SIG-PETITE":93,"C-SIG-MARQ-DOUB-CONT":73,"C-SIG-MARQ-DOUB-MIXT":73,"C-SIG-SUPER-LATERALE":93,"C-SIG-SUPER-AERIENNE":93,"C-SIG-MARQ-CONTINUIT":73,"C-SIG-MARQ-GUIDAGE":73,"C-SIG-MARQ-SIMP-CONT":73,"C-SIG-MARQ-DISCONTIN":73,"C-SIG-MARQ-VOI-RESER":73,"C-SIG-PANN-PUBLICITA":93,"C-SIG-PANNEAU":93,"C-SIG-MARQ-PICTOGRAM":73,"C-SIG-FEUX":93,"C-SIG-ECLAIRAGE":93,"C-SIG-ACCESSOIRE":93,"C-GEO-LIGNE-REFERENC":241,"C-GEO-POINT-CALCUL":243,"C-STR-CAISSON-AV-BETON":150,"C-STR-CAISSON-TQC":203,"C-STR-COLONNE-AV-BETON":150,"C-STR-COLONNE-TQC":203,"C-STR-COLONNE-ACIER":8,"C-STR-ECROU-AV-BETON":150,"C-STR-CHEVETRE-AV-BETON":150,"C-STR-ASSISE-AV-BETON":150,"C-STR-CLE-CIS-AV-BETON":150,"C-STR-DIVERS_STRUCTURE":9,"C-STR-ECROU-TQC":203,"C-STR-CHEVETRE-TQC":203,"C-STR-ASSISE-TQC":203,"C-STR-CLE-CIS-TQC":203,"C-FON-CLOTURE":43,"C-FON-CLOTURE-MAILLE":43,"C-FON-OCCUPATION":11,"C-FON-MUR-MITOYEN":11,"C-FON-ALIGNEM-ROCHES":43,"C-MOD-FRONTIERE":21,"C-VOI-ACCOT-NONPAVE":9,"C-VOI-PAVAGE-CENTRE":9,"C-VOI-GRAVIER-CENTRE":9,"C-VOI-ENTREE-GRAVIER":51,"C-VOI-PAVAGE-BORD":9,"C-VOI-GRAVIER-BORD":9,"C-VOI-ENTREE-PAVE":51,"C-VOI-GLI-NON-ID":193,"C-VOI-TROTTOI-BORDUR":123,"C-VOI-ACCOT-PAVE":9,"C-VOI-GLI-TOL-BO":193,"C-VOI-GLI-TOL-AC":193,"C-VOI-GLI-BET-2F":193,"C-VOI-GLI-CAB-AC":193,"C-VOI-GLI-BET-1F":193,"C-VOI-GLI-CAB-BO":193,"C-VOI-GLI-TUB-AC":193,"C-VOI-BANDE":9,"C-MOD-PALIER-EXT":13,"C-MOD-PALIER-INT":83,"C-MOD-PREDECOUP-ROC":85,"C-MOD-INITIAL":85,"C-TOP-ROC-EN-SURFACE":223,"C-MOD-FINAL":43,"C-VOI-GLI-CAB-AC-2F":193,"C-VOI-GLI-TOL-AC-2F":193,"C-TOP-EXCAVATION":223,"C-VOI-DIVERS":9,"C-STR-PARAPET":193,"C-STR-PALPLANCHE":9,"C-TOP-DIVERS":7,"C-BAT-ACCES-BETON":33,"C-BAT-ACCES-PAVE-UNI":33,"C-VOI-PISTE-CYCLABLE":51,"C-VOI-SENTIER":51,"C-TOP-DÉCAPAGE":223,"C-VOI-BET-PROJETE":252,"C-VOI-COURS-EAU-VOIRIE":153,"C-VOI-TERRE-REMAN":17,"C-VOI-PC50":49,"C-VOI-PC300":19,"C-VOI-MR":15,"C-VOI-SABLE":59,"C-VOI-MG20":53,"C-VOI-MG112":57,"C-VOI-MG56":45,"C-VOI-POU-PIERRE":128,"C-REP-CONTROLE-PHOTO":11,"C-REP-ARPENTAGE":11,"C-REP-CHEMINEMENT":11,"C-REP-GEODESIQUE":11,"C-STR-TROU_ARPENTAGE":9,"C-SER-DIVERS":57,"C-REP-CIBLES":11,"C-REP-POLYGONALE":11,"C-VEG-ALIGNEM-ARBRES":81,"C-VEG-BOISE":81,"C-VEG-HAIE":81,"C-VEG-PLANTATION":81,"C-VEG-CULTURE":81,"C-VEG-ARBRE":81,"C-VEG-MARECAGE":111,"C-VEG-ENGAZONNEMENT":81,"C-VEG-JARDIN-LIMITE":81,"C-VEG-DIVERS":81,"C-TOP-TALUS-HAUT":223,"C-TOP-TALUS-BAS":223,"C-TOP-DECROCHEMENT":223,"C-TOP-COTE-BATHYMETR":123,"C-TOP-COTE-ALTIME":223,"C-TOP-CHANG-PENTE":223,"C-TOP-CHANG-PENTE-AP":223,"C-TOP-COTE-ALTIME-AP":223,"C-TOP-BANC-EMPRUNT":233,"C-TOP-EMPILEMENT":223,"C-TOP-FOUIL-ARCHEO":211,"C-TOP-FOND-FOUILLE":213,"C-STR-MUR-SOUTENEMEN":9,"C-STR-MASSIF-ANCRAGE":9,"C-STR-BUTOIR":253,"C-STR-JOINT":9,"C-STR-QUAI":9,"C-STR-DEBARCADERE":9,"C-STR-BARRAGE":9,"C-STR-PIEU":9,"C-STR-ANCRAGE":9,"C-STR-COFFRAGE":9,"C-STR-ARMATURE":9,"C-STR-APPUI":9,"C-STR-PLAQUE-ANCRAGE":36,"C-STR-BLOC-BETON":9,"C-STR-TUNNEL":9,"C-STR-VIADUC":9,"C-STR-VOUTE":9,"C-STR-MURET":9,"C-STR-MUR-BERLINOIS":11,"C-STR-ROC-BOLT":201,"C-STR-DYNAMITAGE-BLAST":256,"C-STR-PATRON-FORAGE":55,"C-STR-CAISSON":9,"C-SER-ELEC-TEL-NON-ID":57,"C-SER-ELEC-TEL-SOUT":231,"C-SER-ELEC-SOUTER":231,"C-SER-ELEC":57,"C-SER-TEL":57,"C-SER-ELEC-TEL":57,"C-SER-ELEC-TEL-HAUBAN":57,"C-SER-ELEC-LAMPAD":57,"C-SER-ELEC-TEL-LAMP":57,"C-SER-REGAR-NON-ID":141,"C-SER-AQUEDUC-ELEMENT":141,"C-SER-MOUSSE-CARBONI":141,"C-SER-TEL-SOUTER":231,"C-SER-GAZODUC":141,"C-SER-EGOUT-COMBINE-ELEMENT":141,"C-SER-EGOUT-SANITAIR-ELEMENT":141,"C-SER-OLEODUC":141,"C-SER-ELEC-TEL-AERIEN":57,"C-SER-MANCHON":94,"C-SER-ELEC-CONDUIT":233,"C-SER-TEL-AERIEN-FO":231,"C-SER-TEL-SOUTER-FO":231,"C-SER-GAZODUC-SOUTER":141,"C-SER-TEL-SOUTER-CONDUIT-FO":231,"C-SER-OLEODUC SOUTER":141,"C-SER-AQUEDUC":141,"C-DRA-POSTE-POMPAGE":121,"C-DRA-SOURCE":121,"C-DRA-ELEMENT":121,"C-SER-EGOUT-SANITAIR":141,"C-SER-EGOUT-COMBINE":141,"C-SER-BRANCHEMENT-COND":74,"C-SER-BRIDE":145}};
const LIAISON=/^(\d+)(?:\.(\d*(?:\.\d+)*))?$/;
const CMD_NEED={'2P':2,'2PD':2,'2D':2,'3PP':3,'4P':4,'3C':3,'RECT':3};
const CMD_RE=/(^|[_\s])(2PD|2P|2D|3PP|4P|3C|RECT)((?:[_\s]+[+-]?\d+(?:[.,]\d+)?)*)(?=$|[_\s])/i;
function buildCodes(dict){
  const m=new Map();
  for(const c of dict.codes) m.set(String(c[0]),{code:String(c[0]),abr:c[1],desc:c[2],cat:c[3],layer:c[4],src:c[5]==='g'?'gabarit':(c[5]==='d'?'déduit':'catégorie')});
  return m;
}
function splitCmd(desc){
  const s=desc||'';const m=CMD_RE.exec(s);
  if(!m) return {clean:s,cmd:null};
  const kind=m[2].toUpperCase();
  const vals=(m[3].match(/[+-]?\d+(?:[.,]\d+)?/g)||[]).map(v=>parseFloat(v.replace(',','.')));
  const text=kind+(m[3]?m[3].replace(/\s+/g,'_').replace(/^_?/,'_'):'');
  let clean=(s.slice(0,m.index)+(m[1]===' '?' ':'')+s.slice(m.index+m[0].length)).replace(/_+$/,'').replace(/^_+/,'').replace(/_\s|\s_/g,' ');
  return {clean,cmd:{kind,vals,text}};
}
function parseDesc(desc){
  const sc=splitCmd(desc);desc=sc.clean;
  const t=(desc||'').trim();
  const r={pcode:null,str:null,ctrl:null,attrs:[],links:[],err:null,spaces:(desc||'')!==t||/\s{2,}/.test(t)||/\s_|_\s/.test(t)};
  r.cmd=sc.cmd;r.cmdText=sc.cmd?sc.cmd.text:null;
  if(!t){if(!sc.cmd)r.err='Description vide';return r}
  const segs=t.split('_').map(s=>s.trim());
  let pc=null;
  for(let k=0;k<segs.length;k++){
    const tk=segs[k]?segs[k].split(/\s+/):[];
    if(!tk.length){r.err='Liaison vide entre deux « _ »';return r}
    const last=k===segs.length-1;
    let lk=null,rest=[];
    if(k===0){
      if(!/^\d{1,4}$/.test(tk[0])){r.err='Pcode non numérique';r.attrs=t.split(/\s+/);return r}
      pc=tk[0];
      if(tk[1]!=null&&LIAISON.test(tk[1])){lk=tk[1];rest=tk.slice(2)} else rest=tk.slice(1);
    } else if(tk.length>=2&&/^\d{1,4}$/.test(tk[0])&&LIAISON.test(tk[1])){pc=tk[0];lk=tk[1];rest=tk.slice(2)}
    else if(LIAISON.test(tk[0])){lk=tk[0];rest=tk.slice(1)}
    else {r.err=`Liaison « ${segs[k]} » illisible`;return r}
    if(rest.length&&!last){r.err=`Attributs avant la fin des liaisons (« ${rest.join(' ')} »)`;return r}
    if(k===0) r.pcode=pc;
    if(lk!=null){const m=LIAISON.exec(lk);r.links.push({pcode:pc,str:m[1],ctrl:m[2]===undefined?null:m[2]});}
    else if(!last){if(k===0){r.pcodeOnly=true}else{r.err='Liaison manquante avant « _ »';return r}}
    if(last) r.attrs=rest;
  }
  // « 9_526 1.2 » : code ponctuel 9 + liaison du 526 (pcodeOnly) ; sinon la 1re liaison porte le Pcode du point
  if(r.links.length&&!r.pcodeOnly){r.str=r.links[0].str;r.ctrl=r.links[0].ctrl;if(r.links[0].pcode!==r.pcode)r.pcode=r.links[0].pcode;}
  return r;
}
function formatDesc(p){
  const fl0=l=>l.str+(l.ctrl?'.'+l.ctrl:'');
  if(p.pcodeOnly&&(p.links||[]).length){const s=[p.pcode].concat(p.links.map(l=>l.pcode+' '+fl0(l))).join('_');
    const out=[s].concat(p.attrs||[]).filter(x=>x!=null&&x!=='').join(' ');return p.cmdText?out+'_'+p.cmdText:out;}
  // la 1re liaison suit p.pcode / p.str / p.ctrl (édition simple) ; les suivantes viennent de p.links
  const L=[];
  if(p.str!=null&&p.str!=='') L.push({pcode:p.pcode,str:p.str,ctrl:p.ctrl});
  for(const l of (p.links||[]).slice(1)) if(l&&l.str!=null&&l.str!=='') L.push(l);
  const fl=l=>l.str+(l.ctrl?'.'+l.ctrl:'');
  let s=p.pcode||'';
  L.forEach((l,k)=>{ if(k===0) s+=' '+fl(l); else s+='_'+(l.pcode||L[k-1].pcode)+' '+fl(l); /* Pcode toujours répété : « 176 3.1_176 1.1 » */ });
  const out=[s].concat(p.attrs||[]).filter(x=>x!=null&&x!=='').join(' ');
  return p.cmdText?(out?out+'_'+p.cmdText:p.cmdText):out;
}
function addLinkDesc(desc,link){
  const key=link.pcode+'|'+link.str;const p=parseDesc(desc);
  if(p.links.some(l=>l.pcode+'|'+l.str===key)) return patchLinkDesc(desc,key,l=>{l.ctrl=link.ctrl});
  if(p.err&&!p.pcode) return formatDesc({pcode:link.pcode,str:link.str,ctrl:link.ctrl,attrs:p.attrs,cmdText:p.cmdText});
  if(!p.links.length){
    if(!p.pcode||p.pcode===link.pcode) return formatDesc({pcode:link.pcode,str:link.str,ctrl:link.ctrl,attrs:p.attrs,cmdText:p.cmdText});
    return formatDesc({pcode:p.pcode,pcodeOnly:true,links:[link],attrs:p.attrs,cmdText:p.cmdText});
  }
  const links=p.links.map(l=>Object.assign({},l)).concat([link]);
  if(p.pcodeOnly) return formatDesc({pcode:p.pcode,pcodeOnly:true,links,attrs:p.attrs,cmdText:p.cmdText});
  return formatDesc({pcode:links[0].pcode,str:links[0].str,ctrl:links[0].ctrl,links,attrs:p.attrs,cmdText:p.cmdText});
}
function patchLinkDesc(desc,key,fn){
  const p=parseDesc(desc);if(p.err)return desc;
  const links=p.links.map(l=>Object.assign({},l));
  const k=links.findIndex(l=>l.pcode+'|'+l.str===key);
  if(k<0)return desc;
  const res=fn(links[k]);
  if(res===null) links.splice(k,1);
  if(!links.length) return formatDesc({pcode:p.pcode,str:null,ctrl:null,attrs:p.attrs,cmdText:p.cmdText});
  if(p.pcodeOnly) return formatDesc({pcode:p.pcode,pcodeOnly:true,links,attrs:p.attrs,cmdText:p.cmdText});
  return formatDesc({pcode:links[0].pcode,str:links[0].str,ctrl:links[0].ctrl,links,attrs:p.attrs,cmdText:p.cmdText});
}
function calcCmd(kind,P,vals,o){
  o=o||{};const V=k=>(vals&&vals[k]&&vals[k].length)?vals[k][0]:null;
  const zOf=(def)=>o.zMode==='pt'&&P[o.zIdx]?P[o.zIdx].z:o.zMode==='val'&&isFinite(o.zVal)?+o.zVal:o.zMode==='moy'||def==null?P.reduce((s,p)=>s+p.z,0)/P.length:def;
  const [A,B]=P;const L=A&&B?Math.hypot(B.e-A.e,B.n-A.n):0;
  if(['2P','2PD','2D','3PP'].includes(kind)&&L<1e-6) return {err:'les deux premiers points sont confondus'};
  const ux=L?(B.e-A.e)/L:0,uy=L?(B.n-A.n)/L:0;
  switch(kind){
    case '2P': return {e:(A.e+B.e)/2,n:(A.n+B.n)/2,z:o.zMode?zOf():(A.z+B.z)/2,ref:[A,B]};
    case '2PD':{
      let from=o.from,d=o.d;
      if(from==null){const d1=V(0),d2=V(1);
        if(d1!=null&&d2!=null) return {err:'la distance doit être inscrite sur un seul des deux points'};
        if(d1==null&&d2==null) return {err:'aucune distance inscrite (ex. 2PD_1.00)'};
        from=d1!=null?1:2;d=d1!=null?d1:d2;}
      if(!isFinite(d)) return {err:'distance invalide'};
      const O=from===1?A:B;const t=(from===1?0:L)+d;
      return {e:O.e+ux*d,n:O.n+uy*d,z:o.zMode?zOf():A.z+(B.z-A.z)*t/L,from,d,ref:[A,B]};}
    case '2D':{
      let d1=o.d1!=null?o.d1:V(0),d2=o.d2!=null?o.d2:V(1);
      if(d1==null||d2==null) return {err:'il faut une distance sur chacun des deux points (ex. 2D_5.00 et 2D_4.00)'};
      let side=o.side!=null?o.side:((d1<0||d2<0)?-1:1);d1=Math.abs(d1);d2=Math.abs(d2);
      const a=(d1*d1-d2*d2+L*L)/(2*L),h2=d1*d1-a*a;
      if(h2<-1e-9) return {err:`les distances ${d1.toFixed(3)} et ${d2.toFixed(3)} ne se croisent pas (base ${L.toFixed(3)} m)`};
      const h=Math.sqrt(Math.max(0,h2));
      return {e:A.e+ux*a+side*h*uy,n:A.n+uy*a-side*h*ux,z:zOf(),d1,d2,side,ref:[A,B]};}
    case '3PP':{const C=P[2];const t=(C.e-A.e)*ux+(C.n-A.n)*uy;
      return {e:A.e+ux*t,n:A.n+uy*t,z:o.zMode?zOf():A.z+(B.z-A.z)*t/L,ref:[A,B,C]};}
    case '4P':{const [p1,p2,p3,p4]=P;const d=(p1.e-p2.e)*(p3.n-p4.n)-(p1.n-p2.n)*(p3.e-p4.e);
      if(Math.abs(d)<1e-9) return {err:'les droites 1-2 et 3-4 sont parallèles'};
      const t=((p1.e-p3.e)*(p3.n-p4.n)-(p1.n-p3.n)*(p3.e-p4.e))/d;
      return {e:p1.e+t*(p2.e-p1.e),n:p1.n+t*(p2.n-p1.n),z:zOf(),ref:P};}
    case '3C':{const C=circle3([P[0].e,P[0].n],[P[1].e,P[1].n],[P[2].e,P[2].n]);
      if(!C) return {err:'les 3 points sont alignés'};
      return {e:C.x,n:C.y,z:zOf(),r:C.r,ref:P};}
    case 'RECT':{const [a,b,cc]=P;return {e:a.e+cc.e-b.e,n:a.n+cc.n-b.n,z:o.zMode?zOf():a.z+cc.z-b.z,ref:P};}
  }
  return {err:'commande inconnue'};
}
function circle3(a,b,c){
  const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
  if(Math.abs(d)<1e-9) return null;
  const a2=a[0]*a[0]+a[1]*a[1],b2=b[0]*b[0]+b[1]*b[1],c2=c[0]*c[0]+c[1]*c[1];
  const x=(a2*(b[1]-c[1])+b2*(c[1]-a[1])+c2*(a[1]-b[1]))/d;
  const y=(a2*(c[0]-b[0])+b2*(a[0]-c[0])+c2*(b[0]-a[0]))/d;
  return {x,y,r:Math.hypot(a[0]-x,a[1]-y)};
}
function arc3pts(a,b,c,step){
  const C=circle3(a,b,c); if(!C) return [a,b,c];
  const ang=p=>Math.atan2(p[1]-C.y,p[0]-C.x);
  let t0=ang(a),t1=ang(b),t2=ang(c);
  const norm=v=>{while(v<0)v+=2*Math.PI;while(v>=2*Math.PI)v-=2*Math.PI;return v};
  const ccw=norm(t1-t0)<norm(t2-t0);
  let sweep=ccw?norm(t2-t0):-norm(t0-t2);
  const sb=ccw?norm(t1-t0):-norm(t0-t1);
  const n=Math.max(4,Math.ceil(Math.abs(sweep)*C.r/step));
  const out=[];
  for(let i=0;i<=n;i++){const t=t0+sweep*i/n;const f=i/n;
    const z=Math.abs(sweep*f)<=Math.abs(sb)? a[2]+(b[2]-a[2])*(sweep*f/sb||0) : b[2]+(c[2]-b[2])*((sweep*f-sb)/(sweep-sb)||0);
    out.push([C.x+C.r*Math.cos(t),C.y+C.r*Math.sin(t),z]);}
  out[0]=a.slice();out[out.length-1]=c.slice();
  return out;
}
function catmull(P,step){ // centripète, passe par chaque point
  const out=[P[0].slice()];
  for(let i=0;i<P.length-1;i++){
    const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
    const tj=(a,b)=>Math.pow(Math.hypot(b[0]-a[0],b[1]-a[1])||1e-6,0.5);
    const t0=0,t1=t0+tj(p0,p1),t2=t1+tj(p1,p2),t3=t2+tj(p2,p3);
    const L=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);
    const n=Math.max(2,Math.ceil(L/step));
    for(let s=1;s<=n;s++){
      const t=t1+(t2-t1)*s/n;
      const lerp=(pa,pb,ta,tb)=>{const w=(tb-ta)||1e-9;return [0,1].map(k=>((tb-t)*pa[k]+(t-ta)*pb[k])/w)};
      const A1=lerp(p0,p1,t0,t1),A2=lerp(p1,p2,t1,t2),A3=lerp(p2,p3,t2,t3);
      const B1=lerp(A1,A2,t0,t2),B2=lerp(A2,A3,t1,t3);
      const C=lerp(B1,B2,t1,t2);
      out.push([C[0],C[1],p1[2]+(p2[2]-p1[2])*s/n]);
    }
  }
  return out;
}
function segInter(a,b,c,d){
  const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const d1=o(c,d,a),d2=o(c,d,b),d3=o(a,b,c),d4=o(a,b,d);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
}
function analyze(rows,codes,opt){
  const issues=[],lines=[];
  const open=new Map(),prevLine=new Map();
  const add=(sev,row,msg,kind,extra)=>issues.push(Object.assign({sev,row,msg,kind},extra||{}));
  let lid=0;
  const finalize=(L)=>{
    if(!L) return;
    open.delete(L.key);
    if(L.type==='circle'){
      if(L.pts.length<2||L.pts.length>3) add('err',L.pts[0],`Cercle ${L.key.replace('|',' / string ')} avec ${L.pts.length} point(s) : il en faut 2 ou 3.`,'circle');
      else lines.push(L);
      return;
    }
    if(L.curve!=null){L.curves.push([L.curve,L.pts.length-1]);add('warn',L.pts[L.curve],'Courbe débutée (.3) sans fin de courbe (.4) : elle se termine au dernier point de la ligne.','curveOpen',{last:L.pts[L.pts.length-1],key:L.key});L.curve=null;}
    if(L.pts.length<2){add('err',L.pts[0],`Ligne d'un seul point : le string ${L.str} du code ${L.pcode} débute ici mais ne continue jamais.`,'single',{line:L,key:L.key});}
    else if(L.closed&&L.pts.length<3){add('err',L.pts[L.pts.length-1],'Fermeture (.2) d\'une ligne de moins de 3 points.','closeShort',{key:L.key});}
    if(L.pts.length>=2) lines.push(L);
    prevLine.set(L.key,L);
  };
  const names=new Map();
  for(const r of rows){
    if(r.del){r.p=null;continue} // point effacé : exclu de l'analyse et de l'exportation (rétablissable)
    if(r.bad){add('err',r.i,'Coordonnées illisibles sur cette ligne du fichier.','coords');continue}
    if(names.has(r.name)) add('warn',r.i,`Matricule en double (déjà utilisé au point ${rows[names.get(r.name)].name}).`,'dupName'); else names.set(r.name,r.i);
    const p=r.p=parseDesc(r.desc);
    if(r.ctl==='ref')continue; // coordonnées de référence (points connus, station) : pas de contrôle de code
    if(p.err){if(r.cmdRef&&p.err==='Description vide')add('info',r.i,'Point de référence d\'une commande, sans code (description vide).','fmt');else add('err',r.i,p.err+'.','fmt');continue}
    if(p.spaces) add('info',r.i,'Espaces superflus dans la description.','spaces');
    for(const pc of new Set([p.pcode,...p.links.map(l=>l.pcode)])) if(pc!=null&&!codes.has(pc)) add('err',r.i,`Code ${pc} absent de la liste ArpentNord.`,'unknown',{pcode:pc});
    const seen=new Set();
    for(const lk of p.links){
    const key=lk.pcode+'|'+lk.str;
    if(seen.has(key)){add('err',r.i,`Le string ${lk.str} du code ${lk.pcode} apparaît deux fois sur ce point.`,'dupLink',{key});continue}
    seen.add(key);
    // contrôle simple (.1) ou composé (.1.6 = début + cercle, .4.2 = fin de courbe + fermer, .4.3 = fin et début de courbe)
    let cs=lk.ctrl===null||lk.ctrl===''?[]:String(lk.ctrl).split('.').filter(x=>x!=='');
    if(cs.some(x=>!/^[1-7]$/.test(x))){add('err',r.i,`Code de contrôle .${lk.ctrl} inconnu (valeurs permises : .1 à .7, combinables ex. .1.6, .4.2).`,'badCtrl',{key});cs=[];}
    const has=d=>cs.includes(d);
    let L=open.get(key);
    const mk=(type)=>{const N={id:lid++,key,pcode:lk.pcode,str:lk.str,pts:[],curves:[],curve:null,closed:false,type};open.set(key,N);return N};
    if(has('6')){
      if(!L||L.type!=='circle'||has('1')||L.pts.length>=3){finalize(L);L=mk('circle');}
      L.pts.push(r.i); if(L.pts.length===3) finalize(L);
      continue;
    }
    // .6 : cercle par 2 ou 3 points ; les points suivants du même string (sans contrôle ou .7) complètent le cercle
    if(L&&L.type==='circle'&&cs.every(x=>x==='7'||x==='2')&&L.pts.length<3){L.pts.push(r.i);if(L.pts.length===3)finalize(L);continue}
    if(L&&L.type==='circle'){finalize(L);L=null;}
    if(has('1')){finalize(L);L=mk('line');L.pts.push(r.i);if(has('3'))L.curve=0;continue}
    if(has('3')&&!has('4')){ if(!L){L=mk('line');} L.pts.push(r.i); if(L.curve!=null){L.curves.push([L.curve,L.pts.length-1]);} L.curve=L.pts.length-1; if(has('2')){L.closed=true;finalize(L);} continue}
    if(!L){
      add('err',r.i,has('2')?`Fermeture (.2) sans ligne ouverte pour le string ${lk.str} (code ${lk.pcode}).`:`Continuation du string ${lk.str} (code ${lk.pcode}) sans début de ligne (.1).`,'orphan',{ctrl:has('2')?2:(cs.length?+cs[0]:0),key});
      continue;
    }
    L.pts.push(r.i);
    if(has('4')){ if(L.curve==null) add('warn',r.i,'Fin de courbe (.4) sans début de courbe (.3).','endNoCurve',{key}); else {L.curves.push([L.curve,L.pts.length-1]);L.curve=null;} if(has('3'))L.curve=L.pts.length-1; }
    if(has('5')&&L.curve==null) add('warn',r.i,'Point de courbe (.5) hors d\'une courbe : traité comme point de ligne.','midNoCurve',{key});
    if(has('2')){L.closed=true;finalize(L);}
    }
  }
  for(const L of [...open.values()]) finalize(L);
  /* Continuation d'un string qui ne débute que plus loin dans le fichier :
     le point a été levé avant la ligne ; on propose de le rejoindre en fin de ligne (point copié) */
  for(const is of issues){
    if(is.kind!=='orphan'||is.ctrl===2) continue;
    const later=lines.filter(L=>L.key===is.key&&L.type==='line'&&L.pts[0]>is.row).sort((a,b)=>a.pts[0]-b.pts[0])[0];
    if(!later) continue;
    is.joinLine=later;
    const [pc,st]=is.key.split('|');
    is.msg=`Le string ${st} du code ${pc} ne débute qu'au point ${rows[later.pts[0]].name}, levé après celui-ci : la liaison ne peut pas se faire dans l'ordre du levé.`+(later.closed?' (la ligne est fermée par .2)':'');
  }

  /* Commandes terrain : regroupées dans l'ordre du fichier ; une commande doit être complète avant la suivante */
  const cmds=[];let act=null;
  const closeAct=(why)=>{if(act){add('err',act.refs[0],`Commande ${act.kind} incomplète : ${act.refs.length}/${CMD_NEED[act.kind]} point(s)${why?' — '+why:''}.`,'cmdBad',{group:act});act=null}};
  for(const r of rows){
    const cm=r.p&&r.p.cmd;if(!cm)continue;
    if(act&&act.kind!==cm.kind) closeAct(`interrompue par ${cm.kind} au point ${r.name}`);
    if(!act) act={kind:cm.kind,refs:[],vals:[]};
    act.refs.push(r.i);act.vals.push(cm.vals);
    if(act.refs.length===CMD_NEED[act.kind]){
      const g=act;act=null;
      const res=calcCmd(g.kind,g.refs.map(i=>rows[i]),g.vals,{});
      if(res.err) add('err',g.refs[g.refs.length-1],`Commande ${g.kind} (${g.refs.map(i=>rows[i].name).join(', ')}) : ${res.err}`,'cmdBad',{group:g});
      else {g.res=res;cmds.push(g);add('info',g.refs[g.refs.length-1],`Commande terrain ${g.kind} (${g.refs.map(i=>rows[i].name).join(', ')}) : point à créer en E ${res.e.toFixed(3)} · N ${res.n.toFixed(3)} · Z ${res.z.toFixed(3)}.`,'cmd',{group:g});}
    }
  }
  closeAct('fin du fichier atteinte');
  /* contrôles géométriques */
  const P=i=>[rows[i].e,rows[i].n,rows[i].z];
  for(const L of lines){
    if(L.type==='circle') continue;
    const seq=L.pts.map(P);
    if(L.closed) seq.push(seq[0]);
    for(let k=1;k<seq.length;k++){
      const d=Math.hypot(seq[k][0]-seq[k-1][0],seq[k][1]-seq[k-1][1]);
      const ri=L.pts[k%L.pts.length];
      if(d<opt.dup) add('warn',ri,`Point confondu avec le précédent de la ligne (${(d*1000).toFixed(0)} mm).`,'dup');
      else if(d>opt.maxSeg) add('warn',ri,`Segment de ${d.toFixed(1)} m depuis le point ${rows[L.pts[k-1]].name} : string ou code possiblement erroné.`,'long');
    }
    for(let a=0;a<seq.length-1;a++) for(let b=a+2;b<seq.length-1;b++){
      if(L.closed&&a===0&&b===seq.length-2) continue;
      if(segInter(seq[a],seq[a+1],seq[b],seq[b+1])){
        // 2-opt : inverser l'ordre des points a+1..b décroise ; si ce sont deux points, on propose l'échange
        const pa=L.pts[(a+1)%L.pts.length],pb=L.pts[b%L.pts.length];
        const ex=b-(a+1)===1?{swap:[pa,pb]}:{};
        add('warn',pa,`La ligne ${L.pcode} / string ${L.str} se croise entre ${rows[L.pts[a]].name}–${rows[pa].name} et ${rows[pb].name}–${rows[L.pts[(b+1)%L.pts.length]].name} : points levés dans le mauvais ordre ?`,'cross',ex);b=seq.length;a=seq.length;}
    }
  }
  /* lignes ouvertes de 3 points à angle quasi droit : rectangle à compléter ? */
  for(const L of lines){
    if(L.type!=='line'||L.closed||L.pts.length!==3||L.curves.length) continue;
    if(L.pts.some(i=>rows[i].p&&rows[i].p.cmd)) continue; // une commande terrain (2PD, RECT…) décide déjà du point à créer
    const q=rectFourth(rows[L.pts[0]],rows[L.pts[1]],rows[L.pts[2]]);
    if(Math.abs(q.ang-90)<=12) add('info',L.pts[2],`Ligne ouverte de 3 points (${q.ang.toFixed(1)}° au point ${rows[L.pts[1]].name}) : rectangle à compléter ?`,'rect',{rect:L.pts.slice(),ang:q.ang});
  }
  /* sauts de numérotation */
  // les points calculés (ajoutés ou attribut CALCUL) sont hors séquence : on ne les compte pas
  const seqRows=rows.filter(r=>/^\d+$/.test(r.name)&&!r.added&&!r.ctl&&!(r.p&&r.p.attrs&&r.p.attrs.includes('CALCUL'))).sort((a,b)=>(+a.name)-(+b.name)); // ordre numérique (certains exports, ex. FRT Leica, regroupent les points par ligne)
  const used=new Set(rows.map(r=>r.name));
  for(let k=1;k<seqRows.length;k++){
    const a=+seqRows[k-1].name,b=+seqRows[k].name;
    if(b-a>1&&b-a<1000){
      const missing=[];for(let v=a+1;v<b;v++)if(!used.has(String(v).padStart(seqRows[k].name.length,'0')))missing.push(v);
      if(!missing.length)continue;
      add('info',seqRows[k].i,missing.length===1?`Matricule ${missing[0]} absent de la séquence.`:`${missing.length} matricules absents (${missing[0]} à ${missing[missing.length-1]}).`,'gap');
    }
  }
  const rank={err:0,warn:1,info:2};
  issues.sort((a,b)=>rank[a.sev]-rank[b.sev]||(b.kind==='cmd')-(a.kind==='cmd')||(a.kind==='rect')-(b.kind==='rect')||a.row-b.row);
  return {issues,lines,cmds};
}
function lineVerts(L,rows,step){
  const P=i=>[rows[i].e,rows[i].n,rows[i].z];
  if(L.type==='circle'){
    const p=L.pts.map(P);let C;
    if(p.length===2) C={x:(p[0][0]+p[1][0])/2,y:(p[0][1]+p[1][1])/2,r:Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])/2};
    else C=circle3(p[0],p[1],p[2]);
    if(!C) return {circle:null,verts:p};
    const z=p.reduce((s,q)=>s+q[2],0)/p.length;
    const v=[];for(let i=0;i<=72;i++){const t=i/72*2*Math.PI;v.push([C.x+C.r*Math.cos(t),C.y+C.r*Math.sin(t),z]);}
    return {circle:{x:C.x,y:C.y,z,r:C.r},verts:v};
  }
  const pts=L.pts.map(P);
  const cmap=new Map(L.curves.filter(c=>c[1]-c[0]>=2).map(c=>[c[0],c[1]]));
  const v=[pts[0].slice()];
  for(let i=0;i<pts.length-1;){
    if(cmap.has(i)){
      const j=cmap.get(i);const sub=pts.slice(i,j+1);
      const cv=sub.length===3?arc3pts(sub[0],sub[1],sub[2],step):catmull(sub,step);
      for(let k=1;k<cv.length;k++) v.push(cv[k]);
      i=j;
    } else {v.push(pts[i+1].slice());i++;}
  }
  if(L.closed) v.push(pts[0].slice());
  return {verts:v};
}
function rectFourth(A,B,C){
  const ang=Math.abs(Math.atan2((A.e-B.e)*(C.n-B.n)-(A.n-B.n)*(C.e-B.e),(A.e-B.e)*(C.e-B.e)+(A.n-B.n)*(C.n-B.n)))*180/Math.PI;
  return {e:A.e+C.e-B.e,n:A.n+C.n-B.n,z:A.z+C.z-B.z,ang,ab:Math.hypot(A.e-B.e,A.n-B.n),bc:Math.hypot(C.e-B.e,C.n-B.n)};
}
function swapPoints(A,B,withDesc){
  for(const k of ['e','n','z','xyz','bad']){const t=A[k];A[k]=B[k];B[k]=t;}
  if(withDesc){const t=A.desc;A.desc=B.desc;B.desc=t;}
}
function aci(i){
  const fx={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#ffffff',8:'#808080',9:'#c0c0c0'};
  if(fx[i]) return fx[i];
  if(i>=250&&i<=255){const g=[51,91,132,173,214,255][i-250];return `rgb(${g},${g},${g})`}
  if(!(i>=10&&i<250)) return '#ffffff';
  const h=Math.floor((i-10)/10)*15,k=(i-10)%10,v=[1,1,.8,.8,.6,.6,.5,.5,.3,.3][k],s=k%2?.5:1;
  const f=n=>{const kk=(n+h/60)%6;return Math.round(255*(v-v*s*Math.max(0,Math.min(kk,4-kk,1))))};
  return `rgb(${f(5)},${f(3)},${f(1)})`;
}
  var CODES = buildCodes({ codes: DICT.codes.map(function (c) { return [c[0], '', '', '', c[1], 'g']; }) });
  function layerOf(pc) { var c = CODES.get(String(pc)); return c ? c.layer : 'C-TOP-DIVERS'; }
  function colorOf(pc) { var L = layerOf(pc); var i = DICT.layers[L]; return aci(i == null ? 7 : i); }
  var api = { parseDesc: parseDesc, formatDesc: formatDesc, splitCmd: splitCmd, addLinkDesc: addLinkDesc, patchLinkDesc: patchLinkDesc,
    calcCmd: calcCmd, CMD_NEED: CMD_NEED, analyze: analyze, lineVerts: lineVerts, rectFourth: rectFourth, swapPoints: swapPoints,
    circle3: circle3, aci: aci, CODES: CODES, layerOf: layerOf, colorOf: colorOf, VERSION: "v9.7" };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoteurLeve = api;
})(typeof window !== 'undefined' ? window : globalThis);
