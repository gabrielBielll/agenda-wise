# Deep Saúde Platform - Project Status & Context

> Last Updated: 2026-01-26
> Status: MVP Completed (Medical Records & Financeiro Ready)

## 1. Project Overview

**Deep Saúde** is a management platform for Psychology Clinics.

- **Frontend**: Next.js 15 (App Router), TailwindCSS, Shadcn/ui.
- **Backend**: Clojure (Ring/Compojure), PostgreSQL (JDBC), JWT Authentication.
- **Infrastructure**: Docker (Postgres, MinIO).

## 2. Architecture & Authentication (Critical Context)

The authentication flow is custom and requires specific handling:

- **Provider**: NextAuth.js (Credentials Provider).
- **Backend Auth**: Clojure backend issues a JWT signed with `HS256`.
- **Role Handling**:
  - The Backend returns the User Role (`role` claim) in the Login Response body.
  - **Frontend Token**: NextAuth persists this `role` in the JWT and Session.
  - **Middleware**: `middleware.ts` uses `getToken` (from `next-auth/jwt`) to verify the token and enforce RBAC protection on `/dashboard` and `/admin`.
  - **UUIDs**: The backend requires `java.util.UUID` casting for all ID claims (`user_id`, `clinica_id`, `papel_id`). **Do not send Strings to the DB queries for these fields.**

## 3. Current Implementation Status (MVP)

### ✅ Completed Features

1.  **Unified Login**:
    - Root (`/`) for Psychologists/Secretaries.
    - `/admin/login` for Clinic Admins.
    - Infinite loop issues resolved by proper Role persistence.
2.  **Dashboard**:
    - Customized views for Admin (Charts) vs Psychologist (Calendar/Patients).
3.  **Patient Management**:
    - CRUD for Patients.
    - **Medical Records (Prontuário)**: Implemented as a sub-feature of Patients. Psychologists can add session notes.
4.  **Financeiro (Basic)**:
    - Overview of appointments and total revenue.

### 🚧 Known "Gotchas" & Fixes (Reference for Future Devs)

- **Middleware Redirect Loop**: If the backend does not return the `role` in the JSON body, NextAuth won't save it, and Middleware will endlessly redirect authenticated users back to login. **Ensure `route.ts` captures `data.user.role`.**
- **Client-Side Async Errors**: `page.tsx` (Login) cannot be async. Router redirects must happen in `useEffect` to avoid "Cannot update during render" errors.
- **Backend UUIDs**: The `wrap-jwt-autenticacao` middleware in `core.clj` MUST manually convert string claims to UUIDs before placing them in the request map.

## 5. Development Environment Commands

> **⚠️ IMPORTANT FOR AI**: Always ensure the development environment is running before the user tests anything. If you make changes to backend (Clojure) or frontend (Next.js) files that require a restart, use `restart-dev.sh`.

### Prerequisites

- **Docker Desktop** must be running (for PostgreSQL and MinIO containers).

### Starting the Project

```bash
cd /Users/gabriel/Documents/developer/deep-saude-plataform
./start-dev.sh
```

This script:

1. Stops any existing services on ports 3000 (Backend) and 9002 (Frontend).
2. Cleans build caches (`.next`, `target`).
3. Starts Docker containers (Postgres, MinIO).
4. Starts Backend (Clojure) on port 3000.
5. Starts Frontend (Next.js) on port 9002.

### Restarting the Project (After Code Changes)

```bash
cd /Users/gabriel/Documents/developer/deep-saude-plataform
./restart-dev.sh
```

Use this after modifying:

- Backend files (`core.clj`, etc.)
- Middleware (`middleware.ts`)
- Environment variables

### Stopping the Project

```bash
cd /Users/gabriel/Documents/developer/deep-saude-plataform
./kill-all.sh
```

### Checking Logs

- **Backend**: `tail -f backend.log`
- **Frontend**: `tail -f frontend.log`

### URLs

| Service  | URL                   |
| -------- | --------------------- |
| Frontend | http://localhost:9002 |
| Backend  | http://localhost:3000 |
| MinIO    | http://localhost:9001 |

### Default Test Credentials

| Role      | Email                   | Password |
| --------- | ----------------------- | -------- |
| Psicólogo | psicologo@deepsaude.com | 123456   |
| Admin     | admin@deepsaude.com     | 123456   |

---

## 6. Next Steps

- [ ] **Refine Scheduling**: Implement the full Calendar drag-and-drop interface.
- [ ] **Google Auth**: Enable the Google Provider (currently mocked/placeholder).
- [ ] **Advanced Financeiro**: Expense tracking and detailed reports.
