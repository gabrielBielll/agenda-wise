"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";
  const nextTheme = dark ? "claro" : "escuro";

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "default" : "icon"}
      className={cn("relative", className)}
      disabled={!mounted}
      aria-label={`Ativar modo ${nextTheme}`}
      title={`Ativar modo ${nextTheme}`}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <span className="relative grid h-5 w-5 place-items-center">
        <Sun className="absolute h-[1.15rem] w-[1.15rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.15rem] w-[1.15rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      {showLabel && <span>{dark ? "Modo escuro" : "Modo claro"}</span>}
    </Button>
  );
}
