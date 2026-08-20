# Portabilidade da base de pacientes

> Implementada em 2026-08-20. Esta operação trata o **cadastro dos pacientes**;
> prontuários e sessões ficam fora porque têm regras próprias de autoria,
> histórico e sigilo.

## O que pode ser baixado

Na tela **Pacientes → Base de pacientes**, a pessoa escolhe:

- **CSV:** adequado para planilhas, com BOM UTF-8 e proteção contra fórmulas
  iniciadas por `=`, `+`, `-` ou `@`; no upload também reconhece arquivos
  separados por vírgula, ponto e vírgula ou tabulação;
- **JSON:** envelope versionado `agenda-wise/pacientes@1`, recomendado para
  integrações e para uma futura evolução do contrato;
- **SQL:** backup técnico com `INSERT` escapado e uma cópia JSON portátil
  incorporada ao cabeçalho.

O arquivo contém os campos de cadastro, vínculo com a psicóloga por e-mail e os
campos clínicos do perfil do paciente. Não contém prontuários, anotações de
sessão, agendamentos, senhas ou tokens.

O escopo é sempre calculado no servidor:

- psicóloga baixa somente a própria carteira;
- administração e secretaria baixam os pacientes da própria clínica;
- nenhum identificador de clínica enviado pelo navegador é aceito como fonte de
  autorização.

## Como funciona o upload

1. O navegador reconhece `.csv`, `.json` ou `.sql`, lê o arquivo localmente e
   valida formato, tamanho, datas, e-mails, campos e duplicidades.
2. A API faz uma **segunda validação**, inclusive dos vínculos e do escopo da
   pessoa autenticada. A prévia não escreve no banco.
3. A tela mostra quantos registros serão criados, atualizados ou mantidos.
4. Somente depois de uma confirmação explícita a interface envia os lotes para
   gravação e atualiza a lista de pacientes.

Há duas estratégias:

- `ignorar_existentes`: preserva o cadastro já encontrado;
- `atualizar_existentes`: altera apenas os campos efetivamente presentes no
  arquivo, identificando o paciente pelo ID AgendaWise ou pelo e-mail.

Cada lote tem no máximo 100 registros e cerca de 180 KB. A interface aceita um
arquivo de até 5 MB e 5.000 pacientes e divide o trabalho automaticamente. Cada
lote grava dentro de uma transação. Se houver uma alteração concorrente no
banco, ele para com uma mensagem verificável em vez de substituir dados em
silêncio.

## Regra especial do formato SQL

**SQL enviado pelo usuário nunca é executado.** O importador aceita apenas o
marcador de portabilidade criado no próprio exportador, extrai o JSON embutido e
manda registros comuns para a mesma validação dos outros formatos. Um arquivo
com `DROP`, `UPDATE` ou qualquer comando arbitrário não chega ao banco como SQL.

O marcador identifica o formato; não é uma assinatura criptográfica. Por isso,
mesmo um arquivo com marcador continua sujeito a toda a validação de campos,
permissões, clínica e carteira no backend.

## Auditoria e privacidade

Exportações, pré-validações e importações geram eventos de auditoria com clínica,
usuário, formato e contagens, sem copiar nomes, e-mails ou dados clínicos para o
log. As respostas de download usam `Cache-Control: no-store` e
`X-Content-Type-Options: nosniff`.

Os arquivos gerados podem conter dados pessoais e clínicos. A própria interface
avisa para armazená-los em local protegido.
