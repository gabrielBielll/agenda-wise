'use client';

import { Sparkles } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCareMessage } from '@/hooks/use-care-message';

export function DailyCareGreeting({ name }: { name?: string } = {}) {
  const { data: session } = useSession();
  const care = useCareMessage();
  const firstName = (name || session?.user?.name)?.trim().split(/\s+/)[0];

  return (
    <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground"><span className="h-px w-6 bg-accent" /> Seu dia, com leveza</p>
        <h2 className="page-title">{care.period}{firstName ? `, ${firstName}` : ''}. <em className="font-normal text-accent">{care.accent}</em></h2>
        <p className="page-subtitle">{care.subtitle}</p>
      </div>
      <div className="flex min-h-12 items-center gap-2.5 self-start rounded-[15px] border border-secondary/40 bg-card/45 px-4 py-2 text-secondary shadow-sm md:self-auto">
        <Sparkles className="h-4 w-4" /><span className="text-[11px] text-muted-foreground">Intenção do dia</span><strong className="border-l pl-2 font-headline text-lg font-normal italic text-foreground">{care.intention}</strong>
      </div>
    </section>
  );
}

export function CareWhisper() {
  const care = useCareMessage();
  return <p className="mt-3 border-l-2 border-accent/45 pl-3 font-headline text-sm italic leading-relaxed text-muted-foreground">{care.whisper}</p>;
}
