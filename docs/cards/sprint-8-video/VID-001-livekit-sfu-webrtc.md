# [VID-001] Vídeo de sessão (WebRTC via LiveKit SFU)

**Severidade:** 🟠 High (bloqueador para telemedicina)
**Sprint:** 8
**Esforço:** XL (>2 dias)
**Área:** Backend / Frontend / Infra
**Status:** TODO

## Contexto

Roadmap inclui sessões de **vídeo psicológico** embutidas na plataforma. WebRTC é a tecnologia natural. Decisão crítica de topologia:

| Topologia | Quando usa | Limite | Adequação |
|---|---|---|---|
| **P2P (Mesh)** | 1-1, sem gravação | ~3 participantes | Não serve: gravação obrigatória (LGPD/CFM) |
| **SFU** (Selective Forwarding Unit) | 1-1 e grupos pequenos com gravação | dezenas/centenas por sessão | ✅ Sim |
| **MCU** (transcoding central) | Conferência massiva | caro em CPU | Overkill para psi 1-1 |

SFU é a escolha. Opções:

| Opção | Modelo | Prós | Contras | Custo aprox. |
|---|---|---|---|---|
| **LiveKit Cloud** | SaaS | Zero ops, gravação nativa, SDKs prontos | Lock-in, custo por minuto | ~$0.015/min participante |
| **LiveKit self-hosted** | Open source | Sem custo por min, controle | Precisa SRE, infra UDP, TURN | $200-500/mês infra |
| **mediasoup** | Lib (Node) | Flexível, comunidade | Escrever signaling, sem gravação built-in | $200-500/mês |
| **Janus** | C, plugin-heavy | Maduro | Curva de aprendizado | $200-500/mês |
| **Daily.co** | SaaS | Pronto, gravação | Lock-in, mais caro | $0.025/min |

**Recomendação:** começar com **LiveKit Cloud** (SaaS). Migrar para LiveKit self-hosted quando volume justificar (~$2k/mês). API é a mesma — migração futura é "trocar URL".

## Localização

Novo: integrar LiveKit no backend (token de acesso) e frontend (cliente WebRTC).

## Solução proposta

### Arquitetura

```
┌──────────────┐                       ┌──────────────┐
│ Cliente A    │ ←─── WebRTC (UDP) ──→ │ LiveKit SFU  │
│ (psicólogo)  │                       │              │
└──────┬───────┘                       └──────┬───────┘
       │                                      │
       │  HTTPS                               │
       │  POST /api/sessoes/{id}/token        │
       ▼                                      ▼
┌──────────────┐                       ┌──────────────┐
│ Backend      │  emite JWT LiveKit    │ Gravação MP4 │
│ (Clojure)    │ ────────────────────→ │ → S3/MinIO   │
└──────────────┘                       └──────────────┘
       ▲
       │
┌──────────────┐
│ Cliente B    │
│ (paciente)   │
└──────────────┘
```

### Passo 1 — conta LiveKit Cloud + projeto

1. Criar conta em livekit.io
2. Criar projeto, anotar `API_KEY` e `API_SECRET`
3. Configurar webhook URL para o backend receber eventos (room started/finished/recording)

Vars de ambiente:
```
LIVEKIT_HOST=wss://deep-saude.livekit.cloud
LIVEKIT_API_KEY=APIxxxx
LIVEKIT_API_SECRET=secret...
LIVEKIT_RECORDING_BUCKET=s3://deep-saude-recordings
```

### Passo 2 — backend emite token

LiveKit usa JWT próprio (não o JWT da aplicação). Backend assina com `API_SECRET` e retorna ao cliente autenticado:

```clojure
;; project.clj — biblioteca Java do LiveKit
[io.livekit/livekit-server "0.7.1"]

(ns deep-saude-backend.video
  (:import [io.livekit.server AccessToken VideoGrant]))

(defn gerar-token-livekit [usuario-id agendamento-id room-name]
  (let [token (AccessToken. (env :livekit-api-key) (env :livekit-api-secret))
        grant (-> (VideoGrant.)
                  (.setRoomJoin true)
                  (.setRoom room-name)
                  (.setCanPublish true)
                  (.setCanSubscribe true)
                  (.setCanPublishData true))]
    (.setIdentity token (str usuario-id))
    (.setName token (nome-do-usuario usuario-id))
    (.addGrants token grant)
    (.setTtl token (java.time.Duration/ofHours 2))
    (.toJwt token)))

(defn entrar-sessao-handler [request]
  (let [{:keys [usuario-id clinica-id]} (:identity request)
        agendamento-id (parse-uuid (get-in request [:params :id]))
        agendamento (validar-agendamento agendamento-id usuario-id clinica-id)]
    (when-not (consentimento-gravacao? agendamento)
      (throw (ex-info "consentimento ausente" {:status 409}))) ;; ver VID-002

    (let [room-name (str "agendamento-" agendamento-id)
          token     (gerar-token-livekit usuario-id agendamento-id room-name)]
      (audit! {:acao "ENTRAR_SESSAO_VIDEO" :recurso-tipo "agendamentos" :recurso-id agendamento-id})
      {:status 200
       :body {:token token
              :url (env :livekit-host)
              :room room-name}})))
```

### Passo 3 — frontend conecta

```bash
npm i livekit-client
```

```typescript
// src/components/video/SalaVideo.tsx
'use client';
import { Room, RoomEvent, RemoteTrack, RemoteParticipant } from 'livekit-client';

export function SalaVideo({ agendamentoId }: { agendamentoId: string }) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  async function entrar() {
    const { token, url } = await fetch(`/api/sessoes/${agendamentoId}/token`, { method: 'POST' }).then(r => r.json());
    await room.connect(url, token);
    await room.localParticipant.enableCameraAndMicrophone();

    room.on(RoomEvent.ParticipantConnected, p => setRemoteParticipants(prev => [...prev, p]));
    room.on(RoomEvent.ParticipantDisconnected, p => setRemoteParticipants(prev => prev.filter(x => x.sid !== p.sid)));
    room.on(RoomEvent.TrackSubscribed, (track, _, participant) => {
      if (track.kind === 'video') track.attach(/* video element do participant */);
    });
  }

  useEffect(() => () => { room.disconnect(); }, []);

  return (
    <div className="grid grid-cols-2 gap-4">
      <video ref={localVideoRef} autoPlay muted />
      {remoteParticipants.map(p => <RemoteParticipantView key={p.sid} participant={p} />)}
    </div>
  );
}
```

### Passo 4 — gravação automática

LiveKit Cloud gravação é configurada por sala. Backend chama API antes de admitir participantes (se consentimento obtido — ver [VID-002](VID-002-consentimento-gravacao-retencao.md)):

```clojure
(defn iniciar-gravacao! [room-name]
  (http/post (str (env :livekit-host) "/twirp/livekit.Egress/StartRoomCompositeEgress")
    {:headers {"Authorization" (str "Bearer " (gerar-token-admin))}
     :body (json/generate-string
             {:room_name room-name
              :file_outputs [{:s3 {:access_key (env :s3-key)
                                   :secret (env :s3-secret)
                                   :bucket (env :recording-bucket)
                                   :region "sa-east-1"}
                              :filepath (str "agendamentos/" room-name "/" (now-iso) ".mp4")}]})}))
```

Webhook do LiveKit avisa quando gravação termina:

```
POST /api/livekit/webhook
```

Backend grava `gravacao_url` no agendamento.

### Passo 5 — TURN/STUN

LiveKit Cloud provê. Self-hosted: precisa coturn. Em prod, ~10% das conexões precisam de TURN (NAT/firewall corporativo).

### Considerações de banda

- 720p ~1.5 Mbps por upstream / 1.5 Mbps por downstream
- Sessão 1-1: ~3 Mbps total por usuário
- 1000 sessões 1-1 simultâneas: ~3 Gbps através do SFU
- LiveKit Cloud escala automático; egress é o custo dominante

### LGPD: dados saindo do Brasil?

LiveKit Cloud tem região São Paulo. Configurar `region: 'sa-east-1'` ao criar projeto. Gravações em S3 região SP. **Crítico** para dados de saúde brasileiros.

## Critérios de aceitação

- [ ] Projeto LiveKit Cloud criado em região SP
- [ ] Backend emite token JWT LiveKit válido
- [ ] Endpoint `/api/sessoes/{id}/token` autorizado e auditado
- [ ] Frontend componente `SalaVideo` conecta, exibe vídeo bidirecional
- [ ] Câmera/mic com controles (mute, off, sair)
- [ ] Reconexão automática em queda de rede
- [ ] Gravação inicia automaticamente (se consentimento) e termina ao sair
- [ ] Arquivo MP4 em S3 região SP após sessão
- [ ] Webhook LiveKit recebido, agendamento atualizado com URL da gravação
- [ ] Smoke: sessão 30 min, gravação completa, arquivo legível

## Riscos / dependências

- **Custo:** LiveKit Cloud cobra por minuto-participante. Sessão 1-1 de 50min = 100min-participante = ~$1.50. Mil sessões/mês = ~$1500. Modelar no pricing.
- **Egress S3:** download de gravação = transferência cobrada. Considerar CDN para psicólogo revisitar.
- **Compliance:** ver [VID-002](VID-002-consentimento-gravacao-retencao.md) — consentimento é **pré-requisito legal** para gravação.
- **Dependência:** [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md) (cookie httpOnly), [LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md) (audit do acesso à sessão).
- **Bloqueia:** features de telemedicina dependentes (registro de presença, comprovante de atendimento via vídeo, telemetria de qualidade).
- **Estimativa de custo migração para self-host:** vale quando ~$2-3k/mês em LiveKit Cloud. Antes disso, fica.
