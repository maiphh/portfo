/** Home page entry: features first (they work without motion), motion last. */
import { initContact, initDevPanel, initNowMarker } from "./features";
import { initSelectedWork } from "./selected-work";
import { initMotion } from "./motion";
import { initActivity } from "./activity";
import { initHeroBg } from "./hero-bg";
import { USE_MOCKS } from "~/lib/flags";
import { trackSections } from "./analytics";

initHeroBg();
initDevPanel();
trackSections();
initSelectedWork();
if (!USE_MOCKS) void initActivity();
initNowMarker();
initContact();

// SplitText measures lines, so wait for the web fonts (capped, so the hero never waits long).
const fontsReady = document.fonts?.ready ?? Promise.resolve();
const cap = new Promise((r) => setTimeout(r, 1200));
void Promise.race([fontsReady, cap]).then(() => {
  initMotion();
});
