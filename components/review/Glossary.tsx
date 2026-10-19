"use client";

import * as Popover from "@radix-ui/react-popover";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { GlossaryEntry } from "./types";

type GlossaryApi = { regex: RegExp | null; lookup: (word: string) => GlossaryEntry | undefined };

const GlossaryContext = createContext<GlossaryApi>({ regex: null, lookup: () => undefined });

export function GlossaryProvider({ entries, children }: { entries: GlossaryEntry[]; children: ReactNode }) {
  const api = useMemo<GlossaryApi>(() => {
    const valid = entries.filter((g) => g.term.trim() && g.definition.trim());
    if (!valid.length) return { regex: null, lookup: () => undefined };
    const escaped = valid
      .map((g) => g.term.trim())
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const byTerm = new Map(valid.map((g) => [g.term.trim().toLowerCase(), g]));
    return {
      regex: new RegExp(`\\b(${escaped.join("|")})(s|es)?\\b`, "gi"),
      lookup: (word) => byTerm.get(word.toLowerCase()),
    };
  }, [entries]);
  return <GlossaryContext.Provider value={api}>{children}</GlossaryContext.Provider>;
}

function segment(text: string, api: GlossaryApi, used: Set<string>): ReactNode[] {
  const { regex, lookup } = api;
  if (!regex || !text) return [text];
  const parts: ReactNode[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const entry = lookup(m[1]);
    if (!entry || used.has(entry.term)) continue;
    used.add(entry.term);
    parts.push(text.slice(last, m.index));
    parts.push(
      <Term key={`${entry.term}-${m.index}`} entry={entry}>
        {m[0]}
      </Term>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/** Renders text with the first mention of each glossary term turned into a definition popover. */
export function Rich({ text }: { text: string }) {
  const api = useContext(GlossaryContext);
  return <>{segment(text, api, new Set())}</>;
}

/** Like Rich, but underlines each term only once across a group of texts (for example a list). */
export function RichGroup({ texts, children }: { texts: string[]; children: (nodes: ReactNode[], index: number) => ReactNode }) {
  const api = useContext(GlossaryContext);
  const used = new Set<string>();
  return <>{texts.map((t, i) => children(segment(t, api, used), i))}</>;
}

function Term({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const keepOpen = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="term"
          onMouseEnter={keepOpen}
          onMouseLeave={closeSoon}
          onFocus={keepOpen}
          onBlur={closeSoon}
          onClick={(e) => {
            // Open on tap (touch screens) without toggling closed after a hover opened it.
            e.preventDefault();
            e.stopPropagation();
            keepOpen();
          }}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={keepOpen}
          onMouseLeave={closeSoon}
          className="z-50 max-w-[min(320px,calc(100vw-32px))] rounded-md bg-ink px-3 py-2.5 text-[0.83rem] leading-snug text-bg shadow-lg"
        >
          <p className="mb-0.5 text-[0.7rem] font-semibold tracking-wider uppercase opacity-75">{entry.term}</p>
          {entry.definition}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
