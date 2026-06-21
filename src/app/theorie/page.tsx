"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { ExcitableStrip } from "@/components/ExcitableStrip";
import { PropagationDemo } from "@/components/PropagationDemo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

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

function Term({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--a1)" }}>{children}</span>;
}

export default function TheoriePage() {
  const { themeId, setThemeId, theme } = useTheme();

  return (
    <div
      data-theme={themeId}
      style={theme.vars as React.CSSProperties}
      className="myeline-bg min-h-screen text-white"
    >
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
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
            Le cerveau n'est pas un circuit figé. C'est un{" "}
            <Term>milieu excitable</Term> qui se câble lui-même : l'activité y
            façonne la matière, et la matière y propage l'activité. Myéline simule
            cette double boucle — et la maintient là où le vivant opère le mieux,
            à la frontière entre le silence et la tempête.
          </p>

          <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-3 backdrop-blur-sm">
            <ExcitableStrip
              excited={theme.canvas.excited}
              refractory={theme.canvas.refractory}
              rest={theme.canvas.rest}
            />
          </div>
          <p className="mt-2 text-center font-mono text-[11px] text-white/40">
            ligne excitable — repos · décharge · réfractaire : une onde naît, se
            propage, puis s'éteint, comme un potentiel d'action le long d'un axone.
          </p>
        </header>

        <Section eyebrow="le substrat" title="Du Jeu de la Vie au graphe vivant">
          <p>
            Le <Term>Jeu de la Vie</Term> de Conway (1970) a montré qu'une poignée
            de règles locales sur une grille suffit à engendrer une complexité sans
            fin. Myéline déplace ces règles d'une grille rigide vers un{" "}
            <Term>graphe</Term> : les neurones ne sont plus des cases voisines mais
            des nœuds reliés par des synapses, et le graphe lui-même évolue —
            naissances, morts, nouvelles liaisons.
          </p>
          <p>
            C'est le premier glissement décisif : la topologie n'est pas donnée une
            fois pour toutes, elle se développe. Le « matériel » est mou.
          </p>
        </Section>

        <Section
          eyebrow="l'activité"
          title="Un milieu excitable — Greenberg & Hastings"
        >
          <p>
            Chaque neurone suit trois états, empruntés au modèle de{" "}
            <Term>Greenberg–Hastings</Term> (1978), un automate cellulaire des
            milieux excitables (cœur, réactions chimiques, cortex) :
          </p>
          <ul className="space-y-1.5 pl-1">
            <li>
              <strong className="text-white/90">repos</strong> — décharge si une
              fraction <span className="font-mono">φ</span> de ses voisins est
              excitée, ou par étincelle spontanée ;
            </li>
            <li>
              <strong className="text-white/90">excité</strong> — il décharge, et
              propage l'activité à ses voisins ;
            </li>
            <li>
              <strong className="text-white/90">réfractaire</strong> — il se tait{" "}
              <span className="font-mono">R</span> instants, incapable de re-tirer.
            </li>
          </ul>
          <p>
            La période réfractaire est essentielle : sans elle, tout s'allume et
            reste allumé. Avec elle, l'activité <Term>se propage en ondes</Term> au
            lieu de saturer — exactement comme un front de dépolarisation ne peut
            repartir en arrière.
          </p>
        </Section>

        <Section
          eyebrow="l'itération"
          title="Un pas de temps, expliqué"
        >
          <p>
            La simulation avance par <Term>pas de temps discrets</Term> — des
            itérations, notées <span className="font-mono">t</span>. À chaque pas,
            tous les neurones décident <Term>simultanément</Term> de leur prochain
            état, à partir d'une photographie du réseau prise au début de
            l'itération. Personne ne joue avant l'autre : la mise à jour est
            synchrone, comme dans le Jeu de la Vie.
          </p>
          <p>
            La règle de propagation est purement <Term>locale</Term>. Un neurone au
            repos compte ses voisins excités ; si leur proportion atteint le seuil{" "}
            <span className="font-mono">φ</span>, il décharge à l'itération
            suivante, puis se verrouille en réfractaire pendant{" "}
            <span className="font-mono">R</span> pas. Le front ne peut donc
            qu'avancer, laissant derrière lui une traîne qui récupère.
          </p>
          <div
            className="rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 py-3 font-mono text-[13px] text-white/75"
            style={{ borderLeftColor: "var(--a1)", borderLeftWidth: 2 }}
          >
            <span style={{ color: "var(--a1)" }}>Exemple.</span> Un neurone à 5
            connexions, seuil <span className="text-white">φ = 16 %</span> :
            il lui faut ⌈0,16 × 5⌉ ={" "}
            <span className="text-white">1 voisin excité</span> pour s'allumer.
            Un seul suffit à propager le front d'un cran.
          </div>
          <p>
            Avancez pas à pas ci-dessous : à chaque itération, le front gagne une
            couronne, et la traîne réfractaire l'empêche de refluer. Sur la grille
            régulière de cette démo, le front dessine une onde nette ; sur le graphe
            irrégulier du simulateur, la même règle engendre des avalanches.
          </p>
          <PropagationDemo
            excited={theme.canvas.excited}
            refractory={theme.canvas.refractory}
            rest={theme.canvas.rest}
            accent={theme.canvas.excited}
          />
        </Section>

        <Section
          eyebrow="la criticité"
          title="Des avalanches au bord du chaos"
        >
          <p>
            Sur un graphe irrégulier, ces ondes ne forment pas des cercles
            parfaits : elles déclenchent des <Term>avalanches</Term> — des cascades
            d'activité de toutes tailles. Beggs & Plenz ont montré en 2003 que le
            cortex réel produit exactement ces avalanches, distribuées en loi de
            puissance.
          </p>
          <blockquote
            className="border-l-2 pl-4 font-serif text-lg italic text-white/80"
            style={{ borderColor: "var(--a1)" }}
          >
            Le réseau opère le mieux quand chaque décharge en déclenche en moyenne
            une autre — un ratio de branchement σ ≈ 1.
          </blockquote>
          <p>
            En deçà (σ &lt; 1), l'activité s'éteint ; au-delà (σ &gt; 1), elle
            explose. Entre les deux se trouve la <Term>criticité</Term> : le régime
            « avalanches » que vous lisez dans le panneau de droite, là où
            l'information se propage le plus loin sans se perdre.
          </p>
        </Section>

        <Section
          eyebrow="la plasticité"
          title="« Fire together, wire together » — Hebb"
        >
          <p>
            En 1949, Donald Hebb formule le principe qui porte son nom :{" "}
            <em>les neurones qui déchargent ensemble se câblent ensemble</em>.
            Myéline l'applique littéralement : une synapse dont les deux extrémités
            sont co-excitées se <Term>renforce</Term> ; celle qui ne sert jamais
            s'affaiblit puis disparaît.
          </p>
          <p>
            De là, deux forces sculptent le graphe : la{" "}
            <Term>synaptogenèse</Term> tisse de nouvelles liaisons entre voisins
            corrélés, et l'<Term>élagage</Term> retire les synapses muettes —{" "}
            <span className="italic">use it or lose it</span>. La fonction dessine
            la structure.
          </p>
        </Section>

        <Section
          eyebrow="le développement"
          title="Une activité qui se construit elle-même"
        >
          <p>
            Le cerveau en formation n'attend pas le monde : il génère sa propre
            activité. Les <Term>vagues spontanées</Term> de la rétine, avant même
            l'ouverture des yeux, organisent le câblage visuel. C'est le rôle de
            l'étincelle spontanée dans Myéline — semer des avalanches qui guident la
            croissance.
          </p>
          <p>
            Deux horloges coexistent donc : l'<Term>activité</Term>, rapide, à
            chaque instant ; le <Term>développement</Term>, lent — les neurones
            durablement silencieux meurent (apoptose), les hubs très actifs se
            dupliquent. Le degré reste borné, faute de quoi tout deviendrait une
            pelote. Le tissu se remodèle au rythme de ce qu'il vit.
          </p>
        </Section>

        <Section
          eyebrow="la correspondance"
          title="Des curseurs à la biologie"
        >
          <p>Chaque réglage de l'interface a un sens neuroscientifique :</p>
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
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--a1)" }}>
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
            <li>S. Ramón y Cajal — <em>Textura del sistema nervioso</em> (1899)</li>
            <li>J. H. Conway — <em>Game of Life</em> (1970)</li>
            <li>
              J. M. Greenberg & S. P. Hastings — <em>Spatial patterns for discrete
              models of diffusion in excitable media</em> (1978)
            </li>
            <li>D. O. Hebb — <em>The Organization of Behavior</em> (1949)</li>
            <li>
              J. M. Beggs & D. Plenz — <em>Neuronal avalanches in neocortical
              circuits</em>, J. Neurosci. (2003)
            </li>
          </ul>
        </Section>

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
  );
}
