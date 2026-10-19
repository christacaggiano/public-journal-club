import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Brand() {
  return (
    <Link href="/" className="whitespace-nowrap font-display text-[1.05rem] font-semibold tracking-[0.01em]">
      Public <span className="text-accent">Journal Club</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Brand />
        <ThemeToggle />
      </div>
    </header>
  );
}
