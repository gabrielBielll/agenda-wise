/**
 * Prova da regra de CEP — o caso que o Gabriel encontrou, e os controles.
 *
 * 🔴 Roda sem navegador (`npx tsx scripts/prova-aplicar-cep.ts`) porque a regra
 * é FUNÇÃO PURA. Enquanto ela morava dentro do `onChange` das duas telas, o
 * único jeito de exercitá-la era clicando — e foi assim que o defeito passou.
 */
import { aplicarCep, type CamposDeEndereco } from "../src/lib/aplicar-cep";
import type { ResultadoDeCep } from "../src/lib/viacep";

const SE: CamposDeEndereco  = { logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP" };
const AV: CamposDeEndereco  = { logradouro: "Av. Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };
const VAZIO: CamposDeEndereco = { logradouro: "", bairro: "", cidade: "", uf: "" };
const ok = (e: CamposDeEndereco): ResultadoDeCep => ({ estado: "ok", endereco: e });

let falhas = 0;
const conf = (nome: string, real: unknown, esperado: unknown) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { console.log(`  ✅ ${nome}`); }
  else { falhas++; console.log(`  🔴 ${nome}\n      esperado ${b}\n      veio     ${a}`); }
};

console.log("=== O DEFEITO QUE O GABRIEL ACHOU ===");
{
  // 1ª consulta preenche
  const p1 = aplicarCep(VAZIO, ok(SE), null);
  conf("primeiro CEP preenche", p1.campos, SE);
  // 2ª consulta com OUTRO cep — antes, isto deixava o endereço da Sé
  const p2 = aplicarCep(p1.campos, ok(AV), p1.vindoDaConsulta);
  conf("SEGUNDO CEP substitui o endereço (era o defeito)", p2.campos, AV);
}

console.log("\n=== O CASO PIOR: segundo CEP não existe ===");
{
  const p1 = aplicarCep(VAZIO, ok(SE), null);
  const p2 = aplicarCep(p1.campos, { estado: "nao-encontrado" }, p1.vindoDaConsulta);
  conf("limpa o endereço que veio da consulta anterior", p2.campos, VAZIO);
  conf("e avisa", typeof p2.aviso === "string" && p2.aviso.length > 0, true);
}

console.log("\n=== CONTROLE: o que a pessoa digitou À MÃO sobrevive ===");
{
  const aMao: CamposDeEndereco = { ...VAZIO, logradouro: "Rua que eu digitei" };
  const r = aplicarCep(aMao, { estado: "nao-encontrado" }, null);
  conf("CEP inexistente NÃO apaga texto manual", r.campos, aMao);
}

console.log("\n=== CONTROLE: falha de rede não mexe em nada ===");
{
  const p1 = aplicarCep(VAZIO, ok(SE), null);
  const p2 = aplicarCep(p1.campos, { estado: "indisponivel", motivo: "sem conexão" }, p1.vindoDaConsulta);
  conf("mantém o endereço", p2.campos, SE);
  conf("mantém a origem, para a próxima consulta ainda saber", p2.vindoDaConsulta, SE);
}

console.log("\n=== CONTROLE: CEP incompleto não faz nada ===");
{
  const p1 = aplicarCep(SE, { estado: "invalido" }, SE);
  conf("nem mexe nem avisa", [p1.campos, p1.aviso], [SE, null]);
}

console.log(`\n${falhas === 0 ? "✅ tudo passou" : `🔴 ${falhas} falha(s)`}`);
process.exit(falhas === 0 ? 0 : 1);
