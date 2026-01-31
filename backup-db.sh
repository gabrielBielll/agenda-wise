#!/bin/bash

# Configuration
DB_USER="erp_user"
DB_PASS="advocacia123"
DB_NAME="deep_saude_db"
HOST="localhost"
PORT="5432"
BACKUP_DIR="./backups"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql"

echo "=========================================="
echo "Starting backup for database: $DB_NAME"
echo "=========================================="

# Run pg_dump inside Docker container to ensure version compatibility
# docker exec -i [container_name] pg_dump -U [user] ...
docker exec -t deep-saude-postgres pg_dump -U $DB_USER --clean --if-exists --no-owner --no-acl $DB_NAME > $FILENAME

if [ $? -eq 0 ]; then
  echo "✅ Backup created successfully!"
  echo "📁 File: $FILENAME"
else
  echo "❌ Error creating backup."
  rm -f $FILENAME
  exit 1
fi

echo "=========================================="
