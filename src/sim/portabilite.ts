// Empreinte de l'état complet d'un organisme, pour comparer deux moteurs JavaScript.
//
// POURQUOI. Le projet écrivait « reproductible au bit près pour une graine donnée » parmi les
// acquis du lot 1. Mesuré le 2026-07-30 : c'est vrai DANS UNE SESSION, faux comme propriété du
// modèle. Le réseau seul est bit-identique entre V8 et JSC à n = 50 000 sur 400 000 ticks, mais
// l'organisme complet divergeait dès le tick ≈ 17 942, avec un écart final de 89,6 unités dans
// une arène de demi-côté 80. La cause était la géométrie du monde, traitée au lot 0.
//
// L'empreinte porte sur les BITS des tableaux typés, pas sur des valeurs arrondies : c'est le
// seul niveau où « reproductible au bit près » veut dire quelque chose. Une comparaison à
// quelques décimales près masquerait exactement la divergence qu'on cherche.

import type { Organism } from "./organism";

/** FNV-1a. `Math.imul` est en arithmétique entière 32 bits, donc exact sur tout moteur. */
function fnv(h: number, octets: Uint8Array): number {
  for (let i = 0; i < octets.length; i++) h = Math.imul(h ^ octets[i], 0x01000193);
  return h >>> 0;
}

const bits = (a: Float32Array | Int32Array | Uint8Array) =>
  new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/**
 * Empreinte de l'organisme : les poids, l'état du neurone, l'éligibilité, la position et les
 * compteurs d'événements.
 *
 * Les compteurs sont rendus EN CLAIR à côté du condensé : quand la porte échoue, savoir que
 * `ateFood` diffère de 3 oriente le diagnostic bien mieux qu'un hachage différent, qui dit
 * seulement « quelque chose, quelque part ».
 */
export function empreinteOrganisme(org: Organism): string {
  let h = 0x811c9dc5;
  h = fnv(h, bits(org.brain.topo.w));
  h = fnv(h, bits(org.brain.lif.v));
  h = fnv(h, bits(org.brain.lif.thr));
  h = fnv(h, bits(org.brain.lif.spikeTotal));
  h = fnv(h, bits(org.brain.plast.elig));
  // Le monde en DOUBLE précision : ce sont ses flottants qui divergeaient entre moteurs, et les
  // arrondir en f32 ici absorberait justement l'écart qu'on veut détecter.
  const monde = new Float64Array([
    org.world.x,
    org.world.y,
    org.world.hx,
    org.world.hy,
    org.world.energy,
  ]);
  h = fnv(h, new Uint8Array(monde.buffer));
  const compteurs = `${org.world.ateFood}/${org.world.ateToxin}/${org.world.hits}/${org.world.deaths}`;
  return `${h.toString(16).padStart(8, "0")}:${compteurs}`;
}
