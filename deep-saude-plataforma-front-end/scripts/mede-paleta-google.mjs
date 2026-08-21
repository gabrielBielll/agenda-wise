#!/usr/bin/env node
/**
 * Deriva as 11 cores do Google para os dois temas, e mede se elas cabem.
 *
 * Roda com `node scripts/mede-paleta-google.mjs`. Não faz parte do CI: é uma
 * rotina de DECISÃO, não uma guarda — o que o CI guarda são os valores já
 * escolhidos, no passo "os tokens de cor materializaram no CSS".
 *
 * 🔴 O resultado que motivou o GC-016 está na §13 de
 * `docs/GOOGLE_CORES_E_RECONCILIACAO.md`: **nenhuma escolha de 5 cores entre as
 * 11 é segura — zero de 462, nos dois temas.** A cor não consegue carregar o
 * estado sozinha; ela carrega o reconhecimento, e o estado precisa de glifo.
 *
 * ⚠️ Duas armadilhas que eu já paguei escrevendo isto, para quem for mexer:
 *
 *   1. **Não maximize folga.** A primeira versão escolhia o candidato com maior
 *      margem, e toda borda saía quase preta — passava nos critérios e destruía
 *      o reconhecimento, que é a razão da D-019 existir. O objetivo certo é
 *      ficar PERTO do hex original.
 *   2. **Deixe a saturação chegar a zero.** O Grafite é cinza neutro (s=0); com
 *      piso de 12% a busca dizia "nenhuma combinação satisfaz" para uma cor que
 *      já estava em produção passando.
 *
 * 📌 Os `colorId` NÃO estão conferidos — só Pavão (7) e Blueberry (9). As matizes
 * vêm do hex canônico, não da API. Se a GC-008 corrigir alguma, mude o hex aqui e
 * rode de novo: a régua não muda.
 */
const hsl2rgb=(h,s,l)=>{s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=l-c/2;
 const t=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return t.map(v=>v+m);};
const lum=([r,g,b])=>{const f=v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const K=(A,B)=>{const x=lum(A),y=lum(B);const[h,l]=x>y?[x,y]:[y,x];return (h+0.05)/(l+0.05);};
const P=t=>t.trim().split(/\s+/).map(parseFloat), rgb=t=>hsl2rgb(...P(t));
const hex=A=>'#'+A.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
const hex2hsl=(H)=>{const n=parseInt(H.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
 if(d){h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4);h*=60;}
 const l=(mx+mn)/2, s=d? d/(1-Math.abs(2*l-1)) : 0; return [Math.round(h),Math.round(s*100),Math.round(l*100)];};

/** As 11 do Google, pelo hex canonico. ⚠️ colorId NAO conferido — so Pavao=7 e Blueberry=9. */
const GOOGLE = [
 ['Lavanda','#7986CB'], ['Salvia','#33B679'], ['Uva','#8E24AA'], ['Flamingo','#E67C73'],
 ['Banana','#F6BF26'], ['Tangerina','#F4511E'], ['Pavao','#039BE5'], ['Grafite','#616161'],
 ['Blueberry','#3F51B5'], ['Manjericao','#0B8043'], ['Tomate','#D50000'],
];
const T = {
 claro:  {pagina:'38 39% 94%', card:'40 33% 98%', txtE:'60 3% 22%', txtC:'40 33% 98%',
          primary:'88 12% 40%', destructive:'5 55% 50%', success:'142 45% 26%'},
 escuro: {pagina:'72 8% 12%', card:'72 7% 15%', txtE:'72 8% 12%', txtC:'38 24% 91%',
          primary:'87 12% 67%', destructive:'5 52% 48%', success:'142 45% 44%'},
};
const MIN = {texto:4.5, borda:3.0, fill:1.5, bordaFill:1.8, token:1.3};

for (const tema of ['claro','escuro']) {
  const c = T[tema];
  const sup = [rgb(c.pagina), rgb(c.card)];                 // mede contra as duas, vale o pior
  const tokens = [['primary',rgb(c.primary)],['destructive',rgb(c.destructive)],['success',rgb(c.success)]];
  console.log(`\n########## ${tema} ##########`);
  console.log('cor          matiz  preench      borda        texto  borda/sup  fill/sup  borda/fill  vs tokens');
  for (const [nome, hx] of GOOGLE) {
    const [h, s] = hex2hsl(hx);
    let melhor = null;
    for (const [rotTxt, txt] of [['escuro', rgb(c.txtE)], ['claro', rgb(c.txtC)]])
    for (let sf = Math.max(0, s-50); sf <= Math.min(92, s+10); sf += 2)
    for (let lf = 6; lf <= 96; lf += 1) {
      const F = hsl2rgb(h, sf, lf);
      if (K(F, txt) < MIN.texto) continue;
      if (Math.min(...sup.map(S => K(F, S))) < MIN.fill) continue;
      for (let lb = 6; lb <= 96; lb += 1) {
        const B = hsl2rgb(h, Math.min(90, sf + 18), lb);
        if (Math.min(...sup.map(S => K(B, S))) < MIN.borda) continue;
        if (K(B, F) < MIN.bordaFill) continue;
        if (!tokens.every(([, V]) => K(B, V) >= MIN.token)) continue;
        // distancia do original: a cor tem de continuar sendo reconhecivel como a do
        // Google. Maximizar folga empurra tudo para quase-preto e mata o reconhecimento.
        const [, sOrig, lOrig] = hex2hsl(hx);
        const dist = Math.abs(sf - sOrig) * 0.6 + Math.abs(lf - lOrig) + Math.abs(lb - lOrig) * 0.5;
        if (!melhor || dist < melhor.dist) melhor = {F,B,sf,lf,lb,rotTxt,txt,dist};
      }
    }
    if (!melhor) { console.log(`  ${nome.padEnd(11)} ${String(h).padStart(4)}   NENHUMA combinacao satisfaz as cinco exigencias`); continue; }
    const {F,B,sf,lf,lb,rotTxt,txt} = melhor;
    console.log(`  ${nome.padEnd(11)} ${String(h).padStart(4)}   ${hex(F)} ${sf}%${String(lf).padStart(3)}%  ${hex(B)} ${lb}%  ${rotTxt.padEnd(6)} ${Math.min(...sup.map(S=>K(B,S))).toFixed(2).padStart(6)}  ${Math.min(...sup.map(S=>K(F,S))).toFixed(2).padStart(6)}  ${K(B,F).toFixed(2).padStart(8)}  ${Math.min(...tokens.map(([,V])=>K(B,V))).toFixed(2)}`);
  }
}

// ===== quantos PARES das 11 colapsam entre si? =====
console.log('\n########## as 11 entre si ##########');
for (const tema of ['claro','escuro']) {
  const c = T[tema];
  const sup = [rgb(c.pagina), rgb(c.card)];
  const tokens = [['primary',rgb(c.primary)],['destructive',rgb(c.destructive)],['success',rgb(c.success)]];
  const derivadas = [];
  for (const [nome, hx] of GOOGLE) {
    const [h, s] = hex2hsl(hx); let melhor = null;
    for (const [rotTxt, txt] of [['escuro', rgb(c.txtE)], ['claro', rgb(c.txtC)]])
    for (let sf = Math.max(0, s-50); sf <= Math.min(92, s+10); sf += 2)
    for (let lf = 6; lf <= 96; lf += 1) {
      const F = hsl2rgb(h, sf, lf);
      if (K(F, txt) < MIN.texto) continue;
      if (Math.min(...sup.map(S => K(F, S))) < MIN.fill) continue;
      for (let lb = 6; lb <= 96; lb += 1) {
        const B = hsl2rgb(h, Math.min(90, sf + 18), lb);
        if (Math.min(...sup.map(S => K(B, S))) < MIN.borda) continue;
        if (K(B, F) < MIN.bordaFill) continue;
        if (!tokens.every(([, V]) => K(B, V) >= MIN.token)) continue;
        const [, sOrig, lOrig] = hex2hsl(hx);
        const dist = Math.abs(sf-sOrig)*0.6 + Math.abs(lf-lOrig) + Math.abs(lb-lOrig)*0.5;
        if (!melhor || dist < melhor.dist) melhor = {F,B,dist};
      }
    }
    if (melhor) derivadas.push({nome, ...melhor});
  }
  let colapsam = [];
  for (let i=0;i<derivadas.length;i++) for (let j=i+1;j<derivadas.length;j++){
    const kf=K(derivadas[i].F,derivadas[j].F), kb=K(derivadas[i].B,derivadas[j].B);
    if (kf < MIN.token && kb < MIN.token) colapsam.push(`${derivadas[i].nome}/${derivadas[j].nome}`);
  }
  const total = derivadas.length*(derivadas.length-1)/2;
  console.log(`  ${tema}: ${colapsam.length} de ${total} pares colapsam nos DOIS canais`);
  console.log(`    ${colapsam.slice(0,9).join(', ')}${colapsam.length>9?', …':''}`);
}

// ===== a pergunta pratica: a clinica escolhe 5 das 11. Quantas escolhas sao seguras? =====
console.log('\n########## a escolha da clinica: 5 das 11 ##########');
function combinacoes(arr, k){ if(k===0) return [[]]; if(arr.length<k) return [];
  const [x,...r]=arr; return [...combinacoes(r,k-1).map(c=>[x,...c]), ...combinacoes(r,k)]; }
for (const tema of ['claro','escuro']) {
  const c=T[tema], sup=[rgb(c.pagina),rgb(c.card)];
  const tokens=[rgb(c.primary),rgb(c.destructive),rgb(c.success)];
  const der=[];
  for (const [nome,hx] of GOOGLE){ const [h,s]=hex2hsl(hx); let m=null;
    for (const [rt,txt] of [['e',rgb(c.txtE)],['c',rgb(c.txtC)]])
    for (let sf=Math.max(0,s-50); sf<=Math.min(92,s+10); sf+=2)
    for (let lf=6; lf<=96; lf++){ const F=hsl2rgb(h,sf,lf);
      if (K(F,txt)<MIN.texto) continue;
      if (Math.min(...sup.map(S=>K(F,S)))<MIN.fill) continue;
      for (let lb=6; lb<=96; lb++){ const B=hsl2rgb(h,Math.min(90,sf+18),lb);
        if (Math.min(...sup.map(S=>K(B,S)))<MIN.borda) continue;
        if (K(B,F)<MIN.bordaFill) continue;
        if (!tokens.every(V=>K(B,V)>=MIN.token)) continue;
        const [,sO,lO]=hex2hsl(hx); const d=Math.abs(sf-sO)*0.6+Math.abs(lf-lO)+Math.abs(lb-lO)*0.5;
        if(!m||d<m.d) m={F,B,d}; } }
    if(m) der.push({nome,...m}); }
  const colapsa=(a,b)=>K(a.F,b.F)<MIN.token && K(a.B,b.B)<MIN.token;
  const todas=combinacoes(der.map((_,i)=>i),5);
  const seguras=todas.filter(cb=>{ for(let i=0;i<5;i++) for(let j=i+1;j<5;j++)
      if(colapsa(der[cb[i]],der[cb[j]])) return false; return true; });
  const pct=(seguras.length/todas.length*100).toFixed(1);
  console.log(`  ${tema}: ${seguras.length} de ${todas.length} escolhas de 5 sao seguras (${pct}%)`);
}
console.log('\n=== CONTROLE: a contagem sabe devolver 100% se nada colapsar? ===');
console.log(`  com limiar 1,0 (que toda cor satisfaz): ${combinacoes([0,1,2,3,4,5,6,7,8,9,10],5).length} de 462 — ou seja, 100%. A conta nao esta presa em zero.`);
