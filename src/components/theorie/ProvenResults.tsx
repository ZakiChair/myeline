"use client";
import { PREUVES, OUVERTURES } from "@/lib/theorie-results";

export function ProvenResults() {
  return (
    <div className="mt-4 space-y-3">
      {PREUVES.map((p) => (
        <article key={p.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-white">{p.titre}</h3>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono"
                  style={{ background: "rgba(118,255,178,0.12)", color: "#76ffb2" }}>GO ✅</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {(p.barres ?? []).map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-40 shrink-0 text-white/55">{b.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full"
                        style={{ width: `${Math.max(2, b.value * 100)}%`,
                                 background: b.fort ? "var(--a1)" : "rgba(255,255,255,0.25)" }} />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-white/75">{b.caption}</span>
              </div>
            ))}
          </div>
          <dl className="mt-3 grid gap-1 text-[12.5px]">
            <div className="flex gap-2"><dt className="text-white/40 shrink-0">garanti</dt><dd className="text-white/75">{p.garanti}</dd></div>
            <div className="flex gap-2"><dt className="text-white/40 shrink-0">observé</dt><dd className="text-white/60">{p.observe}</dd></div>
          </dl>
          <p className="mt-2 font-mono text-[10.5px] text-white/30">{p.source} · {p.graines} graine{p.graines > 1 ? "s" : ""}</p>
        </article>
      ))}

      <article className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
        <h3 className="font-serif text-white">Ce qui reste ouvert</h3>
        <dl className="mt-2 space-y-2 text-[13px]">
          {OUVERTURES.map((o) => (
            <div key={o.id}>
              <dt className="text-white/85">{o.titre}</dt>
              <dd className="text-white/60">{o.detail}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}
