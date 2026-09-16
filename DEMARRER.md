# Phase 2 : lecteur Web local

Cette version React lit le format JSON de la phase 1. Elle ne modifie pas ton application Expo et n'envoie aucun média à un serveur. OneDrive et l'authentification Microsoft ne sont pas encore branchés.

## Essai sur Windows

Décompresse le ZIP dans un NOUVEAU dossier, différent du projet Expo. Installe Node.js 22.12 ou plus récent si nécessaire.
Dans PowerShell, depuis ce nouveau dossier :

```powershell
npm ci
npm run dev
```

Ouvre l'adresse affichée (habituellement http://127.0.0.1:5173).
Clique « Ouvrir un dossier », puis choisis le dossier `exemple` inclus. Il contient une mire synthétique, un son de test et un JSON de quatre angles. Ce ne sont pas des images de sportifs.

Tu peux ensuite choisir ton vrai dossier d'analyse ou sélectionner `analyse.json`, les vidéos et les audios ensemble. Si les noms ont changé lors du transfert, associe les fichiers dans « Fichiers de l'analyse ». L'association d'un média remet le lecteur au début.

Le sélecteur crée des URL locales vers les fichiers choisis ; il ne télécharge pas les quatre vidéos dans des Blob JavaScript. La sélection du JSON seul ne donne pas au navigateur accès aux chemins privés `file://` de l'application : il faut choisir aussi les médias.

Formats : le navigateur doit savoir décoder les fichiers. MP4 H.264 et audio AAC sont les formats à privilégier pour les essais entre Android, iOS et ordinateur. Une vidéo HEVC dépendra des capacités du navigateur et de l'appareil.

Lecture : une seule horloge, celle de la vidéo maître. requestVideoFrameCallback quand disponible, sinon timeupdate. La gomme est temporelle, le retour arrière rétablit les dessins précédents. Les notes suivent la politique « dernière note prioritaire » du mobile. Les décalages positifs et négatifs sont respectés ; les angles hors plage sont masqués. Les lecteurs secondaires sont recalés au-delà de 120 ms de dérive ; quatre décodeurs indépendants ne garantissent pas un verrouillage image par image.

## Obtenir les fichiers depuis Android

L'export précédent reste dans le dossier privé de Slalom Coach Pro. Il n'apparaît pas automatiquement dans Téléchargements.
Le fichier `PARTAGE-MOBILE.md` fournit un remplacement ciblé pour ajouter le partage natif des fichiers exportés. Il n'ajoute aucun package. Tu peux ainsi enregistrer ou envoyer les fichiers avec une application déjà installée, puis les ouvrir sur l'ordinateur.

## GitHub Pages

Utilise un dépôt séparé pour le portail. Place le contenu du ZIP à sa racine, y compris le dossier `.github`. Ne publie pas tes vidéos ni les exports réels du club dans ce dépôt. Le petit dossier `exemple` est une mire de test publique.
Dans le dépôt : Settings → Pages → Source → GitHub Actions.
Le workflow fourni construit le site et le publie après un push sur `main`, ou par lancement manuel depuis Actions. Les chemins de compilation sont relatifs pour fonctionner sous /nom-du-depot/.

```powershell
npm test
npm run build
```

Aucune publication n'a été exécutée ici : le dépôt GitHub de destination n'a pas encore été fourni.

## Suite : OneDrive

Le lecteur et le moteur temporel seront conservés. La couche d'accès aux fichiers sera remplacée par une connexion Microsoft et des URL temporaires Microsoft Graph, renouvelées à partir des identifiants persistants des fichiers.
À définir avant de brancher l'authentification : l'adresse GitHub Pages du portail et l'identifiant public de l'application Microsoft (client ID). L'inscription de l'application concerne le développeur ; les clubs ne devraient avoir qu'à se connecter et donner leur consentement. Le partage entre coach et athlètes devra utiliser les droits propres de chaque utilisateur.

Références :
https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
