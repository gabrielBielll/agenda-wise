# 🚀 Quick Start Guide - Deep Saúde

This guide will get the Deep Saúde platform running locally.

## Prerequisites

- **Docker Desktop** - Must be installed and running
- **Node.js 18+** - For frontend
- **Java 21** - For backend (Clojure)
- **Leiningen** - Clojure build tool (`brew install leiningen`)

---

## Step 1: Start Infrastructure

Start the database (PostgreSQL) and object storage (MinIO):

```bash
docker-compose up -d
```

Verify containers are running:
```bash
docker ps
# Should show: deep-saude-postgres (healthy), deep-saude-minio (healthy)
```

---

## Step 2: Start Backend (Clojure API)

Open a terminal and run:

```bash
cd deep-saude-plataforma-api/deep-saude-backend

# Set environment variables (for local dev)
export DATABASE_URL='postgresql://erp_user:advocacia123@localhost:5432/erp_advocacia?sslmode=disable'
export JWT_SECRET='chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios'
export APP_ENV='development'
export PORT='3000'

# Run the server
lein run
```

Wait until you see:
```
=== INICIANDO SERVIDOR API ===
Porta: 3000
✅ Sistema pronto para testes!
```

**First Time Setup (Initialize Database):**
For a fresh installation, you must create the first clinic and admin user:
```bash
curl -X POST http://localhost:3000/api/admin/provisionar-clinica \
  -H "Content-Type: application/json" \
  -d '{
    "nome_clinica": "Clínica Modelo",
    "limite_psicologos": 5,
    "nome_admin": "Admin Deep",
    "email_admin": "admin@deepsaude.com",
    "senha_admin": "admin123"
  }'
```

---

## Step 3: Start Frontend (Next.js)

Open a **new** terminal:

```bash
cd deep-saude-plataforma-front-end
npm run dev
```

Wait until you see:
```
✓ Ready in Xs
- Local: http://localhost:9002
```

---

## Verify Everything is Running

| Service | URL | Expected |
|---------|-----|----------|
| Frontend | http://localhost:9002 | Login page |
| Backend API | http://localhost:3000 | API Response / 404 |
| PostgreSQL | localhost:5432 | Docker container |
| MinIO | http://localhost:9001 | MinIO console |

---

## Next Steps

- See [CREDENTIALS.md](./CREDENTIALS.md) for login information
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
