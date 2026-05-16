# [RT-004] WebSocket de chat com pub/sub Redis

**Severidade:** 🟠 High
**Sprint:** 7
**Esforço:** XL (>2 dias)
**Área:** Backend / Frontend
**Status:** TODO

## Contexto

Implementação do chat psicólogo↔paciente em tempo real. Une [RT-001](RT-001-migrar-aleph.md) (WebSocket via Aleph), [RT-002](RT-002-redis-infra.md) (Redis pub/sub/streams) e [RT-003](RT-003-schema-mensagens-chat.md) (persistência).

Requisitos funcionais:
- Psicólogo e paciente trocam mensagens em tempo real
- Mensagens persistem (perda zero)
- Presença: "online", "digitando..."
- Marcação de leitura (lida_em)
- Reconexão automática com replay de mensagens perdidas
- Funciona com múltiplas instâncias do backend (pub/sub Redis)
- Audit log de envio/leitura

## Localização

Novo: criar namespace `deep-saude-backend.chat` no backend.
Frontend: `src/lib/chat/`, `src/hooks/useChat.ts`, componente de chat.

## Solução proposta

### Arquitetura

```
Cliente A (Browser)              Cliente B (Browser)
    │                                  │
    │ WSS                              │ WSS
    │                                  │
    ▼                                  ▼
┌──────────────┐                ┌──────────────┐
│ Backend #1   │                │ Backend #2   │
│ (Aleph)      │                │ (Aleph)      │
└──────┬───────┘                └──────┬───────┘
       │                               │
       │  XADD / XREAD                 │
       └──────────┬────────────────────┘
                  ▼
        ┌────────────────┐
        │ Redis Streams  │  ds:chat:canal:{id}:stream
        │ + Pub/Sub      │  ds:presenca:user:{id}
        └────────┬───────┘
                 │
                 ▼ persistência durável
         ┌────────────────┐
         │ Postgres/CRDB  │  chat_canais, chat_mensagens
         └────────────────┘
```

### Backend — endpoint WebSocket

```clojure
(ns deep-saude-backend.chat
  (:require [aleph.http :as http]
            [manifold.stream :as s]
            [manifold.deferred :as d]
            [cheshire.core :as json]
            [taoensso.carmine :as car]))

(defn ws-chat-handler [request]
  (-> (http/websocket-connection request)
      (d/chain
        (fn [conn]
          (let [{:keys [usuario-id]} (:identity request)
                canal-id (parse-uuid (get-in request [:params :canal-id]))]
            (when-not (autorizado-no-canal? usuario-id canal-id)
              (s/close! conn)
              (throw (ex-info "não autorizado" {})))

            (registrar-conexao! conn usuario-id canal-id)

            ;; subscriber: ouve Redis e envia para o socket
            (start-subscriber! conn canal-id)

            ;; publisher: lê do socket, persiste em DB, publica no Redis
            (s/consume
              (fn [raw]
                (let [msg (json/parse-string raw true)]
                  (handle-incoming! msg usuario-id canal-id)))
              conn)

            ;; cleanup ao desconectar
            (s/on-closed conn
              (fn []
                (desregistrar-conexao! usuario-id canal-id))))))))

(defn handle-incoming! [{:keys [tipo conteudo client-msg-id]} usuario-id canal-id]
  (case tipo
    "mensagem"
    (let [salva (jdbc/with-transaction [tx @datasource]
                  (sql/insert! tx :chat_mensagens
                    {:canal_id canal-id
                     :remetente_id usuario-id
                     :remetente_tipo (tipo-do-usuario usuario-id canal-id)
                     :conteudo conteudo}))]
      (with-redis
        (car/xadd (str "ds:chat:canal:" canal-id ":stream") "*"
                  "id"        (:id salva)
                  "remetente" usuario-id
                  "conteudo"  conteudo
                  "enviada_em" (str (:enviada_em salva))))
      (audit! {:acao "SEND_MESSAGE" :recurso-tipo "chat_mensagens" :recurso-id (:id salva)}))

    "leitura"
    (do
      (jdbc/execute! @datasource
        ["UPDATE chat_mensagens SET lida_em = NOW()
          WHERE canal_id = ? AND lida_em IS NULL AND remetente_id != ?
            AND enviada_em <= (SELECT enviada_em FROM chat_mensagens WHERE id = ?)"
         canal-id usuario-id (:ate-msg-id payload)])
      (with-redis
        (car/publish (str "ds:chat:canal:" canal-id ":eventos")
                     (json/generate-string {:tipo "leitura" :usuario-id usuario-id}))))

    "digitando"
    (with-redis
      (car/sadd (str "ds:presenca:canal:" canal-id ":digitando") usuario-id)
      (car/expire (str "ds:presenca:canal:" canal-id ":digitando") 5)
      (car/publish (str "ds:chat:canal:" canal-id ":eventos")
                   (json/generate-string {:tipo "digitando" :usuario-id usuario-id})))))
```

### Por que Redis Streams + Pub/Sub

- **Streams (XADD/XREAD)**: persistência curta (24h), suporta consumer groups, permite **replay** quando cliente reconecta.
- **Pub/Sub (PUBLISH/SUBSCRIBE)**: eventos efêmeros (digitando, leitura). Sem persistência, sem replay.

Cliente que reconecta passa `last_seen_id`, backend faz `XRANGE` no canal para entregar tudo o que perdeu.

### Frontend — hook React

```typescript
// src/hooks/useChat.ts
'use client';
import { useEffect, useRef, useState } from 'react';

export function useChat(canalId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conectado, setConectado] = useState(false);
  const reconnectRef = useRef({ tentativas: 0, timer: null as NodeJS.Timeout | null });

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/chat/${canalId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConectado(true);
        reconnectRef.current.tentativas = 0;
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'mensagem') setMensagens(prev => [...prev, msg]);
        // ... outros tipos
      };

      ws.onclose = () => {
        setConectado(false);
        // backoff exponencial: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(30_000, 1000 * 2 ** reconnectRef.current.tentativas);
        reconnectRef.current.tentativas++;
        reconnectRef.current.timer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
      wsRef.current?.close();
    };
  }, [canalId]);

  function enviar(conteudo: string) {
    const clientId = crypto.randomUUID();
    wsRef.current?.send(JSON.stringify({ tipo: 'mensagem', conteudo, client_msg_id: clientId }));
    // optimistic update
    setMensagens(prev => [...prev, { id: clientId, conteudo, pendente: true, ... }]);
  }

  return { mensagens, enviar, conectado };
}
```

### Autenticação WebSocket

WebSocket não tem cabeçalho `Authorization` no handshake do browser. Soluções:

1. **Token na URL** (`/ws/chat/{id}?token=...`) — visível em log, evitar.
2. **Cookie httpOnly** ([SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md)) — browser envia cookie no handshake — **escolha recomendada**.
3. **Subprotocolo customizado** com token — complexo.

Combinado com SEC-008, cookie httpOnly resolve.

### Reconexão e replay

Cliente armazena `lastSeenMessageId` em IndexedDB. Ao reconectar, envia como query param: `?since=<id>`. Backend faz `XRANGE ds:chat:canal:{id}:stream <id> +` para entregar atrasadas (até 24h, retenção do stream).

Para mensagens > 24h, paginação via REST (carregar histórico em scroll).

### Rate limiting

Por usuário, por canal: ~30 mensagens/min. Excedeu → backend manda `{tipo: "rate_limited", reset_in_seconds: ...}` e segura.

Implementação com Redis:
```clojure
(with-redis
  (let [k (str "ds:rate:chat:" usuario-id ":" canal-id)
        count (car/incr k)]
    (when (= 1 count) (car/expire k 60))
    count))
```

## Critérios de aceitação

- [ ] Endpoint `/ws/chat/:canal-id` autenticado via cookie httpOnly
- [ ] Mensagem enviada por A aparece em B em <500ms (P95)
- [ ] Mensagem persistida no DB antes de confirmar ao remetente
- [ ] Reconexão com replay funcionando (testar derrubando WS no meio da sessão)
- [ ] Indicador "digitando" funciona, expira em 5s
- [ ] Marcação de leitura aparece no outro lado
- [ ] Audit log de SEND_MESSAGE, VIEW_CHAT, READ_MESSAGE
- [ ] Rate limit por usuário+canal (30/min)
- [ ] Smoke test: 500 clientes simultâneos, 1 msg/s cada, todas entregues e persistidas
- [ ] Hook `useChat` no frontend, componente de chat plugável em qualquer página

## Riscos / dependências

- **Backpressure:** se cliente B é lento, mensagens acumulam no stream do Aleph para B. Usar `s/buffer` com cap; se cap excedido, derrubar conexão (cliente reconecta).
- **Cross-tenant:** garantir que `autorizado-no-canal?` valida `clinica_id` da identidade vs. clínica do canal. RLS ajuda ([LGPD-003](../sprint-6-lgpd/LGPD-003-row-level-security.md)).
- **Bloqueado por:** [RT-001](RT-001-migrar-aleph.md), [RT-002](RT-002-redis-infra.md), [RT-003](RT-003-schema-mensagens-chat.md), [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md).
- **Bloqueia:** funcionalidades de telemedicina que assumem chat (consentimento via chat, notificação de sala etc.).
- **Conversa com:** Sprint 8 (vídeo) — sala de vídeo provavelmente abre canal de chat automaticamente.
