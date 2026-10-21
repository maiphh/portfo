/**
 * Home page features that work without motion: most-read, heatmap, contact form,
 * OpenPortfo chart, OCR leader lines, dev panel. Motion lives in motion.ts.
 */
import { candleSeries, pctChange, type Candle } from "~/lib/candles";
import { API_MOCK, API_URL, apiUrl } from "~/lib/api";
import { contactRules, type ContactField } from "~/lib/contact-rules";
import { USE_MOCKS } from "~/lib/flags";
import { site } from "~/lib/site";
import { TL_MONTHS, nowIndex } from "~/lib/timeline";
import { $, $$, esc, fmt, reduce, relRect } from "./dom";

/* ---------- dev panel (?dev) ---------- */
export function initDevPanel() {
  const dev = $("#dev");
  if (!dev) return;
  if (/[?&]dev\b/.test(location.search)) dev.hidden = false;
  $("[data-dev-close]")?.addEventListener("click", () => (dev.hidden = true));
}

/* ---------- 1a. most read, live: Worker /popular, refreshed every 30 s while visible ---------- */
interface PopularItem {
  title: string;
  href: string;
  views: number;
}
export function initPopular() {
  const ol = $<HTMLOListElement>("[data-most][data-live]");
  const status = $("[data-most-status]");
  if (!ol || !status) return;
  const max = Number(ol.dataset.max) || 4;
  const show = (msg: string) => {
    ol.hidden = true;
    status.hidden = false;
    status.textContent = msg;
  };
  if (!API_URL) {
    show("View counts appear here once analytics is connected.");
    return;
  }
  const load = async () => {
    try {
      const res = await fetch(apiUrl("/popular"), { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: PopularItem[] };
      const items = (data.items ?? []).filter((it) => it.views > 0).slice(0, max);
      if (!items.length) {
        show("Not enough reads yet this week. The list fills in as people visit.");
        return;
      }
      ol.innerHTML = items
        .map(
          (it, i) =>
            `<li><a href="${esc(it.href)}"><span class="i">${String(i + 1).padStart(2, "0")}</span><b>${esc(it.title)}</b><span class="n">${fmt(it.views)} ${it.views === 1 ? "view" : "views"}</span></a></li>`,
        )
        .join("");
      ol.hidden = false;
      status.hidden = true;
    } catch {
      show("View counts appear here once analytics is connected.");
    }
  };
  void load();
  window.setInterval(() => {
    if (!document.hidden) void load();
  }, 30_000);
}

/* ---------- 1. views + most read (SAMPLE: counts tick up locally) ---------- */
export function initMostRead() {
  if (!USE_MOCKS) {
    initPopular();
    return;
  }
  const viewEls = $$("[data-views]");
  const render = () => {
    const items = viewEls
      .map((el) => ({
        n: Number(el.dataset.views),
        t: el.dataset.title ?? "",
        h: "/work/" + (el.dataset.slug ?? el.id),
      }))
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

/* ---------- 2. heatmap (fits its container now; timeline "now" tracks the real date) ---------- */

/* ---------- 4. contact form (SAMPLE with mocks on; POST Worker /contact with mocks off) ---------- */
export function initContact() {
  const cf = $<HTMLFormElement>("#contact-form");
  const status = $("#q-status");
  if (!cf || !status) return;
  const sendBtn = $<HTMLButtonElement>("button[type=submit]", cf);
  const fields = Object.keys(contactRules) as ContactField[];
  const field = (k: ContactField) =>
    cf.elements.namedItem(k) as HTMLInputElement | HTMLTextAreaElement;
  const errEl = (f: HTMLElement) =>
    document.getElementById(f.getAttribute("aria-describedby") ?? "");
  // JS validates inline with readable messages; without JS the browser and Worker do.
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

  const sendLive = async () => {
    if (!cf.action) {
      status.textContent = `The form isn't connected yet. Please email ${site.email} instead.`;
      return;
    }
    if (sendBtn) sendBtn.disabled = true;
    cf.setAttribute("aria-busy", "true");
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
        const name = field("name").value.trim().split(/\s+/)[0] ?? "";
        status.textContent = `Sent. Thanks, ${name}. I'll read it myself.`;
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
      status.textContent = `Sorry, the message couldn't be sent. ${fallback}`;
    } catch {
      status.textContent = `Sorry, the message couldn't be sent (network error). ${fallback}`;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      cf.removeAttribute("aria-busy");
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
    if (!API_MOCK) {
      void sendLive();
      return;
    }
    const name = field("name").value.trim().split(/\s+/)[0] ?? "";
    status.textContent = `Thanks, ${name}. This is a sample: nothing was sent. Email ${site.email} to reach me.`;
    cf.reset();
    fields.forEach((k) => field(k).removeAttribute("aria-invalid"));
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
