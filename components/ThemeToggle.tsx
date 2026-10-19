"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ORDER = ["system", "light", "dark"] as const;
const LABEL = { system: "Match system theme", light: "Light theme", dark: "Dark theme" };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface text-muted hover:border-accent hover:text-ink"
      aria-label={`${LABEL[current]}. Switch to ${LABEL[next].toLowerCase()}.`}
      title={LABEL[current]}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
