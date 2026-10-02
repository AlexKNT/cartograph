"use client";

import { useState } from "react";
import { applyTheme, THEMES, type Theme } from "@/lib/theme";

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeControl({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center overflow-hidden rounded border border-border"
    >
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          onClick={() => choose(option)}
          className={`px-1.5 py-0.5 text-[11px] leading-4 ${
            theme === option
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
