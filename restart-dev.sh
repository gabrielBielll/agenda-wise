#!/bin/bash

# ===========================================
# Deep Saúde - Restart Development Script
# ===========================================
# Script de atalho para reiniciar tudo rapidamente
# Equivalente a: kill-all.sh + start-dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔄 Deep Saúde - Reiniciando ambiente de desenvolvimento..."
echo ""

# Execute the full start script (which includes killing existing processes)
bash "$SCRIPT_DIR/start-dev.sh"
