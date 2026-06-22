"use client";

import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Entrées du glossaire de la page Théorie
interface Entree {
  id: string;
  terme: string;
  definition: string;
}

export const GLOSSAIRE: Entree[] = [
  {
    id: "criticite",
    terme: "Criticité (σ ≈ 1)",
    definition:
      "Régime où chaque décharge en déclenche en moyenne une autre : l'information se propage le plus loin sans s'éteindre ni exploser.",
  },
  {
    id: "reservoir",
    terme: "Réservoir",
    definition:
      "Un réseau figé dont l'activité riche sert de mémoire ; seul un « lecteur » linéaire est entraîné.",
  },
  {
    id: "stdp",
    terme: "STDP",
    definition:
      "Plasticité dépendante de l'ordre des décharges : « avant→après » renforce le lien dans ce sens. Permet d'apprendre des séquences.",
  },
  {
    id: "eligibilite",
    terme: "Trace d'éligibilité",
    definition:
      "Marque temporaire laissée par une action, qui permet de la créditer quand la récompense arrive plus tard.",
  },
  {
    id: "hebb",
    terme: "Hebb",
    definition:
      "« Les neurones qui déchargent ensemble se câblent ensemble » : les synapses co-actives se renforcent.",
  },
  {
    id: "reinforce",
    terme: "REINFORCE",
    definition:
      "Règle d'apprentissage par récompense : on renforce les actions suivies d'une récompense supérieure à la moyenne.",
  },
  {
    id: "yoked",
    terme: "Témoin yoked",
    definition:
      "Un témoin qui reçoit exactement le même calendrier de récompenses, mais décorrélé de ses actions : il isole l'effet de la contingence.",
  },
];

/**
 * Terme inline cliquable : survol = définition courte, clic = ancre vers l'entrée du glossaire.
 * API tooltip réelle : TooltipTrigger accepte `render?: React.ReactElement` via BaseUIComponentProps.
 */
export function GlossaryTerm({
  termeId,
  children,
}: {
  termeId: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const entree = GLOSSAIRE.find((e) => e.id === termeId);

  const inner = (
    <a
      href={`#glossaire-${termeId}`}
      className="underline decoration-dotted underline-offset-2"
      style={{ color: "var(--a1)" }}
    >
      {children}
    </a>
  );

  if (!entree) return inner;

  return (
    <Tooltip>
      <TooltipTrigger render={inner} />
      <TooltipContent>{entree.definition}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Section glossaire listant toutes les entrées avec ancres pour la navigation interne.
 */
export function Glossary(): React.JSX.Element {
  return (
    <dl className="mt-4 space-y-3">
      {GLOSSAIRE.map((e) => (
        <div key={e.id} id={`glossaire-${e.id}`} className="scroll-mt-24">
          <dt className="font-serif" style={{ color: "var(--a1)" }}>
            {e.terme}
          </dt>
          <dd className="text-[15px] leading-relaxed text-white/70">
            {e.definition}
          </dd>
        </div>
      ))}
    </dl>
  );
}
