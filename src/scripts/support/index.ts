import QRCode from "qrcode";
import { printReceipt } from "./motion";
import { PRICING, quoteDonation, type Rail, type Selection } from "~/lib/support/pricing";
import { request, secret } from "./api";
import type { Attempt, Checkout, Status } from "./state";

const root = document.querySelector<HTMLElement>("#support");
if (root) init(root);
function init(root: HTMLElement) {
  const el = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing support element: ${selector}`);
    return element;
  };
  const all = <T extends HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const workerRaw = root.dataset.worker || "";
  const base = workerRaw
    ? (/^https?:\/\//i.test(workerRaw) ? workerRaw : `https://${workerRaw}`).replace(/\/+$/, "")
    : "";
  const enabled = root.dataset.enabled === "true" && !!base && !!root.dataset.siteKey;
  const pay = el<HTMLButtonElement>("[data-pay]");
  const reviewSubmit = el<HTMLButtonElement>("[data-review-submit]");
  const custom = el<HTMLInputElement>("#custom");
  const name = el<HTMLInputElement>("#support-name");
  const message = el<HTMLTextAreaElement>("#support-message");
  let rail: Rail = "payos",
    selection: "1" | "3" | "5" | "custom" = "3",
    changed = false,
    geoPending = true,
    busy = false;
  let attempt: Attempt | null = null,
    current: Status | null = null,
    checkout: Checkout | null = null,
    reviewToken = "",
    payToken = "",
    reviewChallenge = "";
  let payWidget: string | undefined, reviewWidget: string | undefined;
  let canRetryCreate = false;
  let reviewAttempt = { id: crypto.randomUUID(), key: secret() };
  const turnstile = () =>
    (
      window as unknown as {
        turnstile?: {
          render: (element: string, options: object) => string;
          reset: (id: string) => void;
        };
      }
    ).turnstile;
  const params = new URLSearchParams(location.search);
  const captured =
    root.dataset.returning === "true" && !location.search
      ? (history.state?.supportReturn as
          { id: string | null; hint: string | null; checkoutId: string | null } | undefined)
      : undefined;
  const returnId = params.get("id") ?? captured?.id ?? null,
    hint = params.get("hint") ?? captured?.hint ?? null,
    checkoutId = params.get("checkout_id") ?? captured?.checkoutId ?? null;
  if (root.dataset.returning === "true")
    history.replaceState(
      { ...history.state, supportReturn: { id: returnId, hint, checkoutId } },
      "",
      location.pathname + location.hash,
    );
  try {
    const saved = sessionStorage.getItem("support-attempt");
    if (saved) attempt = JSON.parse(saved) as Attempt;
  } catch {
    el("[data-pay-error]").textContent =
      "Storage is unavailable. Secure checkout cannot be resumed.";
  }
  function amount(): Selection {
    return selection === "custom"
      ? { customAmountMinor: Number(custom.value) * (rail === "polar" ? 100 : 1) }
      : { preset: Number(selection) as 1 | 3 | 5 };
  }
  function money(value: number, currency: string) {
    return currency === "VND"
      ? `${value.toLocaleString("vi-VN")} ₫`
      : `$${(value / 100).toLocaleString("en-US")}`;
  }
  function preview() {
    const quote = quoteDonation(rail, amount());
    all<HTMLElement>("[data-amount]").forEach((x) =>
      x.setAttribute("aria-checked", String(x.dataset.amount === selection)),
    );
    all<HTMLElement>("[data-rail]").forEach((x) =>
      x.setAttribute("aria-checked", String(x.dataset.rail === rail)),
    );
    all<HTMLElement>("[data-price]").forEach((x) => {
      x.textContent = money(PRICING[rail].unit * Number(x.dataset.price), PRICING[rail].currency);
    });
    el("[data-custom-wrap]").hidden = selection !== "custom";
    el("#custom-help").textContent =
      rail === "payos"
        ? "10,000 to 20,000,000 ₫ in 1,000 ₫ steps."
        : "$2 to $500 in whole dollars.";
    if (!current) {
      all<HTMLElement>("[data-total]").forEach(
        (x) => (x.textContent = quote ? money(quote.amountMinor, quote.currency) : "—"),
      );
      el("[data-summary]").textContent =
        selection === "custom" ? "CUSTOM SUPPORT" : `${selection} × CLAUDE`;
      el("[data-via]").textContent = rail === "payos" ? "VIETQR" : "CARD · POLAR";
    }
    el("[data-name]").textContent = name.value || "—";
    el("[data-message]").textContent = message.value ? "PRIVATE" : "—";
    pay.textContent = `Pay ${quote ? money(quote.amountMinor, quote.currency) : ""} with ${rail === "payos" ? "VietQR" : "card"} →`;
    el("[data-pay-help]").textContent =
      rail === "payos"
        ? "A QR opens for your banking app. No account needed."
        : "You finish on Polar’s secure checkout page.";
    pay.disabled = !enabled || geoPending || busy || !payToken;
  }
  const amounts = all<HTMLButtonElement>("[data-amount]");
  function chooseAmount(button: HTMLButtonElement) {
    selection = button.dataset.amount as typeof selection;
    preview();
  }
  amounts.forEach((button, i) => {
    button.addEventListener("click", () => chooseAmount(button));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = amounts[(i + step + amounts.length) % amounts.length];
      if (next) {
        next.focus();
        chooseAmount(next);
      }
    });
  });
  const rails = all<HTMLButtonElement>("[data-rail]");
  function chooseRail(next: Rail) {
    if (busy) return;
    changed = true;
    rail = next;
    custom.value = "";
    preview();
  }
  rails.forEach((button, i) => {
    button.addEventListener("click", () => chooseRail(button.dataset.rail as Rail));
    button.addEventListener("keydown", (event) => {
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const next =
          rails[
            (i + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : rails.length - 1)) %
              rails.length
          ];
        if (!next) return;
        next.focus();
        chooseRail(next.dataset.rail as Rail);
      }
    });
  });
  [custom, name, message].forEach((input) => input.addEventListener("input", preview));
  async function geo() {
    try {
      const res = await fetch("/api/support/default-rail", { signal: AbortSignal.timeout(1800) });
      const data = await res.json();
      if (!changed && !attempt && data.defaultRail === "payos") rail = data.defaultRail;
    } catch {
      /* VietQR remains the default */
    } finally {
      geoPending = false;
      preview();
    }
  }
  function store(a: Attempt) {
    sessionStorage.setItem("support-attempt", JSON.stringify(a));
  }
  function safeCheckout(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        ["polar.sh", "sandbox.polar.sh", "pay.payos.vn"].includes(url.hostname)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function showStatus(status: Status, focus = true) {
    current = status;
    rail = status.rail;
    busy = true;
    el("[data-order]").hidden = true;
    el(".b-go").hidden = true;
    el("[data-status-panel]").hidden = false;
    all<HTMLElement>("[data-total]").forEach(
      (x) => (x.textContent = money(status.amountMinor, status.currency)),
    );
    el("[data-summary]").textContent = status.presetCount
      ? `${status.presetCount} × CLAUDE`
      : "CUSTOM SUPPORT";
    el("[data-via]").textContent = status.rail === "payos" ? "VIETQR" : "CARD · POLAR";
    const paid = status.status === "paid",
      expired = status.status === "expired",
      failed = ["failed", "cancelled"].includes(status.status),
      unknown = status.status === "creation_unknown";
    const heading = el("[data-status-heading]");
    heading.textContent = paid
      ? "Payment received"
      : expired
        ? "That QR expired"
        : failed
          ? "Payment unconfirmed"
          : status.rail === "payos" && checkout?.qrCode
            ? "Scan with your banking app"
            : "Payment unconfirmed";
    el("[data-status-description]").textContent = paid
      ? "Thank you. Want to say something about the site?"
      : expired
        ? "Payment unconfirmed. A late payment can still be received; recheck this receipt."
        : unknown
          ? "Checkout creation is unconfirmed. Recheck this receipt for a late payment, or start a new attempt if you did not pay."
          : failed
            ? "Payment could not be confirmed. Recheck or start a new attempt."
            : status.rail === "payos" && checkout?.qrCode
              ? "Use the QR on your receipt. We’ll update it when payment is confirmed."
              : "We’re checking your payment. Returning from checkout does not confirm it.";
    el("[data-receipt-status]").textContent = paid
      ? "PAYMENT RECEIVED"
      : expired
        ? "PAYMENT UNCONFIRMED · EXPIRED"
        : failed
          ? "PAYMENT UNCONFIRMED"
          : "WAITING FOR PAYMENT…";
    const stamp = el("[data-stamp]");
    stamp.hidden = !(paid || expired || failed);
    stamp.classList.toggle("r-void", !paid);
    const stampText = stamp.querySelector("span");
    if (stampText) stampText.textContent = paid ? "PAID" : "VOID";
    el(".r-bar").hidden = true;
    el("[data-leave-note]").hidden = !paid;
    el("[data-recheck]").hidden = paid;
    el("[data-retry-create]").hidden = true;
    const continueLink = el<HTMLAnchorElement>("[data-continue]");
    const checkoutUrl = safeCheckout(checkout?.checkoutUrl ?? null);
    continueLink.hidden = status.rail !== "polar" || status.status !== "pending" || !checkoutUrl;
    if (checkoutUrl) continueLink.href = checkoutUrl;
    el("[data-new]").hidden = !paid && !expired && !failed && !unknown;
    el("[data-copy]").hidden = !checkout?.transferNote || paid || expired || failed;
    el("[data-save]").hidden = !checkout?.qrCode || paid || expired || failed;
    el("[data-qr]").hidden = !checkout?.qrCode || paid || expired || failed;
    el("[data-status-extra]").textContent =
      checkout?.qrCode && !paid && !expired && !failed
        ? "On a phone? Save the QR, then pick it from your banking app’s scan screen."
        : "";
    if (focus) {
      heading.focus();
      printReceipt(root, paid || expired || failed);
    }
    if (paid) void claim();
  }
  async function claim() {
    if (!attempt || reviewToken) return;
    try {
      const result = await request<{ reviewToken: string }>(base, `review-token/${attempt.id}`, {
        attempt,
        body: {},
      });
      reviewToken = result.reviewToken;
      el("[data-badge]").hidden = false;
    } catch {
      /* a free note remains available */
    }
  }
  async function loadCheckout() {
    if (!attempt || !current || current.status !== "pending") return;
    try {
      checkout = await request<Checkout>(base, `checkout/${attempt.id}`, { attempt });
      if (checkout.qrCode)
        el<HTMLImageElement>("[data-qr]").src = await QRCode.toDataURL(checkout.qrCode, {
          margin: 4,
          width: 600,
          errorCorrectionLevel: "M",
        });
    } catch {
      checkout = null;
    }
  }
  async function recheck(focus = true) {
    if (!attempt) return;
    try {
      const status = await request<Status>(base, `status/${attempt.id}`, { attempt });
      current = status;
      if (status.status === "pending" && !checkout) await loadCheckout();
      showStatus(status, focus);
    } catch (error) {
      el("[data-order]").hidden = true;
      el(".b-go").hidden = true;
      el("[data-status-panel]").hidden = false;
      el("[data-new]").hidden = !(error instanceof Error && error.message === "not_found");
      el("[data-retry-create]").hidden = !canRetryCreate;
      el("[data-status-description]").textContent =
        "Status is unavailable. Please recheck shortly.";
    }
  }
  async function startPayment(retry = false) {
    if (busy && !retry) return;
    const quote = quoteDonation(rail, amount());
    if (!quote) {
      el("[data-pay-error]").textContent = "Enter an amount within the stated range and step.";
      custom.focus();
      return;
    }
    try {
      if (!retry) {
        attempt = { id: crypto.randomUUID(), key: secret() };
        store(attempt);
      }
      if (!attempt) throw new Error("Missing receipt");
    } catch {
      el("[data-pay-error]").textContent =
        "Storage is unavailable. Enable session storage to continue securely.";
      return;
    }
    busy = true;
    canRetryCreate = true;
    preview();
    el("[data-retry-create]").hidden = true;
    el("[data-pay-error]").textContent = "Creating your checkout…";
    try {
      const result = await request<Checkout | Status>(base, "pay", {
        body: {
          id: attempt.id,
          receiptKey: attempt.key,
          rail,
          selection: amount(),
          displayName: name.value || undefined,
          privateMessage: message.value || undefined,
          turnstileToken: payToken,
        },
      });
      canRetryCreate = false;
      if ("checkoutUrl" in result) {
        checkout = result;
        current = result.status;
        if (result.qrCode)
          el<HTMLImageElement>("[data-qr]").src = await QRCode.toDataURL(result.qrCode, {
            margin: 4,
            width: 600,
            errorCorrectionLevel: "M",
          });
        showStatus(result.status);
        const destination = safeCheckout(result.checkoutUrl);
        if (rail === "polar" && destination) location.assign(destination);
      } else showStatus(result);
    } catch {
      el("[data-pay-error]").textContent =
        "Checkout could not be created. Recheck your receipt before starting another attempt.";
      await recheck();
    }
  }
  pay.addEventListener("click", () => void startPayment());
  el("[data-retry-create]").addEventListener("click", () => void startPayment(true));
  el("[data-recheck]").addEventListener("click", () => void recheck());
  el("[data-new]").addEventListener("click", () => {
    try {
      sessionStorage.removeItem("support-attempt");
    } catch {
      /* unavailable */
    }
    attempt = null;
    canRetryCreate = false;
    current = null;
    checkout = null;
    busy = false;
    el("[data-order]").hidden = false;
    el(".b-go").hidden = false;
    el("[data-status-panel]").hidden = true;
    el(".r-bar").hidden = false;
    el("[data-qr]").hidden = true;
    el("[data-stamp]").hidden = true;
    el("[data-receipt-status]").textContent = "PREVIEW · NOTHING IS CHARGED YET";
    if (payWidget) turnstile()?.reset(payWidget);
    payToken = "";
    preview();
  });
  el("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(checkout?.transferNote || "");
      el("[data-status-extra]").textContent = "Bank note copied.";
    } catch {
      el("[data-status-extra]").textContent =
        "Could not copy. Please copy the bank note from the receipt.";
    }
  });
  el("[data-save]").addEventListener("click", () => {
    try {
      const link = document.createElement("a");
      link.href = el<HTMLImageElement>("[data-qr]").src;
      link.download = "payment-qr.png";
      link.click();
    } catch {
      el("[data-status-extra]").textContent = "Could not save the QR image.";
    }
  });
  async function wall() {
    try {
      const data = await request<{
        reviews: { name: string | null; text: string; supporter: boolean }[];
        supporters: { name: string; presetCount: number | null; month: string }[];
      }>(base, "wall");
      const container = el("[data-wall]");
      container.replaceChildren();
      if (!data.reviews.length) {
        container.innerHTML =
          '<div class="b-empty"><div class="b-blank" aria-hidden="true"><p>NO NOTES YET</p><i></i><i></i><i class="s"></i></div><div><h3>Nothing printed yet</h3><p>The first note shows here after a quick check.</p></div></div>';
      } else {
        const list = document.createElement("ul");
        list.className = "b-stubs";
        data.reviews.forEach((review, index) => {
          const item = document.createElement("li");
          item.className = "b-stub";
          const number = document.createElement("span");
          number.className = "b-no";
          number.textContent = String(index + 1).padStart(2, "0");
          const content = document.createElement("div");
          const text = document.createElement("p");
          text.className = "b-q";
          text.textContent = review.text;
          const by = document.createElement("p");
          by.className = "b-by";
          by.textContent = `${review.name || "Anonymous"}${review.supporter ? " · supporter" : ""}`;
          content.append(text, by);
          item.append(number, content);
          list.append(item);
        });
        container.append(list);
      }
      const supporters = el("[data-supporters]");
      supporters.replaceChildren();
      if (!data.supporters.length)
        supporters.textContent =
          "Supporters who add a name appear here once their payment is confirmed.";
      else {
        const list = document.createElement("ul");
        list.className = "b-ledger";
        data.supporters.forEach((person) => {
          const item = document.createElement("li");
          for (const [className, value] of [
            ["b-lname", person.name],
            ["b-dots", ""],
            ["b-lc", person.presetCount ? `${person.presetCount} × CLAUDE` : "Custom support"],
            ["b-lm", person.month],
          ]) {
            const span = document.createElement("span");
            span.className = className ?? "";
            span.textContent = value ?? "";
            item.append(span);
          }
          list.append(item);
        });
        supporters.append(list);
      }
      el("[data-wall-retry]").hidden = true;
    } catch {
      el("[data-wall]").textContent = "Notes could not load right now.";
      el("[data-supporters]").textContent = "Supporters could not load right now.";
      el("[data-wall-retry]").hidden = false;
    }
  }
  el("[data-wall-retry]").addEventListener("click", () => void wall());
  el<HTMLFormElement>("[data-review-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    reviewSubmit.disabled = true;
    try {
      await request(base, "review", {
        body: {
          submissionId: reviewAttempt.id,
          submissionKey: reviewAttempt.key,
          text: el<HTMLTextAreaElement>("#review-text").value,
          displayName: el<HTMLInputElement>("#review-name").value || undefined,
          turnstileToken: reviewChallenge,
          reviewToken: reviewToken || undefined,
        },
      });
      el("[data-review-status]").textContent = "Thanks. Your note will appear after a quick check.";
      reviewToken = "";
      el("[data-badge]").hidden = true;
      reviewAttempt = { id: crypto.randomUUID(), key: secret() };
    } catch (error) {
      el("[data-review-status]").textContent =
        error instanceof Error && error.message === "token_unavailable"
          ? "Your badge is unavailable. You can submit without it."
          : "Your note could not be submitted. Please try again.";
      el("[data-without-badge]").hidden = !(
        error instanceof Error && error.message === "token_unavailable"
      );
    } finally {
      if (reviewWidget) turnstile()?.reset(reviewWidget);
      reviewChallenge = "";
    }
  });
  el("[data-without-badge]").addEventListener("click", () => {
    reviewToken = "";
    el("[data-badge]").hidden = true;
    el("[data-without-badge]").hidden = true;
    el("[data-review-status]").textContent = "Complete verification to submit without a badge.";
  });
  if (enabled) {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      const ts = turnstile();
      if (!ts) return;
      payWidget = ts.render("#pay-challenge", {
        sitekey: root.dataset.siteKey,
        action: "support_pay",
        callback: (token: string) => {
          payToken = token;
          el("[data-pay-error]").textContent = "";
          preview();
        },
        "expired-callback": () => {
          payToken = "";
          preview();
        },
      });
      reviewWidget = ts.render("#review-challenge", {
        sitekey: root.dataset.siteKey,
        action: "support_review",
        callback: (token: string) => {
          reviewChallenge = token;
          reviewSubmit.disabled = false;
        },
        "expired-callback": () => {
          reviewChallenge = "";
          reviewSubmit.disabled = true;
        },
      });
    };
    script.onerror = () => {
      el("[data-pay-error]").textContent = "Verification is unavailable. Please try again later.";
    };
    document.head.append(script);
    void wall();
    void geo();
  } else {
    geoPending = false;
    el("[data-wall]").textContent = "Notes are currently unavailable.";
    el("[data-supporters]").textContent = "Supporters are currently unavailable.";
    preview();
  }
  if (attempt && enabled && (!returnId || returnId === attempt.id)) {
    busy = true;
    const savedAttempt = attempt;
    void (async () => {
      if (checkoutId && hint === "success") {
        try {
          await request(base, `confirm/${savedAttempt.id}`, {
            attempt: savedAttempt,
            body: { checkoutId },
          });
        } catch {
          /* status remains authoritative */
        }
      }
      await recheck(false);
    })();
  } else if (root.dataset.returning === "true") {
    busy = true;
    el("[data-order]").hidden = true;
    el(".b-go").hidden = true;
    el("[data-status-panel]").hidden = false;
    el("[data-status-description]").textContent =
      "This browser tab has no matching receipt. Return to the tab where you started payment or contact Phu for help.";
    el("[data-recheck]").hidden = true;
    el("[data-new]").hidden = true;
  }
  setInterval(() => {
    if (current && attempt && !document.hidden && current.status !== "paid") void recheck(false);
  }, 15000);
  setInterval(() => {
    if (current?.expiresAt && current.status === "pending") {
      const seconds = Math.max(0, Math.ceil((Date.parse(current.expiresAt) - Date.now()) / 1000));
      if (seconds === 0) {
        showStatus({ ...current, status: "expired" }, false);
        void recheck(false);
        return;
      }
      el("[data-receipt-detail]").textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · NOTE ${checkout?.transferNote || "—"}`;
    }
  }, 1000);
}
