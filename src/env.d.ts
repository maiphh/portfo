interface ImportMetaEnv {
  /** "false" turns off the labelled sample data for backend features. Defaults to "true". */
  readonly PUBLIC_USE_MOCKS?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Set once the hero intro has started; the inline failsafe un-hides the hero otherwise. */
  __hero?: number;
}
