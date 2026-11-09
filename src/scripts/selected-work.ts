import {
  shouldPlay,
  updateDemoMotion,
  updateDemoView,
  type DemoPlayback,
} from "~/lib/demo-playback";

const controllers = new WeakMap<HTMLElement, () => void>();

/** Returns a disposer; repeated initialization never wraps a video or subscribes twice. */
export function initSelectedWork(): () => void {
  const root = document.querySelector<HTMLElement>("#work[data-selected-work]");
  if (!root) return () => {};
  const existing = controllers.get(root);
  if (existing) return existing;
  const frame = root.querySelector<HTMLDivElement>("div.sw-video-frame");
  const video = frame?.querySelector("video");
  const nativeLink = root.querySelector<HTMLAnchorElement>(".sw-native-link");
  const message = root.querySelector<HTMLElement>(".sw-video-message");
  if (!frame || !video || !nativeLink || !message) return () => {};

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = frame.className;
  toggle.setAttribute("aria-controls", video.id);
  toggle.setAttribute("aria-describedby", "sw-demo-content sw-demo-description");
  video.controls = false;
  video.setAttribute("aria-hidden", "true");
  video.muted = true;
  video.defaultMuted = true;
  while (frame.firstChild) toggle.append(frame.firstChild);
  frame.replaceWith(toggle);
  const poster = toggle.querySelector<HTMLImageElement>(".sw-motion-poster");
  const cue = toggle.querySelector<HTMLElement>(".sw-paused-cue");
  const feedback = toggle.querySelector<HTMLElement>(".sw-feedback");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  const { signal } = listeners;
  let state: DemoPlayback = {
    inView: false,
    pageVisible: !document.hidden,
    userPaused: false,
    reducedMotion: reduce.matches,
    manualMotion: false,
  };
  let request = 0;
  let disposed = false;
  let mediaFailed = false;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let rowObserver: IntersectionObserver | undefined;
  let videoObserver: IntersectionObserver | undefined;
  const rows = [...root.querySelectorAll<HTMLElement>(".sw-row")];

  const renderControls = () => {
    const playing = !video.paused && !video.ended;
    toggle.setAttribute("aria-label", playing ? "Pause demo" : "Play demo");
    toggle.setAttribute("aria-pressed", String(playing));
    if (poster) poster.hidden = !(state.reducedMotion && !state.manualMotion);
    if (cue) cue.hidden = playing;
  };

  const reconcile = async () => {
    const ticket = ++request;
    if (disposed || !shouldPlay(state)) {
      video.pause();
      renderControls();
      return;
    }
    try {
      const attempt = video.play();
      renderControls();
      await attempt;
      // An old success cannot pause a newer allowed play; an old failure cannot change intent.
      if (disposed || !shouldPlay(state)) video.pause();
      if (!disposed && ticket === request && shouldPlay(state)) {
        nativeLink.hidden = true;
        message.textContent = "";
      }
    } catch (error: unknown) {
      if (
        disposed ||
        ticket !== request ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      state.userPaused = true;
      message.textContent =
        "Playback is unavailable here. Click the video to play, or open the demo.";
      nativeLink.hidden = false;
    }
    renderControls();
  };

  const flash = (action: "pause" | "play") => {
    clearTimeout(feedbackTimer);
    feedback
      ?.querySelector("path")
      ?.setAttribute("d", action === "pause" ? "M8 5v14M16 5v14" : "m8 5 11 7-11 7Z");
    if (feedback) feedback.dataset.action = action;
    feedback?.classList.add("is-visible");
    feedbackTimer = setTimeout(() => feedback?.classList.remove("is-visible"), 600);
  };

  toggle.addEventListener(
    "click",
    () => {
      if (!video.paused && !video.ended) {
        state.userPaused = true;
        flash("pause");
      } else {
        state.userPaused = false;
        state.manualMotion = true;
        if (mediaFailed) {
          mediaFailed = false;
          video.load();
        }
        flash("play");
      }
      void reconcile();
    },
    { signal },
  );
  video.addEventListener(
    "play",
    () => {
      if (!shouldPlay(state)) video.pause();
      renderControls();
    },
    { signal },
  );
  video.addEventListener("pause", renderControls, { signal });
  video.addEventListener("ended", renderControls, { signal });
  const mediaError = () => {
    mediaFailed = true;
    ++request;
    state.userPaused = true;
    video.pause();
    message.textContent =
      "The video could not load. The project summary and result figures are still available.";
    nativeLink.hidden = false;
    renderControls();
  };
  video.addEventListener("error", mediaError, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      state.pageVisible = !document.hidden;
      void reconcile();
    },
    { signal },
  );
  reduce.addEventListener(
    "change",
    () => {
      state = updateDemoMotion(state, reduce.matches);
      clearTimeout(feedbackTimer);
      feedback?.classList.remove("is-visible");
      configureRows();
      void reconcile();
    },
    { signal },
  );

  const applyView = (inView: boolean) => {
    state = updateDemoView(state, inView);
    void reconcile();
  };
  const measureView = () => {
    const r = toggle.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    applyView(r.width > 0 && r.height > 0 && w * h >= r.width * r.height * 0.25);
  };
  const configureRows = () => {
    rowObserver?.disconnect();
    root.classList.remove("sw-motion-ready");
    if (state.reducedMotion || typeof IntersectionObserver === "undefined") {
      rows.forEach((row) => row.classList.add("is-visible"));
      return;
    }
    rowObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            rowObserver?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -12px 0px" },
    );
    rows.forEach((row, index) => {
      row.style.setProperty("--sw-enter-delay", `${Math.min(index, 3) * 45}ms`);
      rowObserver?.observe(row);
    });
    root.classList.add("sw-motion-ready");
  };
  root.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof Element)
        event.target.closest(".sw-row")?.classList.add("is-visible");
    },
    { signal },
  );

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++request;
    listeners.abort();
    rowObserver?.disconnect();
    videoObserver?.disconnect();
    clearTimeout(feedbackTimer);
    video.pause();
    root.classList.remove("sw-motion-ready");
    if (poster) poster.hidden = true;
    if (cue) cue.hidden = true;
    feedback?.classList.remove("is-visible");
    video.controls = true;
    video.removeAttribute("aria-hidden");
    while (toggle.firstChild) frame.append(toggle.firstChild);
    toggle.replaceWith(frame);
    nativeLink.hidden = false;
    controllers.delete(root);
  };
  // Keep bfcache visits alive; real document disposal releases every subscription and timer.
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    { signal },
  );
  controllers.set(root, dispose);
  nativeLink.hidden = true;
  renderControls();
  configureRows();
  if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) mediaError();
  if (typeof IntersectionObserver !== "undefined") {
    videoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          applyView(entry.isIntersecting && entry.intersectionRatio >= 0.25);
      },
      { threshold: [0, 0.25, 1] },
    );
    videoObserver.observe(toggle);
  } else {
    window.addEventListener("scroll", measureView, { passive: true, signal });
    window.addEventListener("resize", measureView, { signal });
    measureView();
  }
  return dispose;
}
