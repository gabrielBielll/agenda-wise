# Deep Saúde - Notas Técnicas

Este documento registra decisões de arquitetura, dívidas técnicas e pontos de atenção para futuras implementações.

---

## 📋 Índice

1. [Sincronização de Status de Agendamentos](#sincronização-de-status-de-agendamentos)
2. [Dívidas Técnicas](#dívidas-técnicas)
3. [Considerações para IA](#considerações-para-ia)

---

## Sincronização de Status de Agendamentos

### Problema

Sessões agendadas precisam ter seus status atualizados automaticamente quando a data/hora passa:

- `status`: 'agendado' → 'realizado'
- `status_pagamento`: 'pendente' → 'pago'

### Solução Atual (MVP)

**Triggers de sincronização:**

1. **Na inicialização do backend** (`init-db`)
   - Função: `sincronizar-status-global!`
   - Atualiza TODOS os agendamentos passados de todas as clínicas
   - Executada uma vez quando o servidor sobe

2. **Ao acessar página Financeiro**
   - Endpoint: `POST /api/agendamentos/sincronizar`
   - Atualiza agendamentos passados por clínica (filtrado por token)
   - Chamada em `page.tsx` antes de buscar dados

### Lógica SQL

```sql
-- Atualiza status para 'realizado' (sessões passadas ainda como 'agendado')
UPDATE agendamentos
SET status = 'realizado'
WHERE data_hora_sessao < NOW()
  AND (status IS NULL OR status = 'agendado');

-- Atualiza status_pagamento para 'pago' (sessões passadas não canceladas)
UPDATE agendamentos
SET status_pagamento = 'pago'
WHERE data_hora_sessao < NOW()
  AND status != 'cancelado'
  AND (status_pagamento IS NULL OR status_pagamento = 'pendente');
```

### ⚠️ Limitações

- Dados só são atualizados quando servidor reinicia ou usuário acessa financeiro
- Entre sessões, dados podem ficar temporariamente desatualizados

---

## Dívidas Técnicas

### 🔴 Prioridade Alta

#### 1. Cronjob para Sincronização de Status

**Status:** Não implementado  
**Solução proposta:**

- Criar serviço agendado (cron) que execute a cada hora
- Pode usar `quartzite` (Clojure) ou serviço externo
- Alternativa: Micro-serviço dedicado a tarefas agendadas

#### 2. HealthCheck com Sync

**Status:** Não implementado  
**Solução proposta:**

- Endpoint de healthcheck que dispara sync leve
- Pode ser acionado por serviços de monitoramento (Render, Railway)

### 🟡 Prioridade Média

#### 3. Database Trigger (PostgreSQL)

**Status:** Não implementado  
**Solução proposta:**

```sql
-- Exemplo de trigger automático
CREATE OR REPLACE FUNCTION auto_update_status()
RETURNS void AS $$
BEGIN
  UPDATE agendamentos
  SET status = 'realizado'
  WHERE data_hora_sessao < NOW()
    AND status = 'agendado';
END;
$$ LANGUAGE plpgsql;
```

#### 4. Micro-serviço de Tarefas

**Status:** Planejado  
**Responsabilidades futuras:**

- Sincronização de status de agendamentos
- Envio de lembretes de sessão (email/SMS)
- Geração de relatórios agendados
- Limpeza de dados antigos

---

## Considerações para IA

### Campos Importantes para Leitura

| Campo              | Tabela       | Descrição              | Valores                                  |
| ------------------ | ------------ | ---------------------- | ---------------------------------------- |
| `status`           | agendamentos | Status da sessão       | 'agendado', 'realizado', 'cancelado'     |
| `status_pagamento` | agendamentos | Pagamento do paciente  | 'pendente', 'pago'                       |
| `status_repasse`   | agendamentos | Repasse para psicólogo | 'pendente' (default), 'bloqueado', 'disponivel', 'transferido' |
| `valor_consulta`   | agendamentos | Valor da sessão        | DECIMAL                                  |
| `valor_repasse`    | agendamentos | Valor a repassar       | DECIMAL                                  |

### ⚠️ IMPORTANTE para IA

> **Antes de analisar dados financeiros/de agendamentos, sempre executar:**
>
> ```
> POST /api/agendamentos/sincronizar
> ```
>
> Isso garante que os status estão atualizados no banco.

### ⚠️ Vocabulários dos campos de estado

Os valores aceitos em `status`, `status_pagamento` e `status_repasse` são
definidos em `deep-saude-backend.dominio` e **validados no backend** desde a
auditoria de agosto/2026. Valor fora do conjunto devolve 422.

Antes disso o backend gravava qualquer string, e `status_repasse` chegou a ter
cinco valores vindos de três vocabulários diferentes na mesma coluna — um deles
escrito por um handler morto do painel financeiro. Ao mexer nesses campos,
altere `dominio.clj` primeiro; ele é a autoridade, não o frontend.

### Regras de Negócio

1. Sessão passada + não cancelada = `status = 'realizado'` + `status_pagamento = 'pago'`
2. Repasse só fica `disponivel` quando `status_pagamento = 'pago'`
3. Sessão cancelada não gera pagamento nem repasse

---

## Histórico de Alterações

| Data       | Alteração                          | Autor  |
| ---------- | ---------------------------------- | ------ |
| 2026-01-31 | Documentação inicial               | Claude |
| 2026-01-31 | Adicionada sincronização de status | Claude |

---

_Este documento deve ser atualizado sempre que há mudanças significativas na arquitetura ou novas dívidas técnicas são identificadas._
