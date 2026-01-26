# 🐧 Guia de Execução via WSL (Windows Subsystem for Linux)

Este documento descreve como configurar e rodar o projeto **ERP Advocacia** utilizando o ambiente WSL, que é a alternativa recomendada caso o PowerShell/Windows nativo apresente problemas de compatibilidade ou performance.

---

## 📋 Pré-requisitos no WSL

Certifique-se de que seu ambiente WSL (Ubuntu/Debian) tenha as seguintes ferramentas instaladas:

1. **Node.js 18+ & NPM**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Java 21 (OpenJDK)**
   ```bash
   sudo apt update
   sudo apt install -y openjdk-21-jdk
   ```

3. **Leiningen (Clojure)**
   ```bash
   sudo apt install leiningen
   # Ou via script oficial se o pacote não estiver disponível
   ```

---

## 🚀 Como Rodar o Projeto

Como seus arquivos estão no Windows, você deve acessá-los através do ponto de montagem `/mnt/c/`.

### 1. Navegue até a pasta do projeto
```bash
# Exemplo: Ajuste para o seu usuário
cd /mnt/c/Users/pc/Documents/erp-advocacia-api-antigravity
```

### 2. Inicie o Backend (API Clojure)
```bash
# Defina as variáveis de ambiente necessárias
export DATABASE_URL='postgresql://erp_user:advocacia123@localhost:5433/erp_advocacia?sslmode=disable'
export JWT_SECRET='chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios'
export PORT=3000

# Inicie o servidor
lein run
```

### 3. Inicie o Frontend (Next.js)
Abra um **novo terminal WSL**, navegue para a pasta e:

```bash
cd /mnt/c/Users/pc/Documents/erp-advocacia-api-antigravity/frontend-nextjs

# Instale dependências (se ainda não fez)
npm install

# Rode o servidor de desenvolvimento
npm run dev
```

---

## ⚠️ Troubleshooting de Rede (Conexão Recusada)

Se você vir erros como `ERR_CONNECTION_REFUSED` ao tentar acessar `http://localhost:3001` no Windows:

### O Problema
Às vezes, a "ponte" de rede entre o Windows e o WSL falha, fazendo com que o `localhost` do Windows não enxergue a porta aberta no WSL.

### Solução 1: Forçar Bind no 0.0.0.0
Ao rodar o frontend, force-o a aceitar conexões externas:
```bash
npm run dev -- -H 0.0.0.0 -p 3001
```

### Solução 2: Usar o IP do WSL
1. Descubra o IP do WSL rodando no terminal Linux:
   ```bash
   hostname -I
   # Exemplo de saída: 172.24.131.137
   ```
2. Acesse no navegador usando esse IP:
   `http://172.24.131.137:3001`

### Solução 3: Reiniciar o WSL
No PowerShell (Windows) como Administrador:
```powershell
wsl --shutdown
```
Depois abra o terminal WSL novamente e inicie os serviços.
