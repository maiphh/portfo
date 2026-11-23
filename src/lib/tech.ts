/**
 * Tech-stack marks for How it works, from tandpfun/skill-icons (MIT).
 * SVGs live in public/icons/skills (dark theme). Keys match case-study `icons` fields;
 * names without a file are omitted from the logo-only row.
 */
export const skillIconFiles = {
  nextjs: "NextJS-Dark.svg",
  fastapi: "FastAPI.svg",
  postgresql: "PostgreSQL-Dark.svg",
  python: "Python-Dark.svg",
  microsoft: "Azure-Dark.svg",
  typescript: "TypeScript.svg",
  react: "React-Dark.svg",
  tailwindcss: "TailwindCSS-Dark.svg",
  vitest: "Vitest-Dark.svg",
  html: "HTML.svg",
  css: "CSS.svg",
  javascript: "JavaScript.svg",
  github: "Github-Dark.svg",
  cloudflare: "Cloudflare-Dark.svg",
  sqlite: "SQLite.svg",
  dynamodb: "DynamoDB-Dark.svg",
  s3: "AWS-Dark.svg",
  athena: "AWS-Dark.svg",
  eventbridge: "AWS-Dark.svg",
  lambda: "AWS-Dark.svg",
  apigateway: "AWS-Dark.svg",
  beanstalk: "AWS-Dark.svg",
  cloudformation: "AWS-Dark.svg",
  /** No skill-icons mark yet — hidden in the logo row. */
  drizzle: null,
  neon: null,
  qwen: null,
  pydantic: null,
  cloudinary: null,
  swr: null,
} as const satisfies Record<string, string | null>;

export type TechLogoName = keyof typeof skillIconFiles;

export type SkillMark = {
  /** Stable id for the rendered tile (deduped by file). */
  id: string;
  /** Accessible name. */
  label: string;
  /** Path under /icons/skills/. */
  src: string;
};

const labels: Record<TechLogoName, string> = {
  nextjs: "Next.js",
  fastapi: "FastAPI",
  postgresql: "PostgreSQL",
  python: "Python",
  microsoft: "Microsoft Azure",
  typescript: "TypeScript",
  react: "React",
  tailwindcss: "Tailwind CSS",
  vitest: "Vitest",
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
  github: "GitHub",
  cloudflare: "Cloudflare",
  sqlite: "SQLite",
  dynamodb: "DynamoDB",
  s3: "AWS",
  athena: "AWS",
  eventbridge: "AWS",
  lambda: "AWS",
  apigateway: "AWS",
  beanstalk: "AWS",
  cloudformation: "AWS",
  drizzle: "Drizzle",
  neon: "Neon",
  qwen: "Qwen",
  pydantic: "Pydantic",
  cloudinary: "Cloudinary",
  swr: "SWR",
};

/** Resolve a case-study icon key to a skill-icons mark, or null if unsupported. */
export function skillMark(name: TechLogoName): SkillMark | null {
  const file = skillIconFiles[name];
  if (!file) return null;
  return {
    id: file.replace(/\.svg$/i, "").toLowerCase(),
    label: labels[name],
    src: `/icons/skills/${file}`,
  };
}

/**
 * Flatten stack item icons into a logo-only row: drop unsupported marks and
 * dedupe by file so AWS services don't repeat the same tile.
 */
export function skillMarksFor(icons: TechLogoName[] = []): SkillMark[] {
  const seen = new Set<string>();
  const out: SkillMark[] = [];
  for (const name of icons) {
    const mark = skillMark(name);
    if (!mark || seen.has(mark.id)) continue;
    seen.add(mark.id);
    out.push(mark);
  }
  return out;
}
