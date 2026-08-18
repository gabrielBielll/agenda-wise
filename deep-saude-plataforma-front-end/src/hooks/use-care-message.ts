'use client';

import { useEffect, useState } from 'react';

const intentions = [
  'Presença', 'Leveza', 'Escuta', 'Gentileza', 'Clareza', 'Paciência',
  'Acolhimento', 'Coragem', 'Pausa', 'Curiosidade', 'Compaixão', 'Equilíbrio',
  'Confiança', 'Serenidade', 'Inteireza', 'Cuidado', 'Calma', 'Respeito',
];

const accents = [
  'Respire.', 'Vá com leveza.', 'Um encontro de cada vez.',
  'Este momento também é seu.', 'Confie no processo.', 'Você não precisa correr.',
  'A presença basta.', 'Cuide do seu ritmo.', 'Comece com calma.',
  'Há espaço para pausar.', 'Escute também a si.', 'Siga com gentileza.',
];

const subtitles = [
  'Organizamos o essencial para você cuidar do que realmente importa.',
  'Sua agenda está pronta. Você só precisa chegar por inteiro.',
  'Entre horários e histórias, preserve também um espaço para você.',
  'Hoje não precisa ser perfeito — apenas presente e possível.',
  'Cada encontro merece atenção. Seu bem-estar também.',
  'Menos ruído, mais espaço para uma escuta verdadeira.',
  'Que o cuidado oferecido ao outro também encontre você.',
  'O dia pode ter ritmo sem perder a delicadeza.',
];

const reminders = [
  ['Um respiro', 'Solte os ombros antes da próxima sessão.'],
  ['Pausa protegida', 'Alguns minutos de silêncio também são trabalho.'],
  ['Cuide do ritmo', 'Você não precisa preencher todos os espaços.'],
  ['Volte ao corpo', 'Respire fundo e perceba como você chegou.'],
  ['Presença gentil', 'Não é preciso ter todas as respostas.'],
  ['Entre encontros', 'Água, movimento e uma pequena pausa.'],
  ['Seu tempo importa', 'Proteja um intervalo sempre que puder.'],
  ['Escuta interna', 'Como você está chegando para este encontro?'],
  ['Sem pressa', 'O cuidado também acontece no intervalo.'],
  ['Feche um ciclo', 'Uma nota breve agora pode aliviar o fim do dia.'],
];

const whispers = [
  'Uma pausa consciente pode mudar o tom do próximo encontro.',
  'Nem toda agenda cheia precisa ser uma agenda apressada.',
  'Sua presença é uma ferramenta clínica. Preserve-a.',
  'O intervalo também faz parte do cuidado.',
  'Reconheça o que foi possível fazer hoje.',
  'Escutar tantas histórias pede delicadeza com a sua própria.',
  'Organização é uma forma silenciosa de acolhimento.',
  'Respirar antes de responder também é presença.',
];

type CareState = {
  period: 'Olá' | 'Bom dia' | 'Boa tarde' | 'Boa noite';
  intention: string;
  accent: string;
  subtitle: string;
  reminderTitle: string;
  reminderBody: string;
  whisper: string;
};

const initialState: CareState = {
  period: 'Olá', intention: 'Presença', accent: 'Respire.',
  subtitle: subtitles[0], reminderTitle: reminders[0][0], reminderBody: reminders[0][1], whisper: whispers[0],
};

function selectCareMessage(date: Date): CareState {
  const dayKey = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const momentKey = dayKey * 6 + Math.floor(date.getHours() / 4);
  const hour = date.getHours();
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const reminder = reminders[momentKey % reminders.length];
  return {
    period,
    intention: intentions[dayKey % intentions.length],
    accent: accents[dayKey % accents.length],
    subtitle: subtitles[dayKey % subtitles.length],
    reminderTitle: reminder[0],
    reminderBody: reminder[1],
    whisper: whispers[momentKey % whispers.length],
  };
}

export function useCareMessage() {
  const [message, setMessage] = useState<CareState>(initialState);

  useEffect(() => {
    const update = () => setMessage(selectCareMessage(new Date()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return message;
}
