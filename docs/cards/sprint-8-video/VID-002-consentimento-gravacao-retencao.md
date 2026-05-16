# [VID-002] Consentimento, criptografia e retenção da gravação de vídeo

**Severidade:** 🔴 Critical (compliance)
**Sprint:** 8
**Esforço:** L (1-2 dias)
**Área:** Backend / Frontend / DB
**Status:** TODO

## Contexto

Gravar sessão de psicoterapia gera o **dado pessoal mais sensível possível** sob LGPD. Requisitos legais e éticos:

1. **LGPD art. 7º + 11º:** dado pessoal sensível exige base legal específica. Para vídeo de sessão, **consentimento livre, informado, inequívoco e específico** do paciente é o caminho.
2. **CFM Resolução 2.314/2022 (telemedicina):** "registro da consulta" só pode ser feito com autorização expressa, documentada.
3. **CFP Resolução 11/2018:** sigilo profissional do psicólogo se estende à gravação. Acesso restrito ao próprio psicólogo + paciente.
4. **Retenção:** vídeo é parte do prontuário (CFM 1.821/2007) — **20 anos**.
5. **Criptografia em repouso obrigatória** para dado sensível em escala.

Implementação de gravação ([VID-001](VID-001-livekit-sfu-webrtc.md)) **não pode ser ligada** antes deste card concluir.

## Localização

Novo: campos em `agendamentos` para consentimento e gravação, nova tabela `consentimentos`, mudanças em handlers.

## Solução proposta

### Passo 1 — schema

Migration:

```sql
-- registro persistente de consentimentos (histórico)
CREATE TABLE IF NOT EXISTS consentimentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID NOT NULL REFERENCES clinicas(id),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id),
  agendamento_id UUID REFERENCES agendamentos(id), -- null se for consentimento amplo
  tipo          TEXT NOT NULL CHECK (tipo IN (
                  'gravacao_sessao_video',
                  'gravacao_audio',
                  'compartilhamento_dados',
                  'pesquisa_anonimizada'
                )),
  versao_termo  TEXT NOT NULL,        -- ex: "v1-2026-05"
  texto_termo   TEXT NOT NULL,         -- snapshot do termo aceito (imutável)
  concedido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revogado_em   TIMESTAMPTZ,
  ip            INET,
  user_agent    TEXT,
  metodo        TEXT NOT NULL CHECK (metodo IN ('digital_app', 'assinatura_digital', 'presencial_papel'))
);

CREATE INDEX idx_consentimentos_paciente_tipo
  ON consentimentos (paciente_id, tipo, concedido_em DESC);

-- referência rápida no agendamento
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS consentimento_gravacao_id UUID REFERENCES consentimentos(id),
  ADD COLUMN IF NOT EXISTS gravacao_url TEXT,           -- s3://... (apontamento)
  ADD COLUMN IF NOT EXISTS gravacao_iniciada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gravacao_finalizada_em TIMESTAMPTZ;
```

### Passo 2 — fluxo de consentimento

**Antes da primeira sessão com vídeo**, paciente vê tela:

```
┌─────────────────────────────────────────────────────┐
│ Consentimento para Gravação de Sessão               │
│                                                     │
│ [Texto completo do termo, incluindo:                │
│   - quem acessa (só você + seu psicólogo)           │
│   - por quanto tempo (20 anos, conforme CFM)        │
│   - direito de revogar a qualquer momento           │
│   - direito de pedir exclusão (após 20 anos)        │
│   - criptografia                                    │
│   - LGPD: contato do DPO]                           │
│                                                     │
│ ☐ Li e concordo com a gravação desta sessão         │
│ ☐ Autorizo gravação de TODAS as sessões futuras     │
│   (revogável a qualquer momento)                    │
│                                                     │
│ [Não concordo, sessão sem gravação] [Concordo]      │
└─────────────────────────────────────────────────────┘
```

Endpoint:
```
POST /api/consentimentos
{
  "tipo": "gravacao_sessao_video",
  "agendamento_id": "...",     // ou null se amplo
  "versao_termo": "v1-2026-05"
}
```

Backend grava com IP/UA da request. Versão do termo é immutable — se texto mudar, novo aceite.

### Passo 3 — verificação antes de gravar

Antes de iniciar gravação no LiveKit ([VID-001](VID-001-livekit-sfu-webrtc.md)):

```clojure
(defn consentimento-gravacao? [agendamento-id]
  (let [{:keys [paciente_id]} (execute-one!
                                ["SELECT paciente_id FROM agendamentos WHERE id = ?"
                                 agendamento-id])
        consentimento (execute-one!
                        ["SELECT id FROM consentimentos
                          WHERE paciente_id = ?
                            AND tipo = 'gravacao_sessao_video'
                            AND revogado_em IS NULL
                            AND (agendamento_id = ? OR agendamento_id IS NULL)
                          ORDER BY concedido_em DESC LIMIT 1"
                         paciente_id agendamento-id])]
    (when consentimento
      (sql/update! @datasource :agendamentos
        {:consentimento_gravacao_id (:id consentimento)
         :gravacao_iniciada_em (java.time.Instant/now)}
        {:id agendamento-id}))
    (some? consentimento)))
```

Se `false`: backend **não chama** `iniciar-gravacao!` no LiveKit. Sessão acontece sem gravação.

### Passo 4 — revogação

```
POST /api/consentimentos/{id}/revogar
```

Define `revogado_em`. Gravações **já feitas** não são apagadas automaticamente (são prontuário — 20 anos). Mas:
- Próximas sessões não gravam mesmo se o paciente esquecer de marcar
- Paciente pode pedir exclusão expressa via portabilidade ([LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md))

### Passo 5 — criptografia em repouso

LiveKit Cloud → S3 com **SSE-KMS** (chave gerenciada pela clínica via AWS KMS):

```
LIVEKIT_RECORDING_S3_SSE=aws:kms
LIVEKIT_RECORDING_S3_KMS_KEY_ID=arn:aws:kms:sa-east-1:.../key/...
```

Chave por clínica (multi-tenant key management) é o ideal mas complexo. MVP: chave única do projeto + audit log de quem decifra.

### Passo 6 — acesso à gravação

Endpoint protegido:
```
GET /api/agendamentos/{id}/gravacao
```

- Apenas paciente do agendamento, psicólogo dono, ou admin da clínica
- Retorna URL **pre-signed** (S3) com validade curta (15 min)
- Audit `VIEW_GRAVACAO` com IP

### Passo 7 — retenção

- Default: 20 anos a partir do `gravacao_finalizada_em` (CFM)
- Job mensal lista gravações > 20 anos e oferece purge controlada por admin (não automático — exige confirmação)
- Gravação de **paciente que pediu exclusão LGPD** + além do prazo CFM mínimo: purge imediata

### Passo 8 — UI obrigatória durante a sessão

Indicador visual de gravação no overlay do vídeo: bolinha vermelha + texto "Gravando". CFP exige que **ambos vejam claramente**.

### Documentação obrigatória

- `docs/lgpd/consentimento.md` com fluxo
- `docs/lgpd/termo-gravacao-v1.md` com texto original do termo
- Política de privacidade pública mencionando

## Critérios de aceitação

- [ ] Tabela `consentimentos` criada
- [ ] Termo de consentimento v1 escrito e versionado em `docs/lgpd/`
- [ ] Endpoint `POST /api/consentimentos`
- [ ] Endpoint `POST /api/consentimentos/{id}/revogar`
- [ ] `iniciar-gravacao!` só roda se `consentimento-gravacao?` retorna true
- [ ] Indicador visual de gravação no vídeo
- [ ] Gravação em S3 com SSE-KMS
- [ ] Endpoint `GET /api/agendamentos/{id}/gravacao` com URL pre-signed
- [ ] Audit log de VIEW_GRAVACAO, CONSENTIMENTO_DADO, CONSENTIMENTO_REVOGADO
- [ ] Job de retenção stub (não automatizado ainda; lista candidatos)
- [ ] Aprovação jurídica do texto do termo

## Riscos / dependências

- **Risco legal:** ligar [VID-001](VID-001-livekit-sfu-webrtc.md) sem este card é violação direta da LGPD/CFM. Bloqueio absoluto.
- **Termo precisa de revisão jurídica antes de lançar.** Não é redigido por engenharia.
- **Custos KMS:** AWS KMS cobra por requisição de decrypt. Para sessões frequentes acessadas pouco, custo baixo. Modelar.
- **Dependência:** [VID-001](VID-001-livekit-sfu-webrtc.md), [LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md), [LGPD-002](../sprint-6-lgpd/LGPD-002-soft-delete-retencao.md).
- **Conversa com:** [AWS-005](../aws-migration/AWS-005-s3-bucket-storage.md), [AWS-006](../aws-migration/AWS-006-secrets-manager.md) — bucket + KMS na trilha AWS.
- **DPO:** clínica precisa indicar Encarregado de Dados (DPO). Plataforma pode oferecer Deep Saúde como DPO terceirizado por contrato — decisão de produto, não engenharia.
