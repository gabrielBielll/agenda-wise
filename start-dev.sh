#!/bin/bash

# ===========================================
# Deep Saúde - Start Development Script
# ===========================================
# Este script para todos os serviços, limpa o cache e inicia tudo novamente

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Deep Saúde - Iniciando ambiente de desenvolvimento..."
echo ""

# ===========================================
# 1. Parar serviços existentes
# ===========================================
echo "🛑 [1/5] Parando serviços existentes..."
bash "$SCRIPT_DIR/kill-all.sh"
echo ""

# ===========================================
# 2. Limpar cache/builds antigos
# ===========================================
echo "🧹 [2/5] Limpando cache e builds antigos..."

if [ -d "deep-saude-plataforma-front-end/.next" ]; then
    rm -rf deep-saude-plataforma-front-end/.next
    echo "   ├── ✅ Cache do Next.js removido (.next)"
fi

if [ -d "deep-saude-plataforma-api/deep-saude-backend/target" ]; then
    rm -rf deep-saude-plataforma-api/deep-saude-backend/target
    echo "   ├── ✅ Build do Clojure removido (target)"
fi

echo ""

# ===========================================
# 3. Verificar/Iniciar Docker
# ===========================================
echo "🐳 [3/5] Verificando Docker..."

if ! docker info > /dev/null 2>&1; then
    echo "   ❌ Docker não está rodando. Por favor, inicie o Docker Desktop."
    exit 1
fi

# Check if containers are running
if ! docker ps | grep -q "deep-saude"; then
    echo "   ├── Iniciando containers Docker..."
    docker-compose up -d
    echo "   ├── Aguardando containers ficarem saudáveis..."
    sleep 5
else
    echo "   ├── ✅ Containers Docker já estão rodando"
fi

echo ""

# ===========================================
# 4. Iniciar Backend (Clojure)
# ===========================================
echo "⚙️  [4/5] Iniciando Backend (Clojure) na porta 3000..."

cd "$SCRIPT_DIR/deep-saude-plataforma-api/deep-saude-backend"

# Set environment variables
export DATABASE_URL='postgresql://erp_user:advocacia123@localhost:5432/deep_saude_db?sslmode=disable'
export JWT_SECRET='chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios'
export APP_ENV='development'
export PORT='3000'

# Start backend in background
lein run > "$SCRIPT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   ├── Backend iniciado (PID: $BACKEND_PID)"
echo "   ├── Logs em: backend.log"

# Wait a bit for backend to start
echo "   ├── Aguardando backend iniciar..."
sleep 10

# Check if backend started successfully
if lsof -i :3000 > /dev/null 2>&1; then
    echo "   └── ✅ Backend rodando em http://localhost:3000"
else
    echo "   └── ⚠️  Backend ainda iniciando... verifique backend.log"
fi

echo ""

# ===========================================
# 5. Iniciar Frontend (Next.js)
# ===========================================
echo "🎨 [5/5] Iniciando Frontend (Next.js) na porta 9002..."

cd "$SCRIPT_DIR/deep-saude-plataforma-front-end"

# Start frontend in background
npm run dev > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   ├── Frontend iniciado (PID: $FRONTEND_PID)"
echo "   ├── Logs em: frontend.log"

sleep 5

if lsof -i :9002 > /dev/null 2>&1; then
    echo "   └── ✅ Frontend rodando em http://localhost:9002"
else
    echo "   └── ⚠️  Frontend ainda iniciando... verifique frontend.log"
fi

echo ""

# ===========================================
# Summary
# ===========================================
echo "=========================================="
echo "✅ Deep Saúde está rodando!"
echo "=========================================="
echo ""
echo "📌 URLs:"
echo "   Frontend:  http://localhost:9002"
echo "   Backend:   http://localhost:3000"
echo "   MinIO:     http://localhost:9001"
echo ""
echo "📋 Logs:"
echo "   Backend:   tail -f backend.log"
echo "   Frontend:  tail -f frontend.log"
echo ""
echo "🛑 Para parar: bash kill-all.sh"
echo ""
