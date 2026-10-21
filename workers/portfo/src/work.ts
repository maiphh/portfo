import workJson from "../data/work.json";

export interface WorkRef {
  slug: string;
  title: string;
  href: string;
}

export const workList: readonly WorkRef[] = workJson as WorkRef[];

export const knownSlugs: ReadonlySet<string> = new Set(workList.map((w) => w.slug));
