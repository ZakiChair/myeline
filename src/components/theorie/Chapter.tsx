// Enveloppe d'un chapitre du parcours : ancre de scroll-spy, eyebrow, titre, et
// encadré « En une phrase » (TL;DR accessible) avant le corps.

export function Chapter({
  id, eyebrow, title, enUnePhrase, children,
}: {
  id: string; eyebrow: string; title: string; enUnePhrase: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-10 mt-14">
      <p className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: "var(--a1)" }}>
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-2xl leading-tight text-white sm:text-3xl">{title}</h2>
      <p
        className="mt-4 rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 py-3 text-[14px] leading-relaxed text-white/80"
        style={{ borderLeftColor: "var(--a1)", borderLeftWidth: 2 }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--a1)" }}>
          En une phrase ·{" "}
        </span>
        {enUnePhrase}
      </p>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white/70">{children}</div>
    </section>
  );
}
