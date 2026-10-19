/** Home page entry: features first (they work without motion), motion last. */
import {
  drawOcrLeaders,
  initAsk,
  initChart,
  initContact,
  initDevPanel,
  initHeatmap,
  initMostRead,
  initNowMarker,
} from "./features";
import { initMotion } from "./motion";
import { trackSections } from "./analytics";

initDevPanel();
trackSections();
initMostRead();
initHeatmap();
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
