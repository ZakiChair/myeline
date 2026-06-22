"use client";
import { ACTES } from "@/lib/theory-nav";

export function TheoryNav({ activeId, progress }: { activeId: string | null; progress: number }) {
  return (
    <aside className="hidden lg:block sticky top-16 h-fit w-56 shrink-0 self-start">
      <nav className="border-l border-white/10 pl-4 text-[13px]">
        {ACTES.map((acte) => (
          <div key={acte.id} className="mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{acte.label}</p>
            <ul className="mt-1 space-y-0.5">
              {acte.chapitres.map((ch) => {
                const actif = ch.id === activeId;
                return (
                  <li key={ch.id}>
                    <a href={`#${ch.id}`}
                       className="block rounded px-2 py-0.5 transition"
                       style={actif
                         ? { color: "var(--a1)", background: "rgba(255,255,255,0.05)" }
                         : { color: "rgba(255,255,255,0.55)" }}>
                      {ch.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width]"
               style={{ width: `${Math.round(progress * 100)}%`, background: "var(--a1)" }} />
        </div>
      </nav>
    </aside>
  );
}
