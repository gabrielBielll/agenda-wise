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

**Não sei dizer se são pacientes reais.** Dos 14 registros de paciente, 6 têm
marca clara de teste e 8 não têm; há endereços `@gmail.com`. Os prontuários têm
232 a 261 caracteres cada — texto, não preenchimento. **Só o Gabriel pode
responder isso, e a resposta muda a natureza do incidente:**

- **Se forem sintéticos:** é exposição de credencial. Grave, resolvida por
  rotação.
- **Se algum for real:** é vazamento de **dado pessoal sensível de saúde**
  (LGPD art. 5º, II), exposto publicamente por três meses, com dever de
  avaliação de comunicação à ANPD e aos titulares (art. 48).

## O que já foi feito

Nesta sessão, no HEAD da branch do PR #7:

- `backups/` removido do versionamento, junto com os cinco scripts Python de
  administração e dois utilitários de migração que carregavam host/credencial.
- `.gitignore` passa a barrar `backups/`, `backup_*.sql` e `*.sql.gz`.

⚠️ **Isso não resolve nada sozinho, e é importante não se enganar com o
alívio:** remover do HEAD não remove do histórico. Todo commit antigo continua
público, e o conteúdo pode já ter sido clonado, indexado ou copiado. **Segredo
que foi publicado está comprometido — a única correção é trocá-lo.**

## O que só o Gabriel pode fazer, em ordem

1. **Tornar o repositório privado.** É um clique e é a única medida que reduz a
   exposição imediatamente. Não desfaz o que já foi copiado, mas para a
   hemorragia. Faça antes dos outros passos.
2. **Rotacionar tudo o que apareceu** (SEC-002, aberto desde maio):
   - usuário/senha do CockroachDB — e conferir no console se há acesso de
     origem desconhecida no período
   - `JWT_SECRET` — trocar invalida todas as sessões, o que é o efeito desejado
   - credencial do MinIO
   - senha do usuário admin
3. **Responder se os 8 prontuários são de pacientes reais.** É o que decide se
   isto é rotação de credencial ou incidente com dever de notificação.

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

⚠️ **Isto entra antes de qualquer coisa no caminho para produção.** Vender
acesso a outras clínicas significa hospedar dado sensível de saúde **de
terceiros**; um vazamento deixa de ser problema técnico e vira responsabilidade
contratual e civil perante a clínica cliente e os pacientes dela.

Concretamente, dois cards do sprint 1 saem de "pendência antiga" para
**bloqueadores de lançamento**: SEC-002 (rotação) e SEC-003 (remoção e limpeza).
