# 🏗️ Architecture Overview

This document describes the system architecture, ports, and technology stack.

---

## Tech Stack

| Layer | Technology | Directory |
|-------|------------|-----------|
| **Frontend** | Next.js 14 (TypeScript) | `frontend-nextjs/` |
| **Backend API** | Clojure (Ring/Reitit) | `src/juridico/api/` |
| **Database** | PostgreSQL 14 | Docker container |
| **Object Storage** | MinIO (S3-compatible) | Docker container |
| **Authentication** | JWT (buddy-sign) | Both ends |

---

## Port Map

| Service | Port | URL |
|---------|------|-----|
| Next.js Frontend | 3001 | http://localhost:3001 |
| Clojure Backend | 3000 | http://localhost:3000 |
| PostgreSQL | 5433 | localhost:5433 |
| MinIO API | 9002 | http://localhost:9002 |
| MinIO Console | 9003 | http://localhost:9003 |

---

## Project Structure

```
erp-advocacia-api-antigravity/
├── .ai-instructions/       # 🤖 AI documentation (you are here!)
├── frontend-nextjs/        # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js App Router pages
│   │   │   ├── login-v2/  # Tenant login page
│   │   │   ├── dashboard/ # Main dashboard
│   │   │   └── api/       # Next.js API routes (proxy)
│   │   ├── lib/           # Utilities (auth.ts, etc)
│   │   └── components/    # React components
│   └── .env.local         # Frontend environment variables
├── src/juridico/api/       # Clojure backend
│   ├── core.clj           # Routes definition
│   ├── handlers.clj       # Request handlers
│   ├── middleware.clj     # JWT auth, CORS, etc
│   ├── db/
│   │   ├── postgres.clj   # PostgreSQL implementation
│   │   └── protocols.clj  # Database interfaces
│   └── config.clj         # Configuration
├── migrations/             # Database migrations (SQL)
├── docker-compose.yml      # Docker services
└── start-dev.ps1          # Dev startup script
```

---

## Multi-Tenant Architecture

This is a **multi-tenant SaaS** application:

```
┌─────────────────────────────────────────────────────┐
│                    Super Admin                       │
│              (manages all tenants)                   │
└─────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │ Tenant 1│      │ Tenant 2│      │ Tenant 3│
   │(Law Firm)│     │(Law Firm)│     │(Law Firm)│
   └─────────┘      └─────────┘      └─────────┘
        │                │                │
   ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
   │ Master  │      │ Master  │      │ Master  │
   │Operators│      │Operators│      │Operators│
   └─────────┘      └─────────┘      └─────────┘
```

### User Roles:
- **super-admin**: System administrator (no tenant)
- **master**: Tenant administrator (manages operators)
- **operador**: Regular user (works within tenant)

---

## API Routes

### Public Routes (no auth required)
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/auth/login` | `login-auto-discover-handler` |
| POST | `/admin/login` | `super-admin-login-handler` |
| GET | `/api/tenants/by-subdomain/:subdomain` | `get-tenant-by-subdomain-handler` |

### Protected Routes (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/tenant/processos` | Legal cases CRUD |
| GET/POST | `/api/tenant/clientes` | Clients CRUD |
| GET/POST | `/api/tenant/users` | Users management |
| GET | `/api/dashboard/stats/:tenant-id` | Dashboard stats |

### Super Admin Routes
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/admin/tenants` | Tenant management |
| POST | `/admin/provision-tenant` | Create new tenant |
| POST | `/admin/impersonate/:user-id` | Impersonate user |

---

## Database Schema

### Core Tables:
- `tenants` - Law firms (multi-tenant)
- `users` - All users (tenant_id nullable for super-admin)
- `processos` - Legal cases
- `clientes` - Clients
- `processo_documentos` - Document attachments
- `processo_historico` - Audit trail

### Key Relationships:
```sql
users.tenant_id -> tenants.id
processos.tenant_id -> tenants.id
processos.cliente_id -> clientes.id
clientes.tenant_id -> tenants.id
```

---

## Environment Variables

### Backend (.env or export)
```bash
DATABASE_URL=postgresql://erp_user:advocacia123@localhost:5433/erp_advocacia?sslmode=disable
JWT_SECRET=chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios
APP_ENV=development
PORT=3000
```

### Frontend (frontend-nextjs/.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
JWT_SECRET=chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios
NEXTAUTH_SECRET=outra-chave-secreta-para-nextauth-minimo-32-caracteres
NODE_ENV=development
```

> ⚠️ **CRITICAL:** JWT_SECRET must be identical in both frontend and backend!

---

## Docker Services

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:14-alpine
    port: 5433:5432
    container: erp-advocacia-postgres
    
  minio:
    image: minio/minio
    ports: 9002:9000, 9003:9001
    container: erp-advocacia-minio
```
