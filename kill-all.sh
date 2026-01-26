#!/bin/bash

# ===========================================
# Deep Saúde - Kill All Services Script
# ===========================================

echo "🛑 Parando todos os serviços do Deep Saúde..."

# Kill backend (porta 3000)
if lsof -i :3000 > /dev/null 2>&1; then
    echo "   ├── Matando processos na porta 3000 (Backend)..."
    kill -9 $(lsof -t -i :3000) 2>/dev/null
    echo "   │   ✅ Backend parado"
else
    echo "   ├── Backend já não está rodando"
fi

# Kill frontend (porta 9002)
if lsof -i :9002 > /dev/null 2>&1; then
    echo "   ├── Matando processos na porta 9002 (Frontend)..."
    kill -9 $(lsof -t -i :9002) 2>/dev/null
    echo "   │   ✅ Frontend parado"
else
    echo "   ├── Frontend já não está rodando"
fi

echo ""
echo "✅ Todos os serviços foram parados!"
