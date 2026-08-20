"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const escuro = mounted && resolvedTheme === "dark";
  const proximoTema = escuro ? "claro" : "escuro";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative"
      disabled={!mounted}
      aria-label={`Ativar modo ${proximoTema}`}
      title={`Ativar modo ${proximoTema}`}
      onClick={() => setTheme(escuro ? "light" : "dark")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
