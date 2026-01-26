# Guia de Execução do Projeto para Agentes de IA

Este guia descreve o fluxo de trabalho exato para um agente de IA rodar, monitorar e verificar o projeto `erp-advocacia-api-antigravity`.

## 1. Pré-requisitos e Ambiente

*   **OS**: Windows (mas rodando comandos via WSL/Bash é preferível para compatibilidade).
*   **Diretório Base**: `c:\Users\pc\Documents\erp-advocacia-api-antigravity`
*   **Frontend**: `frontend-nextjs` (Next.js)
*   **Porta Frontend**: 3001

## 2. Como Rodar o Projeto (Terminal)

Para iniciar o servidor de desenvolvimento do frontend, siga estes passos rigorosamente:

### Passo 1: Limpar a Porta (Evitar EADDRINUSE)
Antes de iniciar, garanta que a porta 3001 está livre.
**Ferramenta**: `run_command`
**Comando**:
```bash
bash -c "fuser -k 3001/tcp"
```
*Nota: Se retornar erro de comando não encontrado, ignore ou use `taskkill` no Windows, mas `fuser` no WSL é o padrão recomendado.*

### Passo 2: Iniciar o Servidor
Inicie o servidor Next.js em background.
**Ferramenta**: `run_command`
**Argumentos**:
*   `CommandLine`: `bash -c "cd frontend-nextjs && npm run dev"`
*   `Cwd`: `c:\Users\pc\Documents\erp-advocacia-api-antigravity`
*   `WaitMsBeforeAsync`: `15000` (Espere 15s para garantir que o servidor subiu antes de liberar o terminal)

### Passo 3: Verificar Logs do Terminal
Para confirmar que o servidor iniciou corretamente (procurar por "Ready in ...").
**Ferramenta**: `command_status` ou `read_terminal` (se disponível)
**ID do Comando**: Use o ID retornado no Passo 2.

## 3. Como Visualizar o Navegador (Browser)

O agente não tem olhos humanos, então deve usar o `browser_subagent` para "ver" a tela.

### Passo 1: Navegar para a URL
**Ferramenta**: `browser_subagent`
**Task**:
```text
Navigate to http://localhost:3001/login-v2. Wait 10 seconds for compilation. Take a screenshot. Describe what you see.
```
*Importante: Sempre inclua um tempo de espera ("Wait X seconds") pois o Next.js pode demorar para compilar na primeira requisição.*

### Passo 2: Analisar o Resultado
O `browser_subagent` retornará uma descrição textual e salvará uma screenshot (arquivo `.png` ou `.webp`).
**Ação**: Leia a descrição e, se necessário, use a ferramenta `view_file` para ver o caminho da imagem gerada (embora o agente veja a imagem diretamente no chat se ela for anexada).

## 4. Fluxo de Debugging (Se algo der errado)

1.  **Erro 404**: O servidor Next.js pode não ter detectado novos arquivos.
    *   *Solução*: Reinicie o servidor (Passo 1 e 2 da seção "Como Rodar").
2.  **Erro de Conexão (Connection Refused)**: O servidor não subiu.
    *   *Solução*: Verifique os logs (`command_status`) para erros de build ou sintaxe.
3.  **Estilos não aplicados**: Conflito de CSS global.
    *   *Solução*: Use estilos inline ou `!important` e verifique se o arquivo CSS está importado corretamente.

## Exemplo de Sequência de Comandos (JSON)

```json
// 1. Matar processo anterior
{
  "tool": "run_command",
  "args": {
    "CommandLine": "bash -c \"fuser -k 3001/tcp\"",
    "Cwd": "c:\\Users\\pc\\Documents\\erp-advocacia-api-antigravity",
    "SafeToAutoRun": true,
    "WaitMsBeforeAsync": 5000
  }
}

// 2. Iniciar servidor
{
  "tool": "run_command",
  "args": {
    "CommandLine": "bash -c \"cd frontend-nextjs && npm run dev\"",
    "Cwd": "c:\\Users\\pc\\Documents\\erp-advocacia-api-antigravity",
    "SafeToAutoRun": false,
    "WaitMsBeforeAsync": 15000
  }
}

// 3. Visualizar
{
  "tool": "browser_subagent",
  "args": {
    "TaskName": "Check Login",
    "Task": "Navigate to http://localhost:3001/login-v2. Wait 10s. Screenshot.",
    "RecordingName": "check_login"
  }
}
```
