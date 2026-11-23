/** Org marks shown on the CV timeline, hero roles, and case-study heroes. */
export const orgLogos = {
  garena: { src: "/orgs/garena.svg", name: "Garena" },
  /** Official wordmark for case studies and Selected work. */
  talentnet: { src: "/orgs/talentnet.png", name: "Talentnet", wordmark: true as const },
  /** Short mark used only on the work-and-study timeline. */
  talentnetMark: { src: "/orgs/talentnet-mark.png", name: "Talentnet" },
  rmit: { src: "/orgs/rmit.png", name: "RMIT University" },
  ielts: { src: "/orgs/ielts.svg", name: "IELTS", wordmark: true as const },
} as const;

export type OrgKey = keyof typeof orgLogos;
export type OrgLogo = (typeof orgLogos)[OrgKey];

/** Experience entry id → org mark. Neo League uses RMIT (the host). */
export const experienceOrg: Record<string, OrgKey> = {
  garena: "garena",
  talentnet: "talentnetMark",
  bit: "rmit",
  "rmit-master": "rmit",
  "neo-league": "rmit",
  ielts: "ielts",
};

/** Work entry `org` string → org mark. Personal / charity projects have none. */
export const workOrgName: Record<string, OrgKey> = {
  Talentnet: "talentnet",
  "Garena Free Fire": "garena",
};

export function logoForExperience(id: string): OrgLogo | null {
  const key = experienceOrg[id];
  return key ? orgLogos[key] : null;
}

export function logoForWorkOrg(org: string): OrgLogo | null {
  const key = workOrgName[org];
  return key ? orgLogos[key] : null;
}

export function isWordmark(logo: OrgLogo): boolean {
  return "wordmark" in logo && logo.wordmark === true;
}
