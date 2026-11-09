/** Visibility gates apply even to explicit play. User pause always wins over autoplay. */
export interface DemoPlayback {
  inView: boolean;
  pageVisible: boolean;
  userPaused: boolean;
  reducedMotion: boolean;
  manualMotion: boolean;
}

export function shouldPlay(state: DemoPlayback): boolean {
  return (
    state.inView &&
    state.pageVisible &&
    !state.userPaused &&
    (!state.reducedMotion || state.manualMotion)
  );
}

export function updateDemoView(state: DemoPlayback, inView: boolean): DemoPlayback {
  return {
    ...state,
    inView,
    manualMotion: !inView && state.reducedMotion ? false : state.manualMotion,
  };
}

export function updateDemoMotion(state: DemoPlayback, reducedMotion: boolean): DemoPlayback {
  return { ...state, reducedMotion, manualMotion: false };
}
