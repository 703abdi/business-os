// Customer-service training track for the crew. Each skill is marked
// not started / practicing / passed per person on their Team page.
export const TRAINING: { key: string; title: string; detail: string }[] = [
  { key: "greeting", title: "Arrival and greeting", detail: "Text 'on the way' with ETA, introduce yourself by name, confirm the service and any problem spots before starting." },
  { key: "expectations", title: "Setting expectations", detail: "Say what can and can't come out (deep scratches, old stains) before the detail, not after." },
  { key: "walkthrough", title: "Final walkthrough", detail: "Walk the customer around the service, point out the before/after, ask 'anything you want me to hit again?'" },
  { key: "review_ask", title: "Asking for the review", detail: "Ask in person while they're happy, then send the link by text before leaving." },
  { key: "package_pitch", title: "Maintenance plan pitch", detail: "Explain the monthly plan in 2 sentences and the founding rate. Log the answer on the detail." },
  { key: "complaints", title: "Handling a complaint", detail: "Listen, don't argue, offer to fix it on the spot, tell the owner the same day." },
  { key: "texting", title: "Texting customers", detail: "Full sentences, no slang, reply within 15 minutes during work hours, use the scripts in Sales." },
  { key: "photos", title: "Before/after photos", detail: "Same angles before and after: front 3/4, driver seat, carpets, wheels. Upload to the client file." },
];

export const TRAINING_STATUS = ["not_started", "practicing", "passed"] as const;
export const TRAINING_LABEL: Record<(typeof TRAINING_STATUS)[number], string> = {
  not_started: "Not started",
  practicing: "Practicing",
  passed: "Passed",
};
