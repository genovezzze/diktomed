// The worker's demo backend (ASR_BACKEND=fake) returns the same fictional
// dictation for any audio. Such text must never pass as a real document.

export const DEMO_MODEL_PREFIX = "demo";

export function isDemoModel(modelName: string | null | undefined): boolean {
  return !!modelName && modelName.startsWith(DEMO_MODEL_PREFIX);
}

/** Approving demo text is allowed only on a machine explicitly set up for demos. */
export function demoApprovalAllowed(): boolean {
  return process.env.DEMO_MODE === "true";
}

export const DEMO_BANNER =
  "DEMO REŽĪMS: šis teksts ir izdomāts un neatbilst audio ierakstam. To nedrīkst izmantot pacientu dokumentācijā.";
