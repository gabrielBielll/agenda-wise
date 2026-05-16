# [OPS-007] Pinar versões das imagens Docker

**Severidade:** 🟢 Low
**Sprint:** 3
**Esforço:** S (≤2h)
**Área:** Infra
**Status:** TODO

## Contexto

Algumas imagens base não estão com versão pinada, o que pode causar builds não-determinísticos. Em particular, `minio/minio` está sem tag explícita (puxa `latest`).

## Localizações

| Arquivo | Imagem atual | Problema |
|---|---|---|
| [docker-compose.yml:23](../../../docker-compose.yml#L23) | `minio/minio` | Sem tag, pega `latest` |
| [docker-compose.yml:5](../../../docker-compose.yml#L5) | `postgres:15-alpine` | Tag flutuante (sub-versão muda) |
| Frontend Dockerfile | `node:18-alpine` | Tag flutuante |
| Backend Dockerfile | `clojure:lein-2.11.2` | OK (pinned) |

## Solução proposta

### Pin para versões específicas + digest hash

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15.7-alpine@sha256:...   # digest preciso

  minio:
    image: minio/minio:RELEASE.2024-12-13T22-19-12Z@sha256:...
```

```dockerfile
# Frontend Dockerfile
FROM node:20.11.0-alpine@sha256:...
```

```dockerfile
# Backend runtime
FROM eclipse-temurin:17.0.10_7-jre-alpine@sha256:...
```

### Obter digest atual

```bash
docker pull postgres:15.7-alpine
docker images --digests postgres
# copiar o "DIGEST" e adicionar ao FROM
```

### Atualização planejada

Renovar pins quando novas versões estáveis saem (mensal/trimestral). Usar Dependabot para alertar:

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "docker"
    directory: "/deep-saude-plataforma-api/deep-saude-backend"
    schedule:
      interval: "weekly"
  - package-ecosystem: "docker"
    directory: "/deep-saude-plataforma-front-end"
    schedule:
      interval: "weekly"
```

## Critérios de aceitação

- [ ] Todas as imagens Docker têm versão major.minor.patch pinada
- [ ] (Opcional) Digest SHA256 também pinado para builds reprodutíveis
- [ ] Dependabot configurado para alertas semanais

## Riscos / dependências

- **Risco baixo:** pode ser feito por último na Sprint 3.
- **Atenção:** quando atualizar versões pinadas, testar localmente antes (especialmente Postgres e MinIO — mudanças de major podem quebrar features usadas).
