import QRCode from "qrcode";
import { feedReceipt, printReceipt } from "./motion";
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
  let paymentPayload: {
    rail: Rail;
    selection: Selection;
    displayName?: string;
    privateMessage?: string;
  } | null = null;
  let badgePending = false;
  let badgeChoiceRequired = false;
  let deadlinePassed = false;
  let statusSequence = 0;
  let paymentSequence = 0;
  let renderedStatus: Status["status"] | null = null;
  let pollFailures = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (returnId && attempt?.id !== returnId) {
      const previous = sessionStorage.getItem(`support-attempt:${returnId}`);
      attempt = previous ? (JSON.parse(previous) as Attempt) : null;
    }
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
    const previous = selection;
    selection = button.dataset.amount as typeof selection;
    preview();
    if (!current && previous !== selection) feedReceipt(root);
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
  custom.addEventListener("input", () => {
    if (!current && selection === "custom") feedReceipt(root);
  });
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
    sessionStorage.setItem(`support-attempt:${a.id}`, JSON.stringify(a));
    sessionStorage.setItem("support-attempt", JSON.stringify(a));
  }
  function previousReceipts() {
    const links = el("[data-receipt-links]");
    links.replaceChildren();
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith("support-attempt:")) continue;
        const id = key.slice("support-attempt:".length);
        if (id === attempt?.id) continue;
        const link = document.createElement("a");
        link.className = "b-button b-outline";
        link.href = `/support/return/?id=${encodeURIComponent(id)}`;
        link.textContent = `Receipt ${id.slice(0, 8)}`;
        links.append(link);
      }
    } catch {
      /* Storage may be unavailable. */
    }
    el("[data-previous-receipts]").hidden = !links.childElementCount;
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
    if (
      status.status === "pending" &&
      status.expiresAt &&
      Date.parse(status.expiresAt) <= Date.now()
    )
      deadlinePassed = true;
    if (status.status === "expired") deadlinePassed = true;
    if (status.status === "pending" && deadlinePassed) status = { ...status, status: "expired" };
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
    const stampChanged = (paid || expired || failed) && renderedStatus !== status.status;
    const statusChanged = renderedStatus !== status.status;
    renderedStatus = status.status;
    if (status.status !== "pending") el("[data-receipt-detail]").textContent = "";
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
    el("[data-new]").hidden = false;
    el("[data-new]").textContent =
      status.status === "pending" ? "Change amount" : "Start a new attempt";
    el("[data-copy]").hidden = !checkout?.transferNote || paid || expired || failed;
    el("[data-save]").hidden = !checkout?.qrCode || paid || expired || failed;
    el("[data-qr]").hidden = !checkout?.qrCode || paid || expired || failed;
    el("[data-status-extra]").textContent =
      checkout?.qrCode && !paid && !expired && !failed
        ? "On a phone? Save the QR, then pick it from your banking app’s scan screen."
        : "";
    if (focus) heading.focus();
    if (statusChanged && (focus || stampChanged)) printReceipt(root, stampChanged);
    if (paid) void claim();
  }
  function updateReviewSubmit() {
    reviewSubmit.disabled = !reviewChallenge || badgePending || badgeChoiceRequired;
  }
  async function claim() {
    if (!attempt || reviewToken || badgePending) return;
    const requestedAttempt = attempt;
    badgePending = true;
    badgeChoiceRequired = true;
    updateReviewSubmit();
    el("[data-review-status]").textContent = "Getting your supporter badge…";
    try {
      const result = await request<{ reviewToken: string }>(
        base,
        `review-token/${requestedAttempt.id}`,
        {
          attempt: requestedAttempt,
          body: {},
        },
      );
      if (attempt !== requestedAttempt) return;
      reviewToken = result.reviewToken;
      badgeChoiceRequired = false;
      el("[data-badge]").hidden = false;
      el("[data-retry-badge]").hidden = true;
      el("[data-without-badge]").hidden = true;
      el("[data-review-status]").textContent = "";
    } catch {
      if (attempt !== requestedAttempt) return;
      el("[data-review-status]").textContent =
        "Your supporter badge could not be loaded. Retry or continue without it.";
      el("[data-retry-badge]").hidden = false;
      el("[data-without-badge]").hidden = false;
    } finally {
      badgePending = false;
      updateReviewSubmit();
    }
  }
  el("[data-retry-badge]").addEventListener("click", () => void claim());
  async function loadCheckout(requestedAttempt: Attempt, sequence: number) {
    try {
      const result = await request<Checkout>(base, `checkout/${requestedAttempt.id}`, {
        attempt: requestedAttempt,
      });
      const qr = result.qrCode
        ? await QRCode.toDataURL(result.qrCode, {
            margin: 4,
            width: 600,
            errorCorrectionLevel: "M",
          })
        : null;
      if (
        sequence !== statusSequence ||
        attempt !== requestedAttempt ||
        current?.status !== "pending"
      )
        return;
      checkout = result;
      if (qr) el<HTMLImageElement>("[data-qr]").src = qr;
    } catch {
      if (sequence === statusSequence && attempt === requestedAttempt) checkout = null;
    }
  }
  async function recheck(focus = true) {
    if (!attempt || current?.status === "paid") return;
    const requestedAttempt = attempt;
    const sequence = ++statusSequence;
    try {
      const status = await request<Status>(base, `status/${requestedAttempt.id}`, {
        attempt: requestedAttempt,
      });
      if (sequence !== statusSequence || attempt !== requestedAttempt || current?.status === "paid")
        return;
      current = status;
      if (status.status === "pending" && !checkout) await loadCheckout(requestedAttempt, sequence);
      if (
        sequence !== statusSequence ||
        attempt !== requestedAttempt ||
        (current?.status === "paid" && status.status !== "paid")
      )
        return;
      pollFailures = 0;
      showStatus(status, focus);
    } catch (error) {
      if (sequence !== statusSequence || attempt !== requestedAttempt || current?.status === "paid")
        return;
      pollFailures = Math.min(pollFailures + 1, 4);
      el("[data-order]").hidden = true;
      el(".b-go").hidden = true;
      el("[data-status-panel]").hidden = false;
      el("[data-new]").hidden = !(error instanceof Error && error.message === "not_found");
      el("[data-retry-create]").hidden = !canRetryCreate;
      if (canRetryCreate) {
        el(".b-go").hidden = false;
        el<HTMLButtonElement>("[data-retry-create]").disabled = !payToken;
      }
      el("[data-status-description]").textContent =
        "Status is unavailable. Please recheck shortly.";
    }
  }
  async function startPayment(retry = false) {
    if ((busy && !retry) || !payToken) return;
    const quote = quoteDonation(rail, amount());
    if (!retry && !quote) {
      el("[data-pay-error]").textContent = "Enter an amount within the stated range and step.";
      custom.focus();
      return;
    }
    const invalidText = (value: string, multiline: boolean) => {
      const normalized = value.replace(/\r\n?/g, "\n");
      return (
        /[<>]|https?:\/\/|www\./i.test(normalized) ||
        [...normalized].some((char) => {
          const code = char.charCodeAt(0);
          return (code < 32 && !(multiline && code === 10)) || (code >= 127 && code <= 159);
        })
      );
    };
    const invalid = invalidText(name.value, false)
      ? name
      : invalidText(message.value, true)
        ? message
        : null;
    if (!retry && invalid) {
      el<HTMLDetailsElement>(".b-more").open = true;
      el("[data-pay-error]").textContent =
        `Please remove links, angle brackets, and control characters from the ${invalid === name ? "name" : "message"}.`;
      invalid.focus();
      return;
    }
    try {
      if (!retry) {
        paymentPayload = {
          rail,
          selection: amount(),
          displayName: name.value || undefined,
          privateMessage: message.value || undefined,
        };
        attempt = { id: crypto.randomUUID(), key: secret() };
        store(attempt);
        previousReceipts();
      }
      if (!attempt || !paymentPayload) throw new Error("Missing receipt");
    } catch {
      el("[data-pay-error]").textContent =
        "Storage is unavailable. Enable session storage to continue securely.";
      return;
    }
    busy = true;
    const requestedAttempt = attempt;
    const sequence = ++paymentSequence;
    canRetryCreate = true;
    preview();
    el("[data-retry-create]").hidden = true;
    el("[data-pay-error]").textContent = "Creating your checkout…";
    try {
      const result = await request<Checkout | Status>(base, "pay", {
        body: {
          id: attempt.id,
          receiptKey: attempt.key,
          ...paymentPayload,
          turnstileToken: payToken,
        },
      });
      if (
        sequence !== paymentSequence ||
        attempt !== requestedAttempt ||
        current?.status === "paid"
      )
        return;
      if ("checkoutUrl" in result) {
        const qr = result.qrCode
          ? await QRCode.toDataURL(result.qrCode, {
              margin: 4,
              width: 600,
              errorCorrectionLevel: "M",
            })
          : null;
        if (
          sequence !== paymentSequence ||
          attempt !== requestedAttempt ||
          current?.status === "paid"
        )
          return;
        statusSequence++;
        canRetryCreate = false;
        el("[data-pay-error]").textContent = "";
        checkout = result;
        current = result.status;
        if (qr) el<HTMLImageElement>("[data-qr]").src = qr;
        showStatus(result.status);
        const destination = safeCheckout(result.checkoutUrl);
        if (rail === "polar" && destination) location.assign(destination);
      } else {
        statusSequence++;
        canRetryCreate = false;
        el("[data-pay-error]").textContent = "";
        showStatus(result);
      }
    } catch (error) {
      if (
        sequence !== paymentSequence ||
        attempt !== requestedAttempt ||
        current?.status === "paid"
      )
        return;
      payToken = "";
      if (error instanceof Error && error.message === "invalid_fields") {
        busy = false;
        canRetryCreate = false;
        try {
          if (!retry && attempt) sessionStorage.removeItem(`support-attempt:${attempt.id}`);
          sessionStorage.removeItem("support-attempt");
        } catch {
          /* Storage may be unavailable. */
        }
        attempt = null;
        previousReceipts();
        el("[data-order]").hidden = false;
        el("[data-status-panel]").hidden = true;
        el(".b-go").hidden = false;
        pay.hidden = false;
        el("[data-pay-help]").hidden = false;
        el<HTMLDetailsElement>(".b-more").open = true;
        el("[data-pay-error]").textContent =
          "Check the amount, name and message, then try again. Names and messages cannot contain links or angle brackets.";
        if (payWidget) turnstile()?.reset(payWidget);
        preview();
        name.focus();
        return;
      }
      el(".b-go").hidden = false;
      pay.hidden = true;
      el("[data-pay-help]").hidden = true;
      if (payWidget) turnstile()?.reset(payWidget);
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
      if (attempt) sessionStorage.setItem(`support-attempt:${attempt.id}`, JSON.stringify(attempt));
      sessionStorage.removeItem("support-attempt");
    } catch {
      /* unavailable */
    }
    statusSequence++;
    paymentSequence++;
    history.replaceState(
      { ...history.state, supportReturn: null },
      "",
      location.pathname + location.hash,
    );
    attempt = null;
    canRetryCreate = false;
    paymentPayload = null;
    reviewToken = "";
    badgeChoiceRequired = false;
    el("[data-badge]").hidden = true;
    el("[data-retry-badge]").hidden = true;
    el("[data-without-badge]").hidden = true;
    el("[data-review-status]").textContent = "";
    updateReviewSubmit();
    current = null;
    renderedStatus = null;
    checkout = null;
    deadlinePassed = false;
    busy = false;
    el("[data-order]").hidden = false;
    el(".b-go").hidden = false;
    pay.hidden = false;
    el("[data-pay-help]").hidden = false;
    el("[data-status-panel]").hidden = true;
    el(".r-bar").hidden = false;
    el("[data-qr]").hidden = true;
    el("[data-stamp]").hidden = true;
    el("[data-receipt-status]").textContent = "PREVIEW · NOTHING IS CHARGED YET";
    el("[data-receipt-detail]").textContent = "";
    el("[data-pay-error]").textContent = "";
    previousReceipts();
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
      el<HTMLTextAreaElement>("#review-text").value = "";
      el<HTMLInputElement>("#review-name").value = "";
      reviewToken = "";
      el("[data-badge]").hidden = true;
      reviewAttempt = { id: crypto.randomUUID(), key: secret() };
    } catch (error) {
      if (error instanceof Error && error.message === "idempotency_conflict") {
        reviewAttempt = { id: crypto.randomUUID(), key: secret() };
        el("[data-review-status]").textContent =
          "Your earlier note may already have been received. Submit again only if you want to send this edited note as a new submission.";
        el("[data-without-badge]").hidden = true;
        return;
      }
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
    badgeChoiceRequired = false;
    el("[data-without-badge]").hidden = true;
    el("[data-retry-badge]").hidden = true;
    el("[data-review-status]").textContent = "Complete verification to submit without a badge.";
    updateReviewSubmit();
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
        size: "compact",
        callback: (token: string) => {
          payToken = token;
          el<HTMLButtonElement>("[data-retry-create]").disabled = false;
          if (el("[data-pay-error]").textContent?.trim() === "Preparing secure payment…")
            el("[data-pay-error]").textContent = "";
          preview();
        },
        "expired-callback": () => {
          payToken = "";
          el<HTMLButtonElement>("[data-retry-create]").disabled = true;
          preview();
        },
      });
      reviewWidget = ts.render("#review-challenge", {
        sitekey: root.dataset.siteKey,
        action: "support_review",
        size: "compact",
        callback: (token: string) => {
          reviewChallenge = token;
          updateReviewSubmit();
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
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(
      async () => {
        if (
          enabled &&
          attempt &&
          !document.hidden &&
          (current ? ["pending", "creating"].includes(current.status) : busy && pollFailures > 0)
        )
          await recheck(false);
        schedulePoll();
      },
      Math.min(3000 * 2 ** pollFailures, 48000),
    );
  }
  document.addEventListener("visibilitychange", () => {
    if (
      !document.hidden &&
      enabled &&
      attempt &&
      (current ? ["pending", "creating"].includes(current.status) : busy && pollFailures > 0)
    ) {
      void recheck(false).finally(schedulePoll);
    }
  });
  schedulePoll();
  previousReceipts();
  setInterval(() => {
    if (current?.expiresAt && current.status === "pending") {
      const seconds = Math.max(0, Math.ceil((Date.parse(current.expiresAt) - Date.now()) / 1000));
      if (seconds === 0) {
        showStatus({ ...current, status: "expired" }, false);
        return;
      }
      el("[data-receipt-detail]").textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · NOTE ${checkout?.transferNote || "—"}`;
    }
  }, 1000);
}
