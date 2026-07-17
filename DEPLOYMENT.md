# Déployer MSD Analysis sur une machine du labo (Windows)

Guide pas à pas pour héberger l'application sur un ordinateur Windows du labo qui reste
allumé en continu, accessible par tout le monde sur le réseau local. Postgres, l'API NestJS
et l'interface Angular tournent chacun dans un conteneur Docker.

- **Machine cible** : Windows 10/11, allumée en continu
- **Composants** : Postgres · API (port 3000) · UI (port 8080)
- **Accès** : réseau local du labo uniquement

## En bref, pour qui connaît déjà Docker

1. Installer Docker Desktop + Git sur la machine du labo.
2. `git clone` les deux dépôts, `cp .env.example .env` côté API et changer `DB_PASSWORD`.
3. `docker compose up -d --build` dans le dossier API.
4. Trouver l'IP locale (`ipconfig`), créer un `.env` côté UI avec `API_URL=http://IP:3000`,
   puis `docker compose up -d --build`.
5. Ouvrir les ports 3000/8080 dans le pare-feu Windows (profil Privé).

## 1. Prérequis

À installer une seule fois sur la machine qui hébergera l'application.

**Docker Desktop** — télécharge et installe [Docker Desktop](https://www.docker.com/products/docker-desktop/).
Il s'appuie sur WSL2 : sur Windows 10, il faut la version 2004 ou plus récente ; sur
Windows 11, ça fonctionne d'office. L'installeur active WSL2 tout seul — s'il demande un
redémarrage, fais-le avant de continuer.

> Si l'installation échoue : la virtualisation matérielle (Intel VT-x / AMD-V) doit être
> activée dans le BIOS/UEFI. Activée par défaut sur la plupart des PC récents, mais certains
> modèles pro la désactivent en usine.

**Git pour Windows** — installe [Git pour Windows](https://git-scm.com/downloads/win). Il
sert à récupérer le code et, plus tard, à installer les mises à jour. Il fournit aussi
« Git Bash », réutilisé à l'étape 9 pour planifier les sauvegardes.

**Accès aux dépôts GitHub** — les deux dépôts (`msd-analysis-api`, `msd-analysis-ui`) sont
privés : la personne qui fait le déploiement doit avoir un compte GitHub avec accès. Une fois
l'appli lancée, les utilisateurs du labo n'ont besoin d'aucun compte GitHub.

## 2. Récupérer le code

Ouvre PowerShell et choisis un dossier de travail, par exemple `C:\msd-analysis`.

```powershell
mkdir C:\msd-analysis
cd C:\msd-analysis
git clone https://github.com/Nesto33/msd-analysis-api.git
git clone https://github.com/Nesto33/msd-analysis-ui.git
```

Git demandera de te connecter à GitHub au premier `clone` — une fenêtre de connexion s'ouvre
normalement toute seule.

## 3. Configurer et lancer l'API

Postgres et l'API démarrent ensemble, dans le même `docker compose`.

```powershell
cd C:\msd-analysis\msd-analysis-api
copy .env.example .env
notepad .env
```

**À changer avant de continuer** : dans le `.env` qui s'ouvre, remplace la valeur de
`DB_PASSWORD` par un mot de passe à toi — la valeur par défaut est visible publiquement sur
GitHub. Enregistre et ferme le fichier.

```powershell
docker compose up -d --build
```

Premier lancement : télécharge les images et construit l'API, ça prend quelques minutes.
Postgres démarre, puis l'API applique automatiquement le schéma de base de données (aucune
commande à taper pour ça).

```powershell
curl http://localhost:3000/analysis
```

Une réponse `[]` confirme que l'API tourne et parle à la base de données.

## 4. Trouver l'adresse IP de la machine

C'est cette adresse que le reste du labo utilisera pour joindre l'application.

```powershell
ipconfig
```

Cherche la section de ta carte Wi-Fi ou Ethernet active, puis la ligne `Adresse IPv4` —
typiquement de la forme `192.168.x.x` ou `10.x.x.x`. Note cette adresse, elle sert dès
l'étape suivante.

> Astuce : si le routeur du labo le permet, réserve cette IP pour la machine (« IP réservée »
> / « DHCP statique » dans l'admin du routeur) — sinon elle peut changer après un redémarrage
> du routeur, et il faudra reconfigurer l'UI.

## 5. Configurer et lancer l'UI

L'interface a besoin de savoir où joindre l'API — remplace `192.168.1.50` par l'IP notée à
l'étape précédente.

```powershell
cd C:\msd-analysis\msd-analysis-ui
"API_URL=http://192.168.1.50:3000" | Out-File -Encoding ascii .env
docker compose up -d --build
```

L'UI se construit et démarre sur le port 8080. Ouvre `http://localhost:8080` dans un
navigateur sur cette même machine pour vérifier que la page s'affiche.

## 6. Ouvrir le pare-feu Windows

Sans ça, l'application ne répond qu'à la machine elle-même — personne d'autre au labo ne
peut la joindre. Ouvre PowerShell **en tant qu'administrateur** (clic droit dans le menu
Démarrer → « Exécuter en tant qu'administrateur ») :

```powershell
New-NetFirewallRule -DisplayName "MSD Analysis UI" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "MSD Analysis API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

Le profil `Private` limite l'accès au réseau local du labo — ni internet, ni un réseau Wi-Fi
public.

## 7. Vérifier depuis un autre poste

Le vrai test : quelqu'un d'autre au labo doit pouvoir y accéder. Depuis un autre ordinateur
connecté au même réseau, ouvre `http://192.168.1.50:8080` (avec la vraie IP notée à l'étape
4). La page MSD Analysis doit s'afficher, et un import de fichier Excel doit fonctionner de
bout en bout.

Si ça ne répond pas, voir la section [Dépannage](#11-dépannage) — c'est presque toujours
soit le pare-feu, soit une IP qui a changé.

## 8. Redémarrage automatique

Pour que tout revienne tout seul après un redémarrage ou une coupure de courant.

Les conteneurs sont déjà configurés en `restart: unless-stopped` : dès que Docker Desktop
tourne, ils redémarrent seuls. Il reste à s'assurer que Docker Desktop lui-même démarre sans
intervention :

- Dans Docker Desktop → *Settings → General*, coche « Start Docker Desktop when you sign in ».
- Docker Desktop a besoin d'une session Windows ouverte pour démarrer. Sur une machine
  dédiée, configure la connexion automatique du compte au démarrage (`netplwiz` → décocher
  « Les utilisateurs doivent entrer un nom d'utilisateur et un mot de passe »).

> Compromis à connaître : la connexion automatique désactive le mot de passe au démarrage de
> Windows sur ce compte. Acceptable sur une machine dédiée dans un local du labo, à éviter si
> la machine est accessible physiquement par n'importe qui.

## 9. Planifier les sauvegardes

`scripts/backup-db.sh` (fourni dans ce dépôt) fait un export quotidien de la base et garde
les 30 derniers. Le script est écrit en bash ; Git pour Windows fournit l'interpréteur
nécessaire (« Git Bash »). Ouvre le Planificateur de tâches Windows (`taskschd.msc`) et crée
une tâche de base :

| Champ | Valeur |
|---|---|
| Déclencheur | Quotidien, à 2h00 |
| Action | Démarrer un programme |
| Programme | `C:\Program Files\Git\bin\bash.exe` |
| Arguments | `-lc "cd /c/msd-analysis/msd-analysis-api && ./scripts/backup-db.sh"` |

Les fichiers `.sql` atterrissent dans `msd-analysis-api\backups\`. Pense à copier ce dossier
régulièrement vers un autre disque ou un cloud du labo — un dossier de sauvegarde sur la même
machine ne protège pas contre une panne disque.

## 10. Mettre à jour l'application plus tard

Quand du nouveau code est poussé sur GitHub :

```powershell
cd C:\msd-analysis\msd-analysis-api
git pull
docker compose up -d --build

cd C:\msd-analysis\msd-analysis-ui
git pull
docker compose up -d --build
```

Les migrations de base de données s'appliquent automatiquement au redémarrage de l'API, sans
commande supplémentaire.

## 11. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Docker Desktop refuse de démarrer | WSL2 non activé | Relancer l'installeur Docker Desktop, redémarrer la machine |
| `port is already allocated` | Le port 3000 ou 8080 est déjà utilisé | Fermer l'autre programme, ou changer le port publié dans `docker-compose.yml` |
| L'UI charge mais l'upload échoue | `API_URL` mal configuré | Vérifier le `.env` de l'UI, relancer `docker compose up -d --build` |
| Inaccessible depuis un autre poste | Pare-feu ou IP obsolète | Revoir l'étape 6 ; reconfirmer l'IP avec `ipconfig` |
| Rien ne change après une mise à jour | Oubli du `--build` | Relancer avec `docker compose up -d --build`, pas juste `up -d` |

```powershell
# Voir les journaux d'un service
docker compose logs -f api
```

## 12. Avant de considérer que c'est prêt

- [ ] `DB_PASSWORD` changé dans le `.env` de l'API (pas la valeur par défaut du dépôt)
- [ ] Les deux dépôts GitHub restent **privés**
- [ ] Aucune redirection de port depuis le routeur vers internet — l'appli reste accessible
      uniquement depuis le réseau local du labo
- [ ] Un import de fichier Excel testé depuis un poste autre que la machine hôte
- [ ] La tâche planifiée de sauvegarde tourne (vérifier `backups\` le lendemain matin)
