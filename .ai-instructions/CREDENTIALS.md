# 🔐 Credentials Guide - Deep Saúde

This document contains all test credentials and explains the authentication flow.

---

## Authentication Types

This system has **two types of users**:

| Type | Description | Login Page |
|------|-------------|------------|
| **Clinic Users** | Psicólogos, Secretários (Tenants) | `/login` |
| **Super Admin** | System administrator (Plataforma) | `/admin/login` |

---

## Clinic User Login (Psicólogos/Staff)

### Page: `http://localhost:9002/login`

| Email | Password | Role | Clinic |
|-------|----------|------|--------|
| `psicologo@exemplo.com` | `senha123` | Psicologo | Clinica Exemplo |

### How it works:
1. User enters email and password
2. System validates credentials against `usuarios` table
3. JWT token is generated with clinic context (`clinica_id`)
4. Redirected to `/dashboard`

---

## Super Admin Login

### Page: `http://localhost:9002/admin/login`

| Email | Password | Role |
|-------|----------|------|
| `admin@deepsaude.com` | `admin123` | Super Admin (Admin Clínica) |

### Setup Command (First Run Only)
If this user does not exist, run:
```bash
curl -X POST http://localhost:3000/api/admin/provisionar-clinica \
  -H "Content-Type: application/json" \
  -d '{"nome_clinica":"Clínica Modelo","limite_psicologos":5,"nome_admin":"Admin Deep","email_admin":"admin@deepsaude.com","senha_admin":"admin123"}'
```

---

## Creating New Users

### Via Database (SQL)

You can insert new users directly into the database. Remember to restart or ensure the backend can pick up the changes if caching is involved (rare for auth).

```sql
-- 1. Get Clinic ID
SELECT id FROM clinicas WHERE nome_da_clinica = 'Clinica Exemplo';

-- 2. Get Role ID
SELECT id FROM papeis WHERE nome_papel = 'psicologo';

-- 3. Insert User
INSERT INTO usuarios (clinica_id, papel_id, nome, email, senha_hash)
VALUES (
  'UUID-DA-CLINICA',
  'UUID-DO-PAPEL',
  'Novo Usuario',
  'novo@exemplo.com',
  'HASH_DA_SENHA' 
);
```

---

## Troubleshooting Login Issues

### "Credenciais inválidas" (Invalid credentials)
1. Check if user exists in database: `SELECT * FROM usuarios WHERE email = 'xxx';`
2. Check if password hash matches.

### Token verification failed
1. Ensure `JWT_SECRET` is the same in both frontend (`.env.local`) and backend (env var).
