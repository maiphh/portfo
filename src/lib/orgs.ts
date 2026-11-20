/** Org marks shown on the CV timeline and hero roles. */
export const orgLogos = {
  garena: { src: "/orgs/garena.svg", name: "Garena" },
  talentnet: { src: "/orgs/talentnet.png", name: "Talentnet" },
  rmit: { src: "/orgs/rmit.png", name: "RMIT University" },
  ielts: { src: "/orgs/ielts.svg", name: "IELTS" },
} as const;

export type OrgKey = keyof typeof orgLogos;

/** Experience entry id → org mark. Neo League uses RMIT (the host). */
export const experienceOrg: Record<string, OrgKey> = {
  garena: "garena",
  talentnet: "talentnet",
  bit: "rmit",
  "rmit-master": "rmit",
  "neo-league": "rmit",
  ielts: "ielts",
};

export function logoForExperience(id: string) {
  const key = experienceOrg[id];
  return key ? orgLogos[key] : null;
}
