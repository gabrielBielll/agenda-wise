# Incidente — segredos e dump de banco em repositório público

> Achado em 2026-08-15 pela `orla` (Claude na sandbox), ao levantar o que falta
> para o sistema ir ao ar.
> **Este documento não contém nenhum dado pessoal.** A classificação abaixo foi
> feita por contagem e por padrão, sem copiar conteúdo para lugar nenhum.

## O fato

O repositório `gabrielBielll/agenda-wise` é **público** (confirmado pela API do
GitHub, `private: false`). Dentro dele, versionado e acessível a qualquer pessoa:

| O quê | Onde | Desde |
|---|---|---|
| Dump completo do banco, com dados clínicos | `backups/backup_deep_saude_db_*.sql` | commit `356611c`, 2026-05-15 |
| Credencial e host do CockroachDB de produção | `check_remote_hash.py` e outros 4 scripts na raiz | `356611c` |
| `JWT_SECRET` literal | `.ai-instructions/*.md`, `start-dev.sh` | anterior |
| Host remoto do banco | `README` do backend, `doc/consolidated_docs.md` | anterior |

O dump de 2026-02-07 contém, em blocos `COPY`:

- **14 pacientes**, **8 prontuários**, **14 usuários com `senha_hash`**,
  36 agendamentos, 6 bloqueios, 1 clínica.

✅ **Respondido pelo Gabriel em 2026-08-15: os dados são todos sintéticos.**
Nenhum paciente real, nenhum prontuário real. **Não há vazamento de dado pessoal
e não existe dever de notificação.** A metade grave do incidente cai aqui.

Fica o registro de como a dúvida existiu, porque a lição vale: pela leitura
automática não dava para decidir — 6 dos 14 pacientes tinham marca de teste e 8
não, havia endereços `@gmail.com`, e os prontuários tinham 232 a 261 caracteres
de texto. **Dado de teste que não se anuncia como teste custa uma investigação.**
Semear com marca explícita é barato e evita a próxima.

O repositório era público **de propósito**, para dar acesso às instâncias de IA
e ao Render. O Gabriel vai torná-lo privado.

## O que já foi feito

Nesta sessão, no HEAD da branch do PR #7:

- `backups/` removido do versionamento, junto com os cinco scripts Python de
  administração e dois utilitários de migração que carregavam host/credencial.
- `.gitignore` passa a barrar `backups/`, `backup_*.sql` e `*.sql.gz`.

⚠️ **Isso não resolve nada sozinho, e é importante não se enganar com o
alívio:** remover do HEAD não remove do histórico. Todo commit antigo continua
público, e o conteúdo pode já ter sido clonado, indexado ou copiado. **Segredo
que foi publicado está comprometido — a única correção é trocá-lo.**

## O que continua valendo, com dado sintético e tudo

⚠️ **A exposição de credencial não depende de os dados serem falsos.** São duas
coisas, e só uma foi resolvida pela resposta acima:

- O **CockroachDB de produção** é um banco real, alcançável pela internet, cujo
  host e credencial estão publicados. Quem leu aquele arquivo pode conectar
  hoje. Os dados de lá serem de mentira agora não muda que a porta está aberta
  **quando os de verdade entrarem**.
- O **`JWT_SECRET` publicado é o pior dos dois, e o menos óbvio.** Com ele,
  qualquer pessoa forja um token válido para qualquer `clinica_id` e qualquer
  papel, sem precisar de senha nenhuma. É desvio total de autenticação, e o
  isolamento entre clínicas — que é o produto que se pretende vender — passa a
  não valer nada. Isso independe do conteúdo do banco.

**O prazo dos dois é o mesmo: antes do primeiro dado real entrar.** É exatamente
o momento de ir ao ar, então rotação e lançamento são a mesma tarefa, não duas.

Sobre tornar privado: pelo que motivou a decisão, provavelmente nada quebra. O
Render implanta de repositório privado pela integração autorizada do GitHub; a
`duna` e a `vale` já **empurram** commits, o que exige credencial de escrita e
portanto não depende de o repositório ser público; e o acesso da `orla` vem da
integração da sessão, não de leitura anônima. Se algo quebrar, é reversível com
um clique.

## O que só o Gabriel pode fazer, em ordem

1. **Tornar o repositório privado** — quando fizer sentido no fluxo dele.
2. **Rotacionar tudo o que apareceu** (SEC-002, aberto desde maio):
   - usuário/senha do CockroachDB — e conferir no console se há acesso de
     origem desconhecida no período
   - `JWT_SECRET` — trocar invalida todas as sessões, o que é o efeito desejado
   - credencial do MinIO
   - senha do usuário admin
3. ✅ ~~Responder se os prontuários são reais~~ — respondido: são sintéticos.

Depois disso, e só depois, vale discutir reescrita de histórico (`git filter-repo`
ou equivalente). Ela exige liberar temporariamente a proteção das três branches
(D-005) e quebra todos os clones existentes — é a parte cara e a menos urgente,
porque o segredo rotacionado já não vale nada.

## Por que isto passou

Não foi descuido de uma pessoa. Foi um efeito de arquivo grande:

- O commit `356611c` acrescentou **74 arquivos de documentação de uma vez** —
  os cards de sprint, a trilha AWS, e no meio deles os dumps e os scripts.
  Revisar 5.500 linhas de markdown e não reparar em dois `.sql` é o esperado.
- Os cards **SEC-002** e **SEC-003** descrevem exatamente este problema e estão
  abertos **desde maio**. A auditoria achou; o que faltou foi a execução.
- Ninguém tinha conferido se o repositório era público. Estava implícito, e
  implícito não é verificado — é a mesma lição da D-004, quando descobrimos que
  o Render observava a `main`.

## O que muda daqui para frente

Com dado sintético, isto deixa de ser urgência de hoje e vira **pré-requisito
de lançamento**, que é quase a mesma coisa quando o lançamento é o próximo
passo. Vender acesso a outras clínicas significa hospedar dado sensível de saúde
**de terceiros**; a partir daí um vazamento deixa de ser problema técnico e vira
responsabilidade contratual e civil perante a clínica cliente e os pacientes
dela.

Concretamente: **SEC-002 (rotação) é bloqueador de lançamento** — nada de dado
real antes dela. SEC-003 está meio feito (fora do HEAD; falta o histórico, que
só importa depois da rotação, e depois dela quase não importa).
