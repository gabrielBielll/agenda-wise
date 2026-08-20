import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  backHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
}) {
  return (
    <section className="flex items-start gap-3 sm:gap-4">
      <Button variant="outline" size="icon" asChild className="mt-0.5 shrink-0">
        <Link href={backHref} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link>
      </Button>
      <div className="min-w-0">
        <p className="page-eyebrow mb-2">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
      </div>
    </section>
  );
}
