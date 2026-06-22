"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { ExcitableStrip } from "@/components/ExcitableStrip";
import { PropagationDemo } from "@/components/PropagationDemo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Chapter } from "@/components/theorie/Chapter";
import { TheoryNav } from "@/components/theorie/TheoryNav";
import { GlossaryTerm } from "@/components/theorie/Glossary";
import { ACTES, sectionLaPlusVisible } from "@/lib/theory-nav";

// Enveloppe légère pour les sections Acte V (correspondance, références) — conservées
// telles quelles pour Task 11. Ne pas supprimer.
function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 border-t border-white/[0.07] pt-10">
      <p
        className="font-mono text-[11px] tracking-[0.2em] uppercase"
        style={{ color: "var(--a1)" }}
      >
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-2xl leading-tight text-white sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white/70">
        {children}
      </div>
    </section>
  );
}

export default function TheoriePage() {
  const { themeId, setThemeId, theme } = useTheme();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const ratios = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const ids = ACTES.flatMap((a) => a.chapitres.map((c) => c.id));
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.current.set(e.target.id, e.intersectionRatio);
        setActiveId(
          sectionLaPlusVisible(
            [...ratios.current].map(([id, ratio]) => ({ id, ratio })),
          ),
        );
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-10% 0px -55% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });

    const onScroll = () => {
      const h = document.documentElement;
      setProgress(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      data-theme={themeId}
      style={theme.vars as React.CSSProperties}
      className="myeline-bg min-h-screen text-white"
    >
      <div className="mx-auto flex max-w-5xl gap-10 px-6 py-10 sm:py-16">
        <TheoryNav activeId={activeId} progress={progress} />

        <div className="min-w-0 max-w-3xl flex-1">
          {/* Barre haut : retour + ThemeSwitcher */}
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft size={14} />
              Retour à la simulation
            </Link>
            <ThemeSwitcher themeId={themeId} onThemeChange={setThemeId} />
          </div>

          {/* Hero — la thèse */}
          <header className="mt-12">
            <p
              className="font-mono text-[11px] tracking-[0.2em] uppercase"
              style={{ color: "var(--a1)" }}
            >
              Myéline · fondements
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-[1.05] text-white sm:text-6xl">
              Un cerveau{" "}
              <em className="italic" style={{ color: "var(--a1)" }}>
                au bord du chaos
              </em>
              .
            </h1>
            <p className="mt-6 max-w-2xl font-serif text-lg leading-relaxed text-white/75 sm:text-xl">
              Le cerveau n&apos;est pas un circuit figé. C&apos;est un{" "}
              <span style={{ color: "var(--a1)" }}>milieu excitable</span> qui
              se câble lui-même : l&apos;activité y façonne la matière, et la
              matière y propage l&apos;activité. Myéline simule cette double
              boucle — et la maintient là où le vivant opère le mieux, à la
              frontière entre le silence et la tempête.
            </p>

            <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-3 backdrop-blur-sm">
              <ExcitableStrip
                excited={theme.canvas.excited}
                refractory={theme.canvas.refractory}
                rest={theme.canvas.rest}
              />
            </div>
            <p className="mt-2 text-center font-mono text-[11px] text-white/40">
              ligne excitable — repos · décharge · réfractaire : une onde naît,
              se propage, puis s&apos;éteint, comme un potentiel d&apos;action
              le long d&apos;un axone.
            </p>
          </header>

          {/* ═══════════════════════════════════════════════════════════
              ACTE I · Le substrat
              ═══════════════════════════════════════════════════════════ */}

          <Chapter
            id="graphe"
            eyebrow="le substrat · acte I"
            title="Du Jeu de la Vie au graphe vivant"
            enUnePhrase="Des règles locales simples sur un graphe qui se recâble suffisent à engendrer une complexité sans fin."
          >
            <p>
              Le <span style={{ color: "var(--a1)" }}>Jeu de la Vie</span> de
              Conway (1970) a montré qu&apos;une poignée de règles locales sur
              une grille suffit à engendrer une complexité sans fin. Myéline
              déplace ces règles d&apos;une grille rigide vers un{" "}
              <span style={{ color: "var(--a1)" }}>graphe</span> : les neurones
              ne sont plus des cases voisines mais des nœuds reliés par des
              synapses, et le graphe lui-même évolue — naissances, morts,
              nouvelles liaisons.
            </p>
            <p>
              C&apos;est le premier glissement décisif : la topologie n&apos;est
              pas donnée une fois pour toutes, elle se développe. Le «
              matériel » est mou.
            </p>
            {/* Analogie : ville qui se recâble */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              Imaginez une ville dont les rues naissent et disparaissent selon
              les trajets empruntés : ce n&apos;est pas le plan qui dicte les
              routes, ce sont les routes qui dessinent le plan.
            </p>
          </Chapter>

          <Chapter
            id="excitable"
            eyebrow="l'activité · acte I"
            title="Un milieu excitable — Greenberg & Hastings"
            enUnePhrase="Trois états (repos, excité, réfractaire) font naître des ondes au lieu d'une saturation — comme la ola dans un stade."
          >
            <p>
              Chaque neurone suit trois états, empruntés au modèle de{" "}
              <span style={{ color: "var(--a1)" }}>Greenberg–Hastings</span>{" "}
              (1978), un automate cellulaire des milieux excitables (cœur,
              réactions chimiques, cortex) :
            </p>
            <ul className="space-y-1.5 pl-1">
              <li>
                <strong className="text-white/90">repos</strong> — décharge si
                une fraction <span className="font-mono">φ</span> de ses
                voisins est excitée, ou par étincelle spontanée ;
              </li>
              <li>
                <strong className="text-white/90">excité</strong> — il
                décharge, et propage l&apos;activité à ses voisins ;
              </li>
              <li>
                <strong className="text-white/90">réfractaire</strong> — il se
                tait <span className="font-mono">R</span> instants, incapable
                de re-tirer.
              </li>
            </ul>
            {/* Analogie : stade / ola */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              Pensez à la ola dans un stade : chaque spectateur se lève quand
              ses voisins immédiats se lèvent, puis s&apos;assoit et attend
              avant de pouvoir se relever. Sans cette pause, tout le stade
              resterait debout en permanence — il n&apos;y aurait plus d&apos;onde,
              seulement du bruit.
            </p>
            <p>
              La période réfractaire est essentielle : sans elle, tout
              s&apos;allume et reste allumé. Avec elle, l&apos;activité{" "}
              <span style={{ color: "var(--a1)" }}>se propage en ondes</span>{" "}
              au lieu de saturer — exactement comme un front de dépolarisation
              ne peut repartir en arrière.
            </p>
          </Chapter>

          <Chapter
            id="pas-de-temps"
            eyebrow="l'itération · acte I"
            title="Un pas de temps, expliqué"
            enUnePhrase="À chaque tick, tous les neurones décident en même temps selon une règle purement locale."
          >
            <p>
              La simulation avance par{" "}
              <span style={{ color: "var(--a1)" }}>pas de temps discrets</span>{" "}
              — des itérations, notées{" "}
              <span className="font-mono">t</span>. À chaque pas, tous les
              neurones décident{" "}
              <span style={{ color: "var(--a1)" }}>simultanément</span> de leur
              prochain état, à partir d&apos;une photographie du réseau prise
              au début de l&apos;itération. Personne ne joue avant l&apos;autre
              : la mise à jour est synchrone, comme dans le Jeu de la Vie.
            </p>
            {/* Analogie : tout le monde joue en même temps */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              C&apos;est comme une partie de jeu de société où tout le monde
              annonce son coup en même temps, en se basant sur le plateau tel
              qu&apos;il était au début du tour. Personne ne réagit à la
              décision d&apos;un autre : on lit l&apos;état passé, on écrit
              l&apos;état futur.
            </p>
            <p>
              La règle de propagation est purement{" "}
              <span style={{ color: "var(--a1)" }}>locale</span>. Un neurone au
              repos compte ses voisins excités ; si leur proportion atteint le
              seuil <span className="font-mono">φ</span>, il décharge à
              l&apos;itération suivante, puis se verrouille en réfractaire
              pendant <span className="font-mono">R</span> pas. Le front ne
              peut donc qu&apos;avancer, laissant derrière lui une traîne qui
              récupère.
            </p>
            <div
              className="rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 py-3 font-mono text-[13px] text-white/75"
              style={{ borderLeftColor: "var(--a1)", borderLeftWidth: 2 }}
            >
              <span style={{ color: "var(--a1)" }}>Exemple.</span> Un neurone à
              5 connexions, seuil{" "}
              <span className="text-white">φ = 16 %</span> : il lui faut
              ⌈0,16 × 5⌉ ={" "}
              <span className="text-white">1 voisin excité</span> pour
              s&apos;allumer. Un seul suffit à propager le front d&apos;un
              cran.
            </div>
            <p>
              Avancez pas à pas ci-dessous : à chaque itération, le front gagne
              une couronne, et la traîne réfractaire l&apos;empêche de refluer.
              Sur la grille régulière de cette démo, le front dessine une onde
              nette ; sur le graphe irrégulier du simulateur, la même règle
              engendre des avalanches.
            </p>
            <PropagationDemo
              excited={theme.canvas.excited}
              refractory={theme.canvas.refractory}
              rest={theme.canvas.rest}
              accent={theme.canvas.excited}
            />
          </Chapter>

          {/* ═══════════════════════════════════════════════════════════
              ACTE II · La vie du réseau
              ═══════════════════════════════════════════════════════════ */}

          <Chapter
            id="criticite"
            eyebrow="la criticité · acte II"
            title="Des avalanches au bord du chaos"
            enUnePhrase="Le réseau transmet le mieux l'information quand chaque décharge en déclenche à peu près une autre (σ ≈ 1)."
          >
            <p>
              Sur un graphe irrégulier, ces ondes ne forment pas des cercles
              parfaits : elles déclenchent des{" "}
              <GlossaryTerm termeId="criticite">avalanches</GlossaryTerm> —
              des cascades d&apos;activité de toutes tailles. Beggs &amp; Plenz
              ont montré en 2003 que le cortex réel produit exactement ces
              avalanches, distribuées en loi de puissance.
            </p>
            {/* Analogie : dominos / feu de forêt */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              Imaginez une rangée de dominos : trop serrés, la chute d&apos;un
              seul embrase tout ; trop espacés, rien ne se propage. La
              criticité, c&apos;est l&apos;espacement idéal où une chute peut
              se propager loin sans tout emporter. Dans un feu de forêt, le
              régime critique sépare les braises isolées de l&apos;incendie
              total.
            </p>
            <blockquote
              className="border-l-2 pl-4 font-serif text-lg italic text-white/80"
              style={{ borderColor: "var(--a1)" }}
            >
              Le réseau opère le mieux quand chaque décharge en déclenche en
              moyenne une autre — un ratio de branchement σ ≈ 1.
            </blockquote>
            <p>
              En deçà (σ &lt; 1), l&apos;activité s&apos;éteint ; au-delà
              (σ &gt; 1), elle explose. Entre les deux se trouve la{" "}
              <GlossaryTerm termeId="criticite">criticité</GlossaryTerm> : le
              régime « avalanches » que vous lisez dans le panneau de droite,
              là où l&apos;information se propage le plus loin sans se perdre.
            </p>
            <p className="text-white/50 text-[13px] font-mono">
              Note : σ est ici un indicateur illustratif — une approximation
              pédagogique du ratio de branchement, non une mesure
              neurophysiologique exacte.
            </p>
          </Chapter>

          <Chapter
            id="hebb"
            eyebrow="la plasticité · acte II"
            title="« Fire together, wire together » — Hebb"
            enUnePhrase="Les synapses co-actives se renforcent, les muettes disparaissent : la fonction sculpte la structure."
          >
            <p>
              En 1949, Donald{" "}
              <GlossaryTerm termeId="hebb">Hebb</GlossaryTerm> formule le
              principe qui porte son nom :{" "}
              <em>
                les neurones qui déchargent ensemble se câblent ensemble
              </em>
              . Myéline l&apos;applique littéralement : une synapse dont les
              deux extrémités sont co-excitées se{" "}
              <span style={{ color: "var(--a1)" }}>renforce</span> ; celle qui
              ne sert jamais s&apos;affaiblit puis disparaît.
            </p>
            {/* Analogie : sentier dans l'herbe */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              Comme un sentier dans l&apos;herbe : plus les gens empruntent le
              même chemin, plus il se marque ; les chemins délaissés
              disparaissent sous la végétation. L&apos;usage crée la structure,
              l&apos;abandon l&apos;efface.
            </p>
            <p>
              De là, deux forces sculptent le graphe : la{" "}
              <span style={{ color: "var(--a1)" }}>synaptogenèse</span> tisse
              de nouvelles liaisons entre voisins corrélés, et
              l&apos;<span style={{ color: "var(--a1)" }}>élagage</span> retire
              les synapses muettes —{" "}
              <span className="italic">use it or lose it</span>. La fonction
              dessine la structure.
            </p>
          </Chapter>

          <Chapter
            id="developpement"
            eyebrow="le développement · acte II"
            title="Une activité qui se construit elle-même"
            enUnePhrase="Deux horloges : l'activité (rapide) et le développement (lent) qui fait naître et mourir les neurones."
          >
            <p>
              Le cerveau en formation n&apos;attend pas le monde : il génère sa
              propre activité. Les{" "}
              <span style={{ color: "var(--a1)" }}>vagues spontanées</span> de
              la rétine, avant même l&apos;ouverture des yeux, organisent le
              câblage visuel. C&apos;est le rôle de l&apos;étincelle spontanée
              dans Myéline — semer des avalanches qui guident la croissance.
            </p>
            {/* Analogie : vagues rétiniennes */}
            <p className="rounded-lg bg-white/[0.03] px-4 py-3 font-serif italic text-white/60">
              Avant même de voir quoi que ce soit, l&apos;œil du fœtus envoie
              des vagues d&apos;activité spontanée vers le cortex visuel —
              comme s&apos;il répétait la partition avant le concert. Ces
              « répétitions » à l&apos;aveugle câblent la carte visuelle sans
              avoir jamais vu une image.
            </p>
            <p>
              Deux horloges coexistent donc : l&apos;
              <span style={{ color: "var(--a1)" }}>activité</span>, rapide, à
              chaque instant ; le{" "}
              <span style={{ color: "var(--a1)" }}>développement</span>, lent
              — les neurones durablement silencieux meurent (apoptose), les
              hubs très actifs se dupliquent. Le degré reste borné, faute de
              quoi tout deviendrait une pelote. Le tissu se remodèle au rythme
              de ce qu&apos;il vit.
            </p>
          </Chapter>

          {/* ═══════════════════════════════════════════════════════════
              ACTES III–V — ancrages réservés (Tasks 10, 11)
              Ne pas développer ici. Section est conservée pour Task 11.
              ═══════════════════════════════════════════════════════════ */}

          {/* === Acte V conservé pour Task 11 — ne pas supprimer === */}
          <Section eyebrow="la correspondance" title="Des curseurs à la biologie">
            <p>Chaque réglage de l&apos;interface a un sens neuroscientifique :</p>
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <table className="w-full font-mono text-[12.5px]">
                <thead>
                  <tr className="bg-white/[0.03] text-left text-white/50">
                    <th className="px-3 py-2 font-medium">Curseur</th>
                    <th className="px-3 py-2 font-medium">Analogue biologique</th>
                  </tr>
                </thead>
                <tbody className="text-white/70">
                  {[
                    ["Seuil φ", "seuil du potentiel d'action / sommation des entrées"],
                    ["Réfractaire R", "période réfractaire post-décharge"],
                    ["Étincelle p", "activité spontanée · vagues rétiniennes"],
                    ["Plasticité Hebb", "potentialisation à long terme (LTP / STDP)"],
                    ["Synaptogenèse q", "croissance dendritique et formation de synapses"],
                    ["Degré maximum", "borne métabolique du nombre de connexions"],
                    ["Survie / naissance", "apoptose des silencieux / neurogenèse des actifs"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-white/[0.06]">
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        style={{ color: "var(--a1)" }}
                      >
                        {k}
                      </td>
                      <td className="px-3 py-2">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section eyebrow="pour aller plus loin" title="Références">
            <ul className="space-y-2 font-serif text-[15px] text-white/65">
              <li>
                S. Ramón y Cajal —{" "}
                <em>Textura del sistema nervioso</em> (1899)
              </li>
              <li>J. H. Conway — <em>Game of Life</em> (1970)</li>
              <li>
                J. M. Greenberg &amp; S. P. Hastings —{" "}
                <em>
                  Spatial patterns for discrete models of diffusion in excitable
                  media
                </em>{" "}
                (1978)
              </li>
              <li>
                D. O. Hebb —{" "}
                <em>The Organization of Behavior</em> (1949)
              </li>
              <li>
                J. M. Beggs &amp; D. Plenz —{" "}
                <em>
                  Neuronal avalanches in neocortical circuits
                </em>
                , J. Neurosci. (2003)
              </li>
            </ul>
          </Section>
          {/* === Fin Acte V conservé pour Task 11 === */}

          <footer className="mt-16 border-t border-white/[0.07] pt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
              style={{ color: "var(--a1)" }}
            >
              <ArrowLeft size={15} />
              Revenir observer le réseau
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
