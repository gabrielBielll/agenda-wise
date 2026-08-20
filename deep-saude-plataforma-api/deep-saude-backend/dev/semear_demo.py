#!/usr/bin/env python3
"""Semeia uma clínica de demonstração pela API pública.

Dado SINTÉTICO. Nomes inventados, nenhum dado real de paciente — o ambiente que
isto alimenta não tem TLS nem domínio, então não pode receber dado clínico de
verdade.

Uso:  python3 dev/semear_demo.py http://localhost:3999 <PROVISIONING_TOKEN>
"""
import json
import sys
import urllib.request
from datetime import date, datetime, timedelta

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3999"
TOKEN_PROV = sys.argv[2] if len(sys.argv) > 2 else "token-prov-teste"

ADMIN = {"email": "admin@clinicademo.local", "senha": "DemoDeep2026"}


def chamar(metodo, caminho, corpo=None, token=None, prov=False):
    req = urllib.request.Request(API + caminho, method=metodo)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if prov:
        req.add_header("X-Provisioning-Token", TOKEN_PROV)
    dados = json.dumps(corpo).encode() if corpo is not None else None
    try:
        with urllib.request.urlopen(req, dados) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        return e.code, None


# --- clínica e admin -------------------------------------------------------
chamar("POST", "/api/admin/provisionar-clinica", {
    "nome_clinica": "Clínica Demonstração",
    "limite_psicologos": 10,
    "nome_admin": "Administração",
    "email_admin": ADMIN["email"],
    "senha_admin": ADMIN["senha"],
}, prov=True)

_, login = chamar("POST", "/api/auth/login", ADMIN)
tok = login["token"]

# --- psicólogos ------------------------------------------------------------
for nome, email in [("Ana Ribeiro", "ana@clinicademo.local"),
                    ("BrunoTavares", "bruno@clinicademo.local")]:
    chamar("POST", "/api/usuarios",
           {"nome": nome, "email": email, "senha": "DemoPsi2026",
            "papel": "psicologo", "crp": "06/123456"}, token=tok)

_, psicologos = chamar("GET", "/api/psicologos", token=tok)
psi = {p["nome"]: p["id"] for p in psicologos}
ana = psi.get("Ana Ribeiro") or psicologos[0]["id"]
bruno = psi.get("Bruno Tavares") or psicologos[-1]["id"]

# --- pacientes -------------------------------------------------------------
pacientes_desejados = [
    ("Carla Menezes", ana), ("Diego Almeida", ana), ("Elisa Nunes", ana),
    ("Felipe Rocha", bruno), ("Gabriela Souza", bruno),
]
_, existentes = chamar("GET", "/api/pacientes", token=tok)
por_nome = {p["nome"]: p["id"] for p in (existentes or [])}
for nome, dono in pacientes_desejados:
    if nome not in por_nome:
        _, novo = chamar("POST", "/api/pacientes",
                         {"nome": nome, "psicologo_id": dono, "status": "ativo",
                          "tipo_pagamento": "avulso"}, token=tok)
        if novo:
            por_nome[nome] = novo["id"]

# --- agenda da semana ------------------------------------------------------
# Segunda-feira desta semana, para o calendário abrir já com conteúdo.
hoje = date.today()
segunda = hoje - timedelta(days=hoje.weekday())

agenda = [
    (0, "09:00", "Carla Menezes", ana, 250),
    (0, "14:00", "Diego Almeida", ana, 250),
    (1, "10:00", "Elisa Nunes", ana, 300),
    (1, "15:00", "Felipe Rocha", bruno, 280),
    (2, "08:00", "Gabriela Souza", bruno, 280),
    (2, "14:00", "Carla Menezes", ana, 250),
    (3, "11:00", "Diego Almeida", ana, 250),
    (4, "16:00", "Felipe Rocha", bruno, 280),
]
criados = []
for dia, hora, paciente, dono, valor in agenda:
    quando = f"{segunda + timedelta(days=dia)}T{hora}:00"
    st, ag = chamar("POST", "/api/agendamentos",
                    {"paciente_id": por_nome[paciente], "psicologo_id": dono,
                     "data_hora_sessao": quando, "valor_consulta": valor,
                     "duracao": 50, "force": True}, token=tok)
    if ag:
        criados.append(ag["id"])

# Série semanal, para exercitar recorrência na tela.
chamar("POST", "/api/agendamentos",
       {"paciente_id": por_nome["Elisa Nunes"], "psicologo_id": ana,
        "data_hora_sessao": f"{segunda + timedelta(days=4)}T09:00:00",
        "valor_consulta": 300, "duracao": 50, "force": True,
        "recorrencia_tipo": "semanal", "quantidade_recorrencia": 6}, token=tok)

# --- financeiro com números que não sejam todos zero -----------------------
for i, ident in enumerate(criados):
    campos = {"valor_repasse": 120}
    if i % 3 == 0:
        campos["status_repasse"] = "transferido"
    if i % 2 == 0:
        campos["status_pagamento"] = "pago"
    chamar("PUT", f"/api/agendamentos/{ident}", campos, token=tok)

_, todos = chamar("GET", "/api/agendamentos", token=tok)
print(f"clínica semeada: {len(todos)} agendamentos, {len(por_nome)} pacientes, "
      f"{len(psicologos)} psicólogos")
print(f"semana de referência: {segunda} a {segunda + timedelta(days=4)}")
print(f"login: {ADMIN['email']} / {ADMIN['senha']}")
