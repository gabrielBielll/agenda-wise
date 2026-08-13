#!/usr/bin/env python3
"""Confere os links entre mensagens do canal.

Existe porque a renumeração por colisão (ver README) quebra links de duas
formas, e as duas já aconteceram:

  - o arquivo é renomeado e algum link continua apontando para o nome antigo
  - o link é corrigido mas o rótulo fica com o número velho: [0010](0012-...)

O segundo é pior, porque o link funciona e mente sobre para onde vai.

Uso:  python3 mensageria/checa_links.py
Sai com código 1 se achar problema, para poder entrar em CI depois.
"""
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).parent
LINK = re.compile(r"\[([^\]]+)\]\((\d{4}-[^)]+\.md)\)")


def main() -> int:
    existentes = {p.name for p in BASE.glob("*.md")}
    problemas = []

    for arquivo in sorted(BASE.glob("*.md")):
        for rotulo, alvo in LINK.findall(arquivo.read_text(encoding="utf-8")):
            if alvo not in existentes:
                problemas.append(f"{arquivo.name}: alvo inexistente -> {alvo}")
            elif re.fullmatch(r"\d{4}", rotulo) and not alvo.startswith(rotulo):
                problemas.append(
                    f"{arquivo.name}: rótulo [{rotulo}] aponta para {alvo[:4]} — "
                    f"link certo, rótulo mentindo"
                )

    # Numeração duplicada: o sintoma de colisão que ainda não foi resolvida.
    por_numero: dict[str, list[str]] = {}
    for p in BASE.glob("[0-9][0-9][0-9][0-9]-*.md"):
        por_numero.setdefault(p.name[:4], []).append(p.name)
    for numero, arquivos in sorted(por_numero.items()):
        if len(arquivos) > 1:
            problemas.append(f"número {numero} usado por {len(arquivos)}: {', '.join(arquivos)}")

    if problemas:
        print("PROBLEMAS:")
        for p in problemas:
            print("  " + p)
        return 1

    print(f"✓ {len(existentes)} arquivos, links e numeração consistentes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
