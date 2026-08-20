# ⛔ PARE — esta pasta NÃO é o ponto de entrada deste projeto

> **Se você é uma instância nova, o arquivo que você quer é o
> [`CLAUDE.md`](../CLAUDE.md) na raiz.** Ele é lido automaticamente no início de
> toda sessão. Depois dele, [`docs/HANDOFF.md`](../docs/HANDOFF.md).

## Por que este aviso existe

Esta pasta foi herdada de **outro projeto** — um ERP jurídico — e o cabeçalho
original dela dizia *"AI INSTRUCTIONS — READ THIS FIRST"*. Em 20/08/2026 uma
instância nova leu isto primeiro, exatamente como mandava, e montou um modelo
mental de tenants = escritórios de advocacia, tabelas `processos`/`clientes` e
portas 3001/5433. Nada disso existe aqui.

🔴 **E o estado real é pior do que "é de outro projeto": a pasta está pela
metade.** Medido, arquivo por arquivo, contando menções a cada domínio:

| arquivo | fala de advocacia | fala de psicologia | veredito |
|---|---|---|---|
| `ARCHITECTURE.md` | 4 | 0 | 🔴 **outro projeto** |
| `TROUBLESHOOTING.md` | 5 | 0 | 🔴 **outro projeto** |
| `AI_WORKFLOW_GUIDE.md` | 5 | 0 | 🔴 **outro projeto** |
| `AI_RULES_WSL.md` | 4 | 0 | 🔴 **outro projeto** |
| `QUICK_START.md` | 1 | 3 | ⚠️ **misturado** |
| `CREDENTIALS.md` | 0 | 11 | ✅ é deste projeto |
| `AI_RULES.md` | 0 | 0 | genérico |

📌 **Documentação meio verdadeira é a mais cara que existe.** Se tudo aqui
estivesse errado, qualquer um perceberia na primeira linha. Como `CREDENTIALS.md`
confere e `ARCHITECTURE.md` não, quem lê tende a confiar nos dois — e leva o
modelo errado adiante sem nenhum sinal de que errou.

É a mesma família de defeito que este projeto persegue: **um sinal dizendo "é por
aqui" sobre algo que ninguém verificou.**

## ⚠️ E as credenciais daqui são de exemplo, não de produção

`CREDENTIALS.md` documenta logins de desenvolvimento local — `admin123`,
`senha123`. Não são segredos de produção e não precisam ser rotacionados por
causa deste arquivo.

🔴 **Mas viram um buraco de verdade se essas contas existirem em algum banco que
não seja o da sua máquina.** Está na lista de produção: conferir e apagar antes
da virada.

## O que fazer com esta pasta

Não foi apagada porque `CREDENTIALS.md` e parte do `QUICK_START.md` ainda
descrevem este projeto e alguém pode depender deles. **Apagar sem conferir
trocaria um problema conhecido por um desconhecido.** A decisão de limpar é do
Gabriel.

---

*O conteúdo original, herdado do outro projeto, segue abaixo.*

---

# 🤖 AI INSTRUCTIONS - READ THIS FIRST!

**Welcome, AI Agent!** This folder contains everything you need to successfully run and work with this project.

## 📚 Quick Navigation

| File | Purpose |
|------|---------|
| [QUICK_START.md](./QUICK_START.md) | **START HERE** - Get the project running in 2 minutes |
| [CREDENTIALS.md](./CREDENTIALS.md) | Login credentials for Super Admin and Tenant users |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview, ports, and tech stack |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and solutions |
| [AI_RULES.md](./AI_RULES.md) | Development workflow and coding standards |

## ⚡ Super Quick Start

```powershell
# 1. Open Docker Desktop (REQUIRED!)
# 2. Run this in terminal:
cd c:\Users\pc\Documents\erp-advocacia-api-antigravity
.\start-dev.ps1
```

Then open: `http://localhost:3001/login`

## 🔐 Test Credentials

| Type | Email | Password | Login Page |
|------|-------|----------|------------|
| **Tenant User** | `oi@gmail.com` | `password` | `/login` |
| **Super Admin** | `admin@erp.com` | `Admin@123` | `/super-admin/login` |

---

> **⚠️ IMPORTANT:** Always ensure Docker Desktop is running before starting the project!
