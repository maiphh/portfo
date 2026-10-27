/*
 * Highlights scenes for OpenPortfo (agent, news, email). Port of the prototype's build/projects/openportfo.mjs
 * (dive scenes only) with the cameras from build/views.mjs. Holdings are sample data; no provider names drawn.
 * Labels and tips are copy (HIGHLIGHTS-SPEC Appendix A). iso-glow kernel: MIT, see src/lib/iso/LICENSE-iso-glow.
 */
import { O } from "~/lib/iso/objects";
import {
  G,
  P,
  Scene,
  Z0,
  type Cam,
  type Kernel,
  type PlateScene,
  type SceneT,
  type Spec,
} from "~/lib/iso/scene";

const book = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  spec: Spec,
  lit: (i: number, j: number) => Spec | null,
  k: string,
) => G(S, spec, "ln-g", O.grid(S, K, x, y, z, w, d, 8, 4, 4, lit), k);

// ---- agent: chat → agent → a tool on the server (token stays) → the signed-in user's book ----
function agent(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { ok: 5, fail: 5 }, mode: "ok", plate: 34 });
  const U = P(ph, { chat: 0, ag: 140, srv: 290, bk: 450 }, { chat: 0, ag: 130, srv: 270, bk: 490 });
  S.put(
    U.chat,
    0,
    56,
    70,
    10,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.sheets(K, x, y, z, 56, 70, 2), "chat"),
    {
      lab: {
        a: "n",
        pa: "n",
        t: "the chat",
        k: "chat",
        tip: "The chat is a way to use the portfolio, not a separate app beside it.",
      },
    },
  );
  S.link(
    [
      [U.chat + 32, 0],
      [U.ag - 32, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(U.ag, 0, 60, 60, 20, (K, x, y, z) => O.chip(S, K, x, y, z, 60, { hot: "1-" }, "ag"), {
    lab: {
      a: "n",
      pa: "e",
      t: "agent",
      k: "ag",
      tip: "The agent can look up holdings, quotes and news, and add or remove a holding or a watchlist item.",
    },
  });
  S.link(
    [
      [U.ag + 32, 0],
      [U.srv - 62, 0],
    ],
    { hot: "2-" },
    { go: "2" },
  );
  // server slab with four tool tiles; the token key stays on it
  const SW = 110,
    SD = 110;
  S.put(
    U.srv,
    0,
    SW,
    SD,
    10,
    (K, x, y, z) =>
      G(S, { ln: "2-" }, "ln-g", K.box(x, y, z, SW, SD, 10, 6), "srv") +
      [0, 1, 2, 3]
        .map((i) =>
          G(
            S,
            i === 3 ? { hot: "2-", $fail: { er: "3-", hot: "2" } } : { ln: "2-" },
            i === 3 ? "lt" : "ln-g",
            K.box(x + 10 + (i % 2) * 48, y + 10 + Math.floor(i / 2) * 48, z + 10, 40, 40, 8, 4),
            "tool",
          ),
        )
        .join(""),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "tools run on the server",
        k: "srv",
        tip: "A tool runs on the server, and it only sees the signed-in user’s book.",
      },
    },
  );
  S.put(
    P(ph, U.srv, U.srv + 105),
    P(ph, -SD / 2 - 40, 20),
    52,
    16,
    5,
    (K, x, y, z) => G(S, { ln: "2-" }, "ln-g", O.key(K, x, y, z), "key"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "token stays here",
        s: "the model never receives it",
        cls: "keep",
        k: "key",
        tip: "The model never receives a token.",
      },
    },
  );
  S.link(
    [
      [U.srv + SW / 2 + 4, 0],
      [U.bk - 62, 0],
    ],
    { hot: "3-", $fail: { hot: "" } },
    { go: "3", $fail: { go: "" } },
  );
  S.put(
    U.bk,
    0,
    110,
    110,
    8,
    (K, x, y, z) =>
      book(
        S,
        K,
        x,
        y,
        z,
        110,
        110,
        { ln: "0-" },
        (i, j) => (i === 3 && j === 3 ? { hot: "3-", $fail: { hot: "", dim: "3-" } } : null),
        "book",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "the signed-in user’s book",
        k: "book",
        tip: "The agent calls the same book the screens use.",
      },
    },
  );
  S.label([...S.map(U.chat, 0), Z0 + 10], {
    a: P(ph, "w", "e"),
    t: "it changed",
    cls: "acc",
    k: "ag",
    spec: { off: "0-3", $fail: { off: "0-" } },
    tip: "The agent says the book changed only after the tool succeeded.",
  });
  S.label([...S.map(U.chat, 0), Z0 + 10], {
    a: P(ph, "w", "e"),
    t: "no change claimed",
    cls: "err",
    k: "ag",
    spec: { off: "0-", $fail: { off: "0-3" } },
    tip: "The agent does not claim the book changed unless that tool succeeded.",
  });
  S.label([...S.map(U.srv + SW / 2, P(ph, -SD / 2, SD / 2)), Z0 + P(ph, 18, 13)], {
    a: "e",
    t: "tool failed",
    cls: "err",
    k: "srv",
    spec: { off: "0-", $fail: { off: "0-2" } },
  });
  return S;
}

// ---- news: RSS → daily job → stored → matched to the symbols on a book ----
function news(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 4 }, mode: "d", plate: 34 });
  const U = P(ph, { rss: 0, job: 150, st: 280, ls: 430 }, { rss: 0, job: 130, st: 240, ls: 350 });
  [-1, 0, 1].forEach((i) => {
    const v = i * P(ph, 70, 46);
    S.put(
      U.rss - Math.abs(i) * 16,
      v,
      40,
      50,
      10,
      (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.sheets(K, x + 2, y + 2, z, 36, 46, 2), "rss"),
      i === 1
        ? {
            lab: { a: "s", pa: "e", t: "RSS feeds", k: "rss", tip: "A daily job reads RSS feeds." },
          }
        : {},
    );
    S.link(
      [
        [U.rss + 22, v],
        [U.job - 30, v * 0.2],
      ],
      { hot: "1-" },
      { go: "1" },
    );
  });
  S.put(
    U.job,
    0,
    52,
    52,
    8,
    (K, x, y, z) => G(S, { hot: "1-" }, "lt", O.clock(K, x + 26, y + 26, z, 26), "job"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "daily job",
        k: "job",
        tip: "The browser does not call the feeds. The job does.",
      },
    },
  );
  S.link(
    [
      [U.job + 30, 0],
      [U.st - 30, 0],
    ],
    { hot: "2-" },
    { go: "2" },
  );
  // the prototype passed the string 'led' as rack LEDs (it drew a stray text node); no LEDs here
  S.put(
    U.st,
    0,
    54,
    54,
    40,
    (K, x, y, z) => G(S, { ln: "2-" }, "ln-g", O.rack(K, x, y, z, 54, 54, 40), "st"),
    {
      lab: {
        a: P(ph, "s", "e"),
        pa: "e",
        t: "items stored",
        k: "st",
        tip: "The job stores the items.",
      },
    },
  );
  S.link(
    [
      [U.st + 30, 0],
      [U.ls - 40, 0],
    ],
    { hot: "3-" },
    { go: "3" },
  );
  S.put(
    U.ls,
    0,
    60,
    70,
    10,
    (K, x, y, z) => G(S, { ln: "3-" }, "ln-g", O.sheets(K, x, y, z, 60, 70, 2), "ls"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "matched to your symbols",
        k: "ls",
        tip: "Each item is matched to the symbols on a person’s book, so the list is about what they hold.",
      },
    },
  );
  // the browser reads the list, never the feeds
  const bu = P(ph, U.ls, U.ls + 100),
    bv = P(ph, 110, 0);
  S.link(
    ph
      ? [
          [U.ls + 42, 0],
          [bu - 24, 0],
        ]
      : [
          [U.ls, 44],
          [bu, bv - 26],
        ],
    { hot: "3-" },
  );
  S.put(
    bu,
    bv,
    56,
    36,
    44,
    (K, x, y, z) => G(S, { ln: "3-" }, "ln-g", O.screen(K, x, y, z, 56, 36), "br"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "browser",
        s: "never calls the feeds",
        cls: "keep",
        k: "br",
        tip: "The browser does not call the feeds. The job does.",
      },
    },
  );
  return S;
}

// ---- email: the scheduled job sends the summary; opening the site does not ----
function email(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { job: 4, open: 3 }, mode: "job", plate: 34 });
  const U = P(ph, { a: 0, ask: 140, env: 260, box: 390 }, { a: 0, ask: 210, env: 320, box: 430 });
  const cv = P(ph, -55, 36),
    sv = P(ph, 75, -34),
    cu = P(ph, U.a, U.a + 95);
  S.put(
    cu,
    cv,
    52,
    52,
    8,
    (K, x, y, z) =>
      G(S, { hot: "0-", $open: { dim: "0-" } }, "lt", O.clock(K, x + 26, y + 26, z, 26), "job"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "scheduled job",
        k: "job",
        tip: "The same daily job can send a summary.",
      },
    },
  );
  S.put(
    U.a,
    sv,
    56,
    36,
    44,
    (K, x, y, z) =>
      G(
        S,
        { dim: "0-", $open: { ln: "0-", dim: "" } },
        "ln-g",
        O.screen(K, x, y, z, 56, 36),
        "site",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "site opened",
        k: "site",
        tip: "Opening the site does not send the mail. The scheduled job does.",
      },
    },
  );
  S.link(
    [
      [cu + 28, cv],
      [U.ask - 6, P(ph, 0, cv)],
    ],
    { hot: "1-", $open: { off: "0-" } },
    { go: "1", $open: { go: "" } },
  );
  S.link(
    [
      [U.a + 28, sv],
      [U.ask - 6, P(ph, 0, sv)],
    ],
    { off: "0-", $open: { er: "1-" } },
    { $open: { go: "1" } },
  );
  S.put(
    U.ask,
    0,
    10,
    80,
    42,
    (K, x, y, z) => O.gate(S, K, x, y, z, 80, 42, { hot: "1-", $open: { dim: "0-" } }, "ask"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "asked for it",
        k: "ask",
        tip: "It is sent when someone has asked for it.",
      },
    },
  );
  S.label([...S.map(U.ask + 70, 0), Z0 + 10], {
    a: P(ph, "n", "e"),
    t: "no email",
    cls: "err",
    k: "site",
    spec: { off: "0-", $open: { off: "0-1" } },
    tip: "Opening the site does not send the mail.",
  });
  S.link(
    [
      [U.ask + 6, 0],
      [U.env - 34, 0],
    ],
    { hot: "2-", $open: { off: "0-" } },
    { go: "2", $open: { go: "" } },
  );
  S.put(
    U.env,
    0,
    60,
    44,
    6,
    (K, x, y, z) =>
      G(S, { hot: "2-", $open: { dim: "0-" } }, "lt", O.envelope(K, x, y, z, 60, 44), "env"),
    {
      lab: { a: "n", pa: "e", t: "one summary", k: "env", spec: { $open: { off: "0-" } } },
    },
  );
  S.link(
    [
      [U.env + 32, 0],
      [U.box - 40, 0],
    ],
    { hot: "3-", $open: { off: "0-" } },
    { go: "3", $open: { go: "" } },
  );
  S.put(
    U.box,
    0,
    60,
    70,
    10,
    (K, x, y, z) =>
      G(S, { ln: "3-", $open: { dim: "0-" } }, "ln-g", O.sheets(K, x, y, z, 60, 70, 2), "box"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "inbox",
        s: "performance · price changes · news",
        cls: "keep",
        k: "box",
        spec: { $open: { off: "0-" } },
        tip: "Performance, price changes and news, in one email.",
      },
    },
  );
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  agent: {
    draw: agent,
    asp: ASP,
    cam: { dk: { yaw: 50, el: 60, ground: "none" }, ph: { yaw: 50, el: 60, ground: "none" } },
  },
  news: {
    draw: news,
    asp: ASP,
    cam: {
      dk: { yaw: 14, el: 28, flow: "scr", ground: "outline" },
      ph: { yaw: 14, el: 32, ground: "outline" },
    },
  },
  email: {
    draw: email,
    asp: ASP,
    cam: {
      dk: { yaw: 0, el: 78, flow: "x", ground: "grid" },
      ph: { yaw: 0, el: 78, ground: "grid" },
    },
  },
};
