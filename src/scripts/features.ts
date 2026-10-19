/**
 * Home page features that work without motion: most-read, heatmap, Ask, contact queue,
 * OpenPortfo chart, OCR leader lines, dev panel. Motion lives in motion.ts.
 */
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { candleSeries, pctChange, type Candle } from "~/lib/candles";
import { contactRules, type ContactField } from "~/lib/contact-rules";
import { USE_MOCKS } from "~/lib/flags";
import { mockAsk } from "~/lib/mocks/ask";
import { mockSubmitContact } from "~/lib/mocks/contact";
import { site } from "~/lib/site";
import { TL_MONTHS, nowIndex } from "~/lib/timeline";
import type { ContactRole, QueueStep } from "~/lib/types";
import { $, $$, clock, esc, fmt, reduce, relRect } from "./dom";

gsap.registerPlugin(SplitText);

/* ---------- dev panel (?dev) ---------- */
export function initDevPanel() {
  const dev = $("#dev");
  if (!dev) return;
  if (/[?&]dev\b/.test(location.search)) dev.hidden = false;
  $("[data-dev-close]")?.addEventListener("click", () => (dev.hidden = true));
}

/* ---------- 1. views + most read (SAMPLE: counts tick up locally) ---------- */
export function initMostRead() {
  if (!USE_MOCKS) return;
  const viewEls = $$("[data-views]");
  const render = () => {
    const items = viewEls
      .map((el) => ({ n: Number(el.dataset.views), t: el.dataset.title ?? "", h: "#" + el.id }))
      .sort((a, b) => b.n - a.n);
    $$("[data-most]").forEach((ol) => {
      ol.innerHTML = items
        .slice(0, Number(ol.dataset.max) || 4)
        .map(
          (it, i) =>
            `<li><a href="${it.h}"><span class="i">${String(i + 1).padStart(2, "0")}</span><b>${esc(it.t)}</b><span class="n">${fmt(it.n)} views</span></a></li>`,
        )
        .join("");
    });
  };
  window.setInterval(() => {
    if (document.hidden || !viewEls.length) return;
    const el = viewEls[Math.floor(Math.random() * viewEls.length)];
    if (!el) return;
    el.dataset.views = String(Number(el.dataset.views) + 1 + Math.floor(Math.random() * 3));
    render();
  }, 3200);
  render();
}

/* ---------- 2. heatmap starts at "today"; timeline "now" tracks the real date ---------- */
export function initHeatmap() {
  const hm = $("[data-hm-scroll]");
  if (hm) {
    const toEnd = () => (hm.scrollLeft = hm.scrollWidth);
    toEnd();
    window.addEventListener("resize", toEnd);
  }
}

/* ---------- 3. Ask (SAMPLE answers from src/lib/mocks/ask.ts) ---------- */
export function initAsk() {
  const convo = $("#convo");
  const form = $<HTMLFormElement>("#ask-form");
  const input = $<HTMLInputElement>("#ask-input");
  if (!convo || !form || !input) return;
  let busy = false;

  const ask = (raw: string) => {
    const q = (raw || "").trim();
    if (!q || busy) return;
    busy = true;
    $("[data-empty]", convo)?.remove();
    const turn = document.createElement("div");
    turn.className = "turn";
    if (!USE_MOCKS) {
      turn.innerHTML = `<p class="q">${esc(q)}</p><div class="turn-body"><div class="ans"><p class="st">Not connected yet</p><p class="a-body">Ask isn't live yet. Email <a href="mailto:${site.email}">${site.email}</a> and I'll answer myself.</p></div></div>`;
      convo.appendChild(turn);
      convo.scrollTop = convo.scrollHeight;
      busy = false;
      return;
    }
    const hit = mockAsk(q);
    const n = hit.passages.length;
    const passages = n
      ? hit.passages
          .map((p, i) => `<li><span class="src">[${i + 1}] ${esc(p.source)}</span>${p.html}</li>`)
          .join("")
      : '<li><span class="src">no passage found</span>Nothing close enough to quote.</li>';
    const chips = hit.citations
      .map(
        (c, i) =>
          `<a class="cite-chip" href="${c.href}">${n ? `[${i + 1}] ` : ""}${esc(c.label)}</a>`,
      )
      .join("");
    turn.innerHTML =
      `<p class="q">${esc(q)}</p><div class="turn-body"><ol class="passages" aria-label="Passages used">${passages}</ol>` +
      `<div class="ans"><p class="st">${n ? `Reading ${n} passage${n > 1 ? "s" : ""}…` : "Searching…"}</p><p class="a-body">${hit.html}</p>` +
      `<div class="cites">${chips}</div></div></div>`;
    convo.appendChild(turn);
    const st = $(".st", turn);
    const done = () => {
      if (st)
        st.textContent = n
          ? `Sample answer from ${n} passage${n > 1 ? "s" : ""}`
          : "No sourced answer";
      busy = false;
    };
    if (reduce()) {
      convo.scrollTop = convo.scrollHeight;
      done();
      return;
    }
    const body = $(".a-body", turn);
    const split = body ? SplitText.create(body, { type: "words", aria: "auto" }) : null;
    const tl = gsap.timeline({
      defaults: { ease: "power3.out", duration: 0.4 },
      onUpdate: () => {
        convo.scrollTop = convo.scrollHeight;
      },
      onComplete: () => {
        split?.revert();
        done();
      },
    });
    tl.from($(".q", turn), { opacity: 0, y: 12 }).from(
      $$(".passages li", turn),
      { opacity: 0, x: -14, stagger: 0.16 },
      "-=0.1",
    );
    if (split)
      tl.from(split.words, { opacity: 0.08, duration: 0.1, stagger: 0.022, ease: "none" }, "+=0.1");
    tl.from($$(".cite-chip", turn), { opacity: 0, y: 6, stagger: 0.07 }, ">-0.05");
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
    input.value = "";
  });
  $$<HTMLButtonElement>("[data-prompt]").forEach((b) =>
    b.addEventListener("click", () => ask(b.dataset.prompt ?? "")),
  );
  const focusAsk = (e?: Event) => {
    e?.preventDefault();
    $("#ask")?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth" });
    input.focus({ preventScroll: true });
  };
  $$("[data-ask]").forEach((a) => a.addEventListener("click", focusAsk));
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (e.key === "/" && t && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable)
      focusAsk(e);
  });
}

/* ---------- 4. contact form + queue (SAMPLE with mocks on; POST /api/contact with mocks off) ---------- */
export function initContact() {
  const cf = $<HTMLFormElement>("#contact-form");
  const status = $("#q-status");
  if (!cf || !status) return;
  const steps = $$(".qs", cf);
  const sendBtn = $<HTMLButtonElement>("button[type=submit]", cf);
  const pkt = $("[data-pkt]", cf);
  const fields = Object.keys(contactRules) as ContactField[];
  const field = (k: ContactField) =>
    cf.elements.namedItem(k) as HTMLInputElement | HTMLTextAreaElement;
  const errEl = (f: HTMLElement) =>
    document.getElementById(f.getAttribute("aria-describedby") ?? "");
  // JS validates inline with readable messages; without JS the browser and server do.
  cf.noValidate = true;

  const validate = () => {
    let first: HTMLElement | null = null;
    for (const k of fields) {
      const f = field(k);
      const msg = contactRules[k](f.value);
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = f;
    }
    return first;
  };
  for (const k of fields) {
    const f = field(k);
    f.addEventListener("input", () => {
      if (f.getAttribute("aria-invalid") !== "true") return;
      const msg = contactRules[k](f.value);
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
    });
  }

  const resetSteps = () =>
    steps.forEach((s) => {
      s.classList.remove("active", "done");
      const sm = $("small", s);
      if (sm) sm.textContent = "waiting";
    });
  const showFieldErrors = (errors: Partial<Record<string, string>>) => {
    let first: HTMLElement | null = null;
    for (const k of fields) {
      const f = field(k);
      const msg = errors[k] ?? "";
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = f;
    }
    return first;
  };

  /** Real submission: POST /api/contact, then show where the message is. */
  const sendLive = async () => {
    if (sendBtn) sendBtn.disabled = true;
    cf.setAttribute("aria-busy", "true");
    resetSteps();
    status.textContent = "Sending…";
    const fallback = `Please email ${site.email} instead.`;
    try {
      const res = await fetch(cf.action, {
        method: "POST",
        body: new FormData(cf),
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Partial<Record<string, string>>;
      };
      if (res.ok) {
        const queued = steps[0];
        if (queued) {
          queued.classList.add("done");
          const sm = $("small", queued);
          if (sm) sm.textContent = clock();
        }
        const name = field("name").value.trim().split(/\s+/)[0] ?? "";
        status.textContent = `Sent. Thanks, ${name}: your message is in the queue, and I'll read it myself.`;
        cf.reset();
        fields.forEach((k) => field(k).removeAttribute("aria-invalid"));
        return;
      }
      if (res.status === 400 && data.fieldErrors) {
        const bad = showFieldErrors(data.fieldErrors);
        status.textContent = "Fix the highlighted fields and send again.";
        bad?.focus();
        return;
      }
      status.textContent =
        res.status === 429
          ? `That's 3 messages today, the daily limit. ${fallback}`
          : res.status === 403
            ? "The anti-spam check didn't pass. Please try again."
            : `Sorry, the message couldn't be sent. ${fallback}`;
    } catch {
      status.textContent = `Sorry, the message couldn't be sent (network error). ${fallback}`;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      cf.removeAttribute("aria-busy");
      // Turnstile tokens are single-use.
      (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
    }
  };

  cf.addEventListener("submit", (e) => {
    e.preventDefault();
    const bad = validate();
    if (bad) {
      const many = $$("[aria-invalid=true]", cf).length > 1;
      status.textContent = `Fix the highlighted field${many ? "s" : ""} and send again.`;
      bad.focus();
      return;
    }
    if (!USE_MOCKS) {
      void sendLive();
      return;
    }
    const name = field("name").value.trim().split(/\s+/)[0] ?? "";
    const role = (cf.querySelector<HTMLInputElement>("input[name=role]:checked")?.value ||
      undefined) as ContactRole | undefined;
    const { jobId, category } = mockSubmitContact({
      name: field("name").value,
      email: field("email").value,
      message: field("message").value,
      ...(role ? { role } : {}),
    });
    if (sendBtn) sendBtn.disabled = true;
    steps.forEach((s) => {
      s.classList.remove("active", "done");
      const sm = $("small", s);
      if (sm) sm.textContent = "waiting";
    });
    const labels: Record<QueueStep, string> = {
      queued: `Saved as ${jobId} in the jobs table`,
      claimed: `A worker claimed ${jobId}`,
      sorted: `The LLM sorted it as ${category}${category === "spam" ? ", so it's stored, not emailed" : ""}`,
      sent: category === "spam" ? "Stored without emailing Phu" : "Phu has it in his inbox",
    };
    const gap = reduce() ? 0.35 : 0.8;
    const tl = gsap.timeline();
    if (!reduce() && pkt) tl.set(pkt, { opacity: 1, x: 0 }, 0);
    steps.forEach((s, i) => {
      const at = i * gap;
      const step = (s.dataset.step ?? "queued") as QueueStep;
      tl.call(
        () => {
          s.classList.add("active");
          status.textContent = `${labels[step]}… (sample)`;
        },
        undefined,
        at,
      );
      if (!reduce() && pkt)
        tl.to(
          pkt,
          { x: () => s.offsetLeft + 6 - 5, duration: gap * 0.75, ease: "power2.inOut" },
          at,
        );
      tl.call(
        () => {
          s.classList.remove("active");
          s.classList.add("done");
          const sm = $("small", s);
          if (sm) sm.textContent = clock();
        },
        undefined,
        at + gap * 0.8,
      );
      const ring = $(".ring", s);
      if (!reduce() && ring)
        tl.fromTo(
          ring,
          { scale: 0.6 },
          { scale: 1, duration: 0.5, ease: "expo.out" },
          at + gap * 0.8,
        );
    });
    tl.call(
      () => {
        status.textContent = `${labels.sent}. Thanks, ${name}. This is a sample: nothing was actually sent. Email ${site.email} to reach me.`;
        if (sendBtn) sendBtn.disabled = false;
        cf.reset();
        fields.forEach((k) => field(k).removeAttribute("aria-invalid"));
      },
      undefined,
      steps.length * gap,
    );
    if (!reduce() && pkt) tl.to(pkt, { opacity: 0, duration: 0.3 }, steps.length * gap - 0.1);
  });
}

/* ---------- 5. OpenPortfo canvas chart (SAMPLE random walk; lazy, pauses offscreen) ---------- */
export function initChart() {
  const cv = $<HTMLCanvasElement>("[data-candles]");
  const chg = $("[data-chg]");
  const ctx = cv?.getContext("2d");
  if (!cv || !ctx) return;
  const { initial, next } = candleSeries();
  const data: Candle[] = [...initial];
  let W = 0;
  let H = 0;
  const draw = () => {
    if (!W) return;
    const n = Math.max(24, Math.min(64, Math.floor(W / 11)));
    const d = data.slice(-n);
    const pad = 14;
    const right = 64;
    const hi = Math.max(...d.map((x) => x.h));
    const lo = Math.min(...d.map((x) => x.l));
    const y = (p: number) => pad + ((hi - p) / (hi - lo)) * (H - pad * 2);
    const cw = (W - right - pad) / n;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#262624";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8c8c85";
    ctx.font = "11px 'JetBrains Mono Variable', monospace";
    for (let g = 0; g <= 4; g++) {
      const gy = Math.round(pad + (g * (H - pad * 2)) / 4) + 0.5;
      const val = hi - (g * (hi - lo)) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, gy);
      ctx.lineTo(W - right, gy);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), W - right + 10, gy + 4);
    }
    d.forEach((k, i) => {
      const x = pad + i * cw + cw / 2;
      const up = k.c >= k.o;
      const bw = Math.max(3, cw * 0.56);
      ctx.strokeStyle = up ? "#d4f56b" : "#8c8c85";
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y(k.h));
      ctx.lineTo(Math.round(x) + 0.5, y(k.l));
      ctx.stroke();
      const top = y(Math.max(k.o, k.c));
      const bh = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
      if (up) {
        ctx.fillStyle = "#d4f56b";
        ctx.fillRect(x - bw / 2, top, bw, bh);
      } else {
        ctx.fillStyle = "#1b1b1a";
        ctx.fillRect(x - bw / 2, top, bw, bh);
        ctx.strokeRect(x - bw / 2 + 0.5, top + 0.5, bw - 1, bh - 1);
      }
    });
    const last = d[d.length - 1]?.c ?? 0;
    const ly = Math.round(y(last)) + 0.5;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(212,245,107,.6)";
    ctx.beginPath();
    ctx.moveTo(pad, ly);
    ctx.lineTo(W - right, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#d4f56b";
    ctx.fillRect(W - right + 4, ly - 9, right - 8, 18);
    ctx.fillStyle = "#141414";
    ctx.fillText(last.toFixed(1), W - right + 10, ly + 4);
    if (chg) chg.textContent = pctChange(d);
  };
  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  let timer: number | null = null;
  // Draw the first frame straight away (reduced motion keeps this still frame).
  size();
  window.addEventListener("resize", size);
  const tick = () => {
    data.push(next());
    if (data.length > 200) data.shift();
    draw();
  };
  new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          if (!reduce() && !timer) timer = window.setInterval(tick, 1100);
        } else if (timer) {
          clearInterval(timer);
          timer = null;
        }
      });
    },
    { rootMargin: "120px" },
  ).observe(cv);
}

/* ---------- 5b. OCR stage leaders: every detected box is named by a line to its output field ---------- */
export function drawOcrLeaders() {
  const stage = $("[data-ocr-stage]");
  const svg = $<SVGSVGElement>("[data-ocr-leaders]");
  const paper = stage && $(".paper", stage);
  if (!stage || !svg || !paper) return;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const narrow = W < 600;
  const pr = relRect(paper, stage);
  let out = "";
  $$(".pbox", stage).forEach((pb) => {
    const f = $(`[data-o="${pb.dataset.l ?? ""}"]`, stage);
    if (!f) return;
    const a = relRect(pb, stage);
    const o = relRect(f, stage);
    if (narrow) {
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = o.x + o.w / 2;
      const y2 = o.y;
      const my = (y1 + y2) / 2;
      out += `<path d="M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}"/><circle cx="${x1}" cy="${y1}" r="2.5"/>`;
    } else {
      // Route under the box, out past the paper's edge, then into the field: never across the text.
      const X1 = a.x + a.w;
      const Y1 = a.y + a.h;
      const Yr = Y1 + 5;
      const px = pr.x + pr.w + 10;
      const X2 = o.x;
      const Y2 = o.y + o.h / 2;
      const mx = (px + X2) / 2;
      out += `<path d="M${X1} ${Y1} V${Yr} H${px} C${mx} ${Yr} ${mx} ${Y2} ${X2} ${Y2}"/><circle cx="${X1}" cy="${Y1}" r="2.5"/>`;
    }
  });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = out;
}

/* ---------- 6. timeline "now" marker follows the visitor's date, not the build date ---------- */
export function initNowMarker() {
  const el = $(".tl .now");
  if (!el) return;
  el.style.setProperty("--p", (nowIndex() / TL_MONTHS).toFixed(3));
}
