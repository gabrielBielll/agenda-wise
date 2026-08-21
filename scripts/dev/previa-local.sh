#!/data/data/com.termux/files/usr/bin/bash
# Sobe a plataforma inteira neste Termux e a expõe na rede local.
#
# ## Por que este arquivo existe
#
# Em 2026-08-21 o Gabriel disse, nas palavras dele: *"até eu ver algo em produção
# vc faz mil perguntas, aí abre um PR, a orla faz mais mil perguntas e depois joga
# para prod. Bem demorado."*
#
# Ele tinha razão, e a resposta não é afrouxar o portão da `prod` — que existe
# porque produção chegou a servir código **4 min antes** do veredito do CI
# (D-020). A resposta é que **para VER não precisa de deploy nenhum**: o front
# roda aqui, e o PC dele alcança pelo Wi-Fi.
#
# Com isso o PR deixa de ser o caminho até a tela e vira o último passo, depois
# de ele já ter olhado.
#
# ## 🔴 O que eu supus errado, e fica escrito para ninguém repetir
#
# Eu passei um dia inteiro dizendo "typecheck e build não rodam aqui, quem vota é
# o CI". Era **dedução** a partir de um `node_modules/` vazio, não medição.
# Medido em 21/08: `npm ci` instala 522 pacotes no Termux, `tsc --noEmit` passa
# na app e no e2e, e o `next dev` sobe em 3,3 s — o SWC nativo do Next 15 carrega
# em Android/bionic, ao contrário do que eu supus por ele ser compilado para
# glibc.
#
# ## Uso
#
#   bash scripts/dev/previa-local.sh            # sobe o que estiver faltando
#   bash scripts/dev/previa-local.sh --parar    # derruba tudo
#
# Variáveis (todas com padrão; nenhuma é segredo de produção):
#   PORTA_FRONT   9002    PORTA_BACK  3999    PORTA_PG  5433
#   BANCO         agenda_local
#
# ⚠️ **Nenhuma credencial mora aqui.** A senha da clínica semeada vem de
# `SENHA_DEMO` no ambiente, como no `semear-demo.mjs`. Este repositório já teve um
# incidente de credencial exposta (docs/INCIDENTE_2026-08-15.md).
set -uo pipefail

PORTA_FRONT="${PORTA_FRONT:-9002}"
PORTA_BACK="${PORTA_BACK:-3999}"
PORTA_PG="${PORTA_PG:-5433}"
BANCO="${BANCO:-agenda_local}"
PGDIR="${PGDIR:-$HOME/.pg-teste}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="${LOGS:-$HOME/.previa-local}"
mkdir -p "$LOGS"

# ⚠️ O caminho do socket do Postgres não pode passar de 107 bytes — por isso
# `~/.pg-teste` e não um diretório temporário de sessão, que é longo.

vivo() { curl -s -o /dev/null -m 3 "http://127.0.0.1:$1/" 2>/dev/null; }

# 🔴 A detecção de IP NÃO usa `grep` nem `ip -o`, e isso é medição, não gosto.
#
# A primeira versão fazia `ip -4 addr show | grep -oE 'inet [0-9.]+'` e devolvia
# **vazio em silêncio** neste Termux: o `grep` do PATH é um `ugrep` que recusa
# `-oE` ("bad option: -G"), e `ip -4 -o addr show` também não imprime nada aqui.
# O efeito foi o pior possível — o script rodou "com sucesso" e simplesmente NÃO
# imprimiu a URL da rede, que é a única linha que o Gabriel precisa. Falha
# silenciosa numa saída que ninguém confere.
#
# O truque do socket UDP não envia pacote nenhum: só pergunta ao sistema qual
# interface sairia para um destino externo, e devolve o IP dela.
ip_da_rede() {
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('8.8.8.8', 80)); print(s.getsockname()[0])
except Exception:
    pass
finally:
    s.close()" 2>/dev/null
}

if [ "${1:-}" = "--parar" ]; then
  # 🔴 `pkill -f` com um padrão que aparece na PRÓPRIA linha de comando mata o
  # shell que o executa. Aconteceu comigo em 21/08: o padrão casou a URL da API
  # da Northflank que estava no mesmo comando. Por isso os padrões abaixo são
  # ancorados no processo, não em texto que eu possa estar carregando.
  pkill -f "next dev -p ${PORTA_FRONT}" 2>/dev/null
  pkill -f "deep-saude-backend" 2>/dev/null
  pg_ctl -D "$PGDIR" stop >/dev/null 2>&1
  echo "parado."
  exit 0
fi

echo "▸ Postgres"
if pg_isready -h 127.0.0.1 -p "$PORTA_PG" >/dev/null 2>&1; then
  echo "  já estava no ar (porta $PORTA_PG)"
else
  [ -d "$PGDIR" ] || initdb -D "$PGDIR" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$PGDIR" -o "-p $PORTA_PG -k $PGDIR" -l "$LOGS/pg.log" start >/dev/null
  for _ in $(seq 1 20); do pg_isready -h 127.0.0.1 -p "$PORTA_PG" >/dev/null 2>&1 && break; sleep 1; done
  echo "  subiu"
fi
createdb -h 127.0.0.1 -p "$PORTA_PG" -U postgres "$BANCO" 2>/dev/null && echo "  banco $BANCO criado" || echo "  banco $BANCO já existia"

echo "▸ Backend (Clojure)"
if vivo "$PORTA_BACK"; then
  echo "  já estava no ar (porta $PORTA_BACK)"
else
  # ⚠️ `DATABASE_URL` aqui NÃO é a forma JDBC. O `db.clj` parseia com
  # `java.net.URI`, e `jdbc:postgresql://...` faz o `.getHost` devolver null —
  # o erro que sai é "Connection refused", que não menciona a URL. Custou uma
  # tentativa em 21/08 e já estava documentado na docstring de lá.
  ( cd "$RAIZ/deep-saude-plataforma-api/deep-saude-backend" && \
    DATABASE_URL="postgresql://postgres@127.0.0.1:$PORTA_PG/$BANCO?sslmode=disable" \
    JWT_SECRET="${JWT_SECRET:-segredo-local-de-previa}" \
    PROVISIONING_TOKEN="${PROVISIONING_TOKEN:-token-local-de-previa}" \
    PORT="$PORTA_BACK" \
    setsid nohup lein run > "$LOGS/backend.log" 2>&1 & )
  for _ in $(seq 1 60); do vivo "$PORTA_BACK" && break; sleep 3; done
  vivo "$PORTA_BACK" && echo "  subiu" || { echo "  🔴 não subiu — veja $LOGS/backend.log"; exit 1; }
fi

echo "▸ Front (Next)"
if vivo "$PORTA_FRONT"; then
  echo "  já estava no ar (porta $PORTA_FRONT)"
else
  cd "$RAIZ/deep-saude-plataforma-front-end"
  [ -d node_modules ] && [ "$(ls node_modules | wc -l)" -gt 0 ] || { echo "  instalando dependências..."; npm ci --no-audit --no-fund >"$LOGS/npm.log" 2>&1; }
  IP="$(ip_da_rede)"
  # 🔴 `-H 0.0.0.0` é o que faz o PC do Gabriel alcançar. Sem isso o Next ouve só
  # em localhost — que é o localhost DESTE aparelho, não o do PC dele. Foi a
  # primeira coisa que eu tive de explicar quando ele pediu a prévia.
  API_PROXY_TARGET="http://127.0.0.1:$PORTA_BACK" \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:$PORTA_BACK" \
  BACKEND_URL="http://127.0.0.1:$PORTA_BACK" \
  NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-segredo-local-de-previa}" \
  NEXTAUTH_URL="http://${IP:-127.0.0.1}:$PORTA_FRONT" \
    setsid nohup npx next dev -p "$PORTA_FRONT" -H 0.0.0.0 > "$LOGS/front.log" 2>&1 &
  for _ in $(seq 1 40); do vivo "$PORTA_FRONT" && break; sleep 3; done
  vivo "$PORTA_FRONT" && echo "  subiu" || { echo "  🔴 não subiu — veja $LOGS/front.log"; exit 1; }
fi

IP="$(ip_da_rede)"
echo
echo "─────────────────────────────────────────────"
echo "  No aparelho:  http://127.0.0.1:$PORTA_FRONT"
if [ -n "$IP" ]; then
  echo "  Na rede:      http://$IP:$PORTA_FRONT   ← abra esta no PC"
else
  echo "  🔴 NÃO consegui descobrir o IP da rede. O servidor está no ar, mas eu"
  echo "     não sei te dizer o endereço — descubra no aparelho e use a porta $PORTA_FRONT."
fi
echo
echo "  ⚠️ O PC precisa estar no MESMO Wi-Fi. O 'localhost' daqui é o do"
echo "     aparelho, não o do PC — não existe túnel entre os dois."
echo
echo "  Banco vazio? Semeie a clínica de demonstração:"
echo "     BASE_URL=http://127.0.0.1:$PORTA_FRONT PROVISIONING_TOKEN=... \\"
echo "       SENHA_DEMO=... node scripts/semear-demo.mjs"
echo "─────────────────────────────────────────────"
