/** Home page entry: features first (they work without motion), motion last. */
import {
  drawOcrLeaders,
  initAsk,
  initChart,
  initContact,
  initDevPanel,
  initMostRead,
  initNowMarker,
} from "./features";
import { initMotion } from "./motion";
import { initActivity } from "./activity";
import { initHeroBg } from "./hero-bg";
import { USE_MOCKS } from "~/lib/flags";
import { trackSections } from "./analytics";

initHeroBg();
initDevPanel();
trackSections();
initMostRead();
if (!USE_MOCKS) void initActivity();
initNowMarker();
initAsk();
initContact();
initChart();
drawOcrLeaders();

// SplitText measures lines, so wait for the web fonts (capped, so the hero never waits long).
const fontsReady = document.fonts?.ready ?? Promise.resolve();
const cap = new Promise((r) => setTimeout(r, 1200));
void Promise.race([fontsReady, cap]).then(() => {
  drawOcrLeaders();
  initMotion(drawOcrLeaders);
});
