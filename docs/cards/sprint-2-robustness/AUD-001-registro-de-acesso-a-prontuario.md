# [AUD-001] Registro de acesso a prontuário — a R-012 exige e não há onde gravar

**Severidade:** 🔴 Critical — **regra confirmada sem implementação**
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO
**Dono:** `duna`, depois do GC-012 e da A-004
**Desenho:** `orla`, 18/08 — a lacuna era minha: eu marquei o cartão como *"não tem desenho"* e deixei parado

## Contexto

A **R-012** tem duas metades. A primeira está implementada; a segunda não existe.

> ✅ **"Por padrão, só o psicólogo autor lê o prontuário"** — feito (A-003).
> 🔴 **"A flag deixa registro, e o registro fica atrás de uma configuração"** —
> **não há onde gravar.**

Palavras do Gabriel (2026-08-16): *"Sim, a flag deixa registro, mas o registro não
deve ser visível — deve haver uma config para liberar a visualização desse
histórico."* Ou seja: **gravar sempre, mostrar sob liberação.**

⚠️ **Hoje a saída de emergência é silenciosa.** `super-admin-le-prontuario?` está
`false` e fixo por teste — mas no dia em que alguém o ligar para atender uma
emergência, **não fica rastro nenhum de quem leu o quê**. A regra que dá sentido à
inconveniência é justamente o rastro.

## Localização

O ponto de decisão é único e já existe:

[`prontuarios.clj:68`](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/prontuarios.clj)

```clojure
(defn- pode-ler? [super-admin-le? papel usuario-id paciente]
  (or super-admin-le?
      (and (= papel "psicologo") (= (:psicologo_id paciente) usuario-id))))
```

## Solução proposta

### 1. 🔴 Grave só quando a flag foi **decisiva**, não sempre que ela está ligada

O `or` acima aceita duas causas. Se a pessoa **já podia ler** pelo caminho normal,
a flag não decidiu nada — e registrar isso enche a tabela de linhas inócuas.

```clojure
(defn- pode-ler-normalmente? [papel usuario-id paciente]
  (and (= papel "psicologo") (= (:psicologo_id paciente) usuario-id)))

(defn- flag-foi-decisiva? [super-admin-le? papel usuario-id paciente]
  (and super-admin-le? (not (pode-ler-normalmente? papel usuario-id paciente))))
```

📌 **Por que isto importa e não é economia de linha:** registro que enche de ruído
é registro que ninguém lê — a mesma assimetria da [D-017](../../../mensageria/DECISOES.md). Um log de acesso a
prontuário só serve se **toda linha nele for uma leitura que não deveria ter sido
possível.**

### 2. A tabela

```sql
CREATE TABLE acesso_prontuario (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID NOT NULL REFERENCES clinicas(id),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id),   -- quem leu
  papel         TEXT NOT NULL,                            -- o papel no momento
  motivo        TEXT NOT NULL DEFAULT 'flag_super_admin',
  lido_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_acesso_prontuario_paciente ON acesso_prontuario (paciente_id, lido_em DESC);
```

⚠️ **`papel` é gravado como texto e não como referência** — é o papel **no momento
do acesso**. Se a pessoa mudar de papel depois, o registro tem que continuar
dizendo o que era na hora (mesmo princípio da **R-004**, que manda gravar a regra
aplicada e não só o resultado).

⚠️ **Oitava/nona migration a aplicar no CockroachDB.** `gen_random_uuid()` e
`TIMESTAMPTZ` existem lá, mas **confirme no boot** — foi o aviso da A-012 e ele
continua valendo.

### 3. Gravar não pode derrubar a leitura

⚠️ **O `INSERT` do registro não entra na mesma transação da consulta**, e falha
dele **não** pode transformar uma leitura legítima em 500. Registre o erro no log
estruturado (ROB-008) e siga.

🔴 **Mas registre o erro alto.** Falha silenciosa em gravar auditoria é pior que
não ter auditoria: dá a impressão de cobertura que não existe.

### 4. A visualização fica atrás de config — e **não** entra neste cartão

A R-012 pede a tela sob liberação. **Este cartão entrega só o registro.** A tela é
trabalho próprio, é front, e sem a tabela não há o que mostrar. **Um cartão, uma
coisa.**

## Critérios de aceitação

- [ ] Teste vermelho antes (D-008): leitura pela flag **não** grava hoje
- [ ] Flag decisiva → grava uma linha com quem, quando, qual paciente e o papel
- [ ] Flag ligada mas leitor é o psicólogo dono → **não** grava
- [ ] Leitura negada (403) → **não** grava (não houve acesso)
- [ ] Falha no `INSERT` do registro **não** derruba a leitura, e aparece no log
- [ ] Migration aplica no CockroachDB

## ❓ Uma pergunta para o Gabriel, e ela não bloqueia o cartão

O registro é **só do acesso pela flag** (o que a R-012 diz literalmente), ou
**toda leitura de prontuário** deveria ser registrada?

📌 **O cartão implementa o que está confirmado — só a flag.** A alternativa é
maior (toda leitura vira escrita no banco) e é decisão de negócio, não de código.
**Não deduzir.**
