import { getCollection, type CollectionEntry } from "astro:content";

export async function getWork(): Promise<CollectionEntry<"work">[]> {
  return (await getCollection("work")).sort((a, b) => a.data.order - b.data.order);
}

export function pick(work: CollectionEntry<"work">[], id: string): CollectionEntry<"work"> {
  const entry = work.find((w) => w.id === id);
  if (!entry) throw new Error(`Missing work entry "${id}" in src/content/work/`);
  return entry;
}
