# 🔧 Troubleshooting Guide

Common issues and their solutions when running the Legal ERP project.

---

## Docker Issues

### Docker Desktop not running
**Symptom:** `error during connect: ... open //./pipe/dockerDesktopLinuxEngine: O sistema não pode encontrar o arquivo especificado`

**Solution:**
1. Open Docker Desktop application
2. Wait for it to fully start (green icon in system tray)
3. Verify with: `docker ps`

### Containers not starting
**Symptom:** `docker-compose up` fails

**Solution:**
```powershell
# Stop and remove old containers
docker-compose down -v

# Start fresh
docker-compose up -d

# Check status
docker ps
```

### PostgreSQL connection refused
**Symptom:** `java.net.ConnectException: Connection refused` in backend logs

**Solution:**
1. Ensure Docker Desktop is running
2. Check container status: `docker ps | grep postgres`
3. Wait for healthy status (can take 30 seconds)
4. Verify port: `docker port erp-advocacia-postgres`

---

## Backend Issues

### DATABASE_URL not configured
**Symptom:** `Exception: A variável de ambiente DATABASE_URL não foi configurada`

**Solution:**
Set environment variables before running:
```bash
export DATABASE_URL='postgresql://erp_user:advocacia123@localhost:5433/erp_advocacia?sslmode=disable'
export JWT_SECRET='chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios'
export APP_ENV='development'
export PORT='3000'
lein run
```

Or use the startup script: `.\start-dev.ps1`

### Port 3000 already in use
**Symptom:** `Address already in use`

**Solution:**
```bash
# Kill process on port 3000
fuser -k 3000/tcp

# Or find and kill manually
lsof -i :3000
kill -9 <PID>
```

### Malformed hash error
**Symptom:** `clojure.lang.ExceptionInfo: Malformed hash`

**Cause:** Password hash in database is not in buddy-hashers format

**Solution:**
1. Generate correct hash:
```bash
lein run -m clojure.main generate_password_hash.clj
```

2. Update database:
```sql
UPDATE users 
SET password_hash = 'bcrypt+sha512$...' 
WHERE email = 'user@example.com';
```

---

## Frontend Issues

### Token verification failed
**Symptom:** `JWSSignatureVerificationFailed: signature verification failed`

**Cause:** JWT_SECRET mismatch between frontend and backend

**Solution:**
1. Add to `deep-saude-plataforma-front-end/.env.local`:
```
JWT_SECRET=chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios
```

2. Restart frontend:
```bash
# Kill frontend
fuser -k 9002/tcp

# Restart
cd deep-saude-plataforma-front-end && npm run dev
```

### Port 9002 already in use
**Solution:**
```bash
fuser -k 9002/tcp
```

### Login not redirecting
**Symptom:** Clicking "Entrar" does nothing

**Causes & Solutions:**
1. **Backend not running** → Start backend on port 3000
2. **BACKEND_URL wrong** → Check `.env.local` has `BACKEND_URL=http://localhost:3000`
3. **Docker not running** → Start Docker Desktop

### "1 error" in bottom corner
This is Next.js dev mode showing compilation errors. Check terminal for details.

---

## Login Issues

### "Credenciais inválidas"
**Possible causes:**
1. Wrong password
2. User doesn't exist
3. Password hash format incorrect

**Debug:**
```sql
-- Check if user exists
SELECT email, role, active, temporary_password 
FROM users WHERE email = 'xxx@xxx.com';

-- Check password hash format (should be bcrypt+sha512$...)
SELECT email, left(password_hash, 20) FROM users WHERE email = 'xxx@xxx.com';
```

### "Escritório não encontrado"
**Cause:** Using tenant login page for super admin or vice versa

**Solution:**
- Tenant users: Use `/login-v2`
- Super Admin: Use `/super-admin/login`

### Login works but redirect to /login (not /dashboard)
**Cause:** JWT_SECRET mismatch

**Solution:** See "Token verification failed" above

---

## Database Issues

### Reset password for any user
```bash
# 1. Generate hash
lein run -m clojure.main generate_password_hash.clj

# 2. Update in database
docker exec -i erp-advocacia-postgres psql -U erp_user -d erp_advocacia
```

```sql
UPDATE users 
SET password_hash = 'bcrypt+sha512$YOUR_HASH_HERE',
    temporary_password = false 
WHERE email = 'user@example.com';
```

### Check all users
```sql
SELECT id, email, role, tenant_id, active, temporary_password 
FROM users;
```

### Check all tenants
```sql
SELECT id, company_name, subdomain, active 
FROM tenants;
```

---

## Quick Diagnostic Commands

```bash
# Check if all services are running
docker ps                     # PostgreSQL, MinIO should show "healthy"
curl http://localhost:3000/debug/secret-check   # Backend responds
curl http://localhost:3001   # Frontend responds

# Check logs
docker logs erp-advocacia-postgres   # Database logs
# Backend logs are in terminal where lein run is running
# Frontend logs are in terminal where npm run dev is running
```

---

## Nuclear Option: Full Reset

If nothing works, start completely fresh:

```bash
# 1. Stop everything
docker-compose down -v
fuser -k 3000/tcp 3001/tcp

# 2. Remove node_modules and reinstall
cd frontend-nextjs
rm -rf node_modules .next
npm install

# 3. Clean Clojure target
cd ..
rm -rf target

# 4. Start fresh
docker-compose up -d
# Wait 30 seconds for DB to be ready
.\start-dev.ps1
```
