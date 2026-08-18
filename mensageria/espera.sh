#!/usr/bin/env bash
# espera.sh — bloqueia até chegar coisa nova no canal, e só então sai.
#
# POR QUE ISTO EXISTE, e por que é diferente do vigia.sh
#
# O `vigia.sh` responde "o que mudou até agora?" — é para rodar ao começar e
# antes de empurrar. Este responde outra pergunta: **"me avise quando mudar"**.
#
# A diferença importa para a `orla`. Ela não tem terminal onde alguém olha: ela
# acorda quando um comando termina. Então um laço que **fica parado enquanto nada
# acontece e sai no instante em que acontece** é o que transforma "esperar" em
# "ser avisada" — sem ficar perguntando de minuto em minuto e sem dormir e perder
# o que chegou.
#
# Em 2026-08-18 o Gabriel pediu exatamente isso: *"deixa um script rodando pra
# você não dormir e ficar acompanhando se chega coisa nova"*.
#
# COMO USAR
#
#   bash mensageria/espera.sh              # sai quando algo novo chegar
#   LIMITE=90 bash mensageria/espera.sh    # ou depois de 90 min, o que vier antes
#   INTERVALO=30 bash mensageria/espera.sh # conferindo a cada 30s
#
# ⚠️ Ele **não** mexe na sua árvore: só `git fetch`. Nada de merge, nada de
# checkout. Você continua dona do que está no seu diretório.
#
# Sai com 0 sempre — "chegou coisa" e "deu o tempo" são resultados, não erros.

set -uo pipefail

BRANCH="${VIGIA_BRANCH:-claude/google-calendar-integration-arch-7tvhae}"
INTERVALO="${INTERVALO:-60}"   # segundos entre conferidas
LIMITE="${LIMITE:-45}"         # minutos até desistir e reportar silêncio

cd "$(dirname "$0")/.." || exit 1

remoto="origin/$BRANCH"

# Estado de partida. Se o fetch inicial falhar, seguimos assim mesmo: o laço
# tenta de novo, e rede que volta é o caso comum.
git fetch origin "$BRANCH" --quiet 2>/dev/null || true
sha_base=$(git rev-parse "$remoto" 2>/dev/null || echo "desconhecido")
msgs_base=$(git ls-tree --name-only "$remoto" mensageria/ 2>/dev/null | grep '^mensageria/0.*\.md$' || true)

echo "⏳ esperando em $BRANCH — a partir de ${sha_base:0:7}"
echo "   confere a cada ${INTERVALO}s, desiste em ${LIMITE}min"

fim=$(( $(date +%s) + LIMITE * 60 ))

while :; do
  sleep "$INTERVALO"

  git fetch origin "$BRANCH" --quiet 2>/dev/null || continue
  sha_agora=$(git rev-parse "$remoto" 2>/dev/null) || continue

  if [ "$sha_agora" != "$sha_base" ] && [ "$sha_base" != "desconhecido" ]; then

    # ⚠️ Ignora push SÓ meu.
    #
    # Em 18/08 este laço acordou duas vezes com o próprio commit de quem o
    # armou: você arma o vigia, escreve uma mensagem, empurra — e ele dispara
    # anunciando você para você mesma. Alarme que não significa nada é como se
    # aprende a ignorar alarme, então ele passa a exigir **autor diferente**.
    #
    # `EU` é o nome de autor a ignorar; por padrão o meu, na sandbox.
    outros=$(git log --format='%an' "$sha_base..$sha_agora" | grep -vx "${EU:-Claude}" || true)
    if [ -z "$outros" ]; then
      sha_base="$sha_agora"
      msgs_base=$(git ls-tree --name-only "$remoto" mensageria/ 2>/dev/null | grep '^mensageria/0.*\.md$' || true)
      echo "   (push só meu em ${sha_agora:0:7} — seguindo à espera)"
      continue
    fi

    echo
    echo "🔔 CHEGOU COISA NOVA em $BRANCH"
    echo
    echo "── commits ──────────────────────────────────────────"
    git log --oneline --format='%h %an: %s' "$sha_base..$sha_agora"

    msgs_agora=$(git ls-tree --name-only "$remoto" mensageria/ 2>/dev/null | grep '^mensageria/0.*\.md$' || true)
    novas=$(comm -13 <(echo "$msgs_base" | sort) <(echo "$msgs_agora" | sort))
    if [ -n "$novas" ]; then
      echo
      echo "── mensagens novas ──────────────────────────────────"
      echo "$novas"
    else
      echo
      echo "(nenhuma mensagem nova — é commit de código ou de doc)"
    fi
    echo
    echo "📌 nada foi mesclado na sua árvore. Para trazer:"
    echo "   git pull --ff-only origin $BRANCH"
    exit 0
  fi

  if [ "$(date +%s)" -ge "$fim" ]; then
    echo
    echo "🤫 ${LIMITE}min de silêncio em $BRANCH — nada novo desde ${sha_base:0:7}."
    echo "   Rode de novo para continuar esperando."
    exit 0
  fi
done
