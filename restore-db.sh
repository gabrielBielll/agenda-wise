#!/bin/bash

# Configuration
DB_USER="erp_user"
DB_PASS="advocacia123"
DB_NAME="deep_saude_db"
HOST="localhost"
PORT="5432"

if [ -z "$1" ]; then
  echo "❌ Usage: ./restore-db.sh <path_to_backup_file.sql>"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ File not found: $BACKUP_FILE"
  exit 1
fi

echo "=========================================="
echo "⚠️  WARNING: THIS WILL OVERWRITE THE DATABASE '$DB_NAME' ⚠️"
echo "=========================================="
echo "File to restore: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to proceed? (type 'yes'): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring database..."

# Run psql restore via Docker (piping file content)
# cat [file] | docker exec -i [container] psql ...
cat "$BACKUP_FILE" | docker exec -i deep-saude-postgres psql -U $DB_USER -d $DB_NAME

if [ $? -eq 0 ]; then
  echo "✅ Restore completed successfully!"
else
  echo "❌ Error restoring database."
  exit 1
fi

echo "=========================================="
