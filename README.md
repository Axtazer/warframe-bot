# Warframe Bot

Bot Discord expert Warframe propulsé par un modèle IA local (qwen2.5:7b via Ollama).

## Fonctionnalités

**Données live** (via [warframestat.us](https://api.warframestat.us))
- `/fissures` — fissures Void actives par tier + Steel Path
- `/sortie` — sortie du jour avec modificateurs
- `/baro` — statut Baro Ki'Teer, inventaire, horaires
- `/nightwave` — défis quotidiens, hebdomadaires, élite
- `/steelpath` — récompense actuelle + rotation complète
- `/invasions` — invasions actives avec récompenses
- `/events` — opérations et événements en cours

**Données statiques** (via [warframe-public-export-plus](https://github.com/WFCD/warframe-public-export-plus))
- `/mod <nom>` — stats, description et compatibilité d'un mod
- `/frame <nom>` — stats de base d'un Warframe
- `/build <nom>` — lien Overframe.gg pour les builds communautaires

**Inventaire personnel**
- `/import` — importe ton fichier `.dat` exporté depuis AlecaFrame
- `/inventaire` — affiche ton inventaire importé

**IA**
- `/wf <question>` — question libre, l'IA choisit ses outils selon le contexte
- `@mention` — même chose, directement dans n'importe quel salon

## Stack

| Composant | Technologie |
|---|---|
| Bot | Node.js 22 + discord.js v14 |
| IA | Ollama qwen2.5:7b (local) |
| Base de données | PostgreSQL 16 |
| Hébergement | Kubernetes (namespace `bots`) |
| CI/CD | GitHub Actions → GHCR → Renovate → ArgoCD |

## Développement local

```bash
# Prérequis : Node 22, Ollama en local, PostgreSQL

cp .env.example .env
# Remplir .env (voir section ci-dessous)

npm install
npm start

# Déployer les slash commands sur le serveur Discord
npm run deploy
```

### Variables d'environnement

Voir [`.env.example`](.env.example) pour la liste complète.

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot ([Developer Portal](https://discord.com/developers/applications)) |
| `CLIENT_ID` | Client ID de l'application Discord |
| `GUILD_ID` | ID du serveur Discord cible |
| `OLLAMA_HOST` | URL Ollama (`http://localhost:11434` en local) |
| `OLLAMA_MODEL` | Modèle à utiliser (`qwen2.5:7b`) |
| `POSTGRES_*` | Connexion PostgreSQL |

### Importer un inventaire AlecaFrame

1. Dans Warframe, ouvrir AlecaFrame
2. Exporter l'inventaire → fichier `.dat`
3. Sur Discord : `/import` → joindre le fichier
4. `/inventaire` pour vérifier, puis `/wf` pour poser des questions dessus

## Déploiement

L'image Docker est buildée et poussée sur GHCR à chaque push sur `main`.  
Renovate détecte le nouveau digest et ouvre une PR automerge sur [harkesh-k8s](https://github.com/Axtazer/harkesh-k8s).  
ArgoCD déploie automatiquement.

Les secrets sont gérés via 1Password Connect (vault `k8s-home`) :
- item `warframe-bot` → `DISCORD_TOKEN`, `POSTGRES_PASSWORD`
- item `warframe-postgres` → `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
