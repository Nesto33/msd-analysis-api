#!/bin/sh
# Sauvegarde la base Postgres du conteneur msd_postgres dans ./backups/.
# Usage : ./scripts/backup-db.sh
# À planifier avec cron sur la machine du labo, ex. tous les jours à 2h :
#   0 2 * * * cd /chemin/vers/msd-analysis-api && ./scripts/backup-db.sh
set -e

cd "$(dirname "$0")/.."
mkdir -p backups

DB_USERNAME="${DB_USERNAME:-msd_user}"
DB_DATABASE="${DB_DATABASE:-msd_db}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="backups/${DB_DATABASE}_${TIMESTAMP}.sql"

docker exec msd_postgres pg_dump -U "$DB_USERNAME" "$DB_DATABASE" > "$OUTPUT"
echo "Sauvegarde écrite dans $OUTPUT"

# Garde les 30 dernières sauvegardes, supprime le reste.
ls -1t backups/${DB_DATABASE}_*.sql 2>/dev/null | tail -n +31 | xargs -r rm --
