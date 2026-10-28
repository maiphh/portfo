/** The two iso highlights (HIGHLIGHTS-SPEC v3 §4, §5.4): their cameras, and the motion vectors in
 * lib/highlights/motion.json against the ones the kernel measures at those cameras. */
import { describe, expect, it } from "vitest";
import MOTION from "~/lib/highlights/motion.json";
import { ISO_EL, proj } from "./iso";
import { ISO_SCENES } from "./scenes";

type Stop = [number, Record<string, number>];
const tracks = (key: string) =>
  (MOTION as unknown as Record<string, { tracks: { t: string[]; transform?: Stop[] }[] }>)[key]
    ?.tracks ?? [];
/** The farthest point a track moves its parts to. */
const far = (key: string, sel: string) => {
  const tr = tracks(key).find((t) => t.t.includes(sel));
  const xy = (tr?.transform ?? []).map(([, v]) => [v.x ?? 0, v.y ?? 0] as const);
  return xy.reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a), [0, 0] as const);
};

describe("iso highlights", () => {
  it("are OCR queue (54/22) and DVP sandbox (30/30), each away from its page hero", () => {
    expect(Object.keys(ISO_SCENES).sort()).toEqual(["dvp/sandbox", "ocr/queue"]);
    expect(ISO_SCENES["ocr/queue"]?.cam).toEqual({ yaw: 54, el: 22 });
    expect(ISO_SCENES["dvp/sandbox"]?.cam).toEqual({ yaw: 30, el: 30 });
    // the heroes on those pages (spec §4): OCR 24/48, DVP 18/52
    const hero: Record<string, [number, number]> = {
      "ocr/queue": [24, 48],
      "dvp/sandbox": [18, 52],
    };
    for (const [k, s] of Object.entries(ISO_SCENES)) {
      const [yaw, el] = hero[k] ?? [0, 0];
      expect(Math.abs(s.cam.yaw - yaw) + Math.abs(s.cam.el - el), k).toBeGreaterThanOrEqual(20);
    }
  });

  it("move along the vectors the kernel measures (motion.json = scenes.ts vec)", () => {
    const q = ISO_SCENES["ocr/queue"]?.vec ?? {};
    const s = ISO_SCENES["dvp/sandbox"]?.vec ?? {};
    expect(far("ocr/queue", ".hl-rp")).toEqual(q.rp);
    expect(far("ocr/queue", ".hl-ep")).toEqual(q.ep);
    expect(far("dvp/sandbox", ".hl-probe")).toEqual(s.probe);
    expect(q.rp).toEqual([58.1, 30]);
    expect(q.ep).toEqual([49.3, 25.4]);
    expect(s.probe).toEqual([30.6, 8.8]);
  });

  it("keeps the kernel's default projection (yaw 45, el 35.26) as in iso-glow", () => {
    const { D } = proj();
    const s = Math.sqrt(1.5),
      r = Math.SQRT1_2;
    expect(D(1, 0, 0)[0]).toBeCloseTo(s * r);
    expect(D(0, 0, 1)[1]).toBeCloseTo(-s * Math.cos((ISO_EL * Math.PI) / 180));
  });
});
