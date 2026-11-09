export type IntegrationProvider = { key: string; name: string; what: string; env?: string[]; comingSoon?: boolean };

// Only list settings that the application actually reads. Providers without a
// working connection are marked as coming soon rather than suggesting unused credentials.
export const INTEGRATIONS: IntegrationProvider[] = [
  { key: "meta", name: "Meta Ads", what: "Ad-spend imports and campaign sync readiness.", env: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"] },
  { key: "google_ads", name: "Google Ads", what: "Ad-spend imports and campaign sync readiness.", env: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"] },
  { key: "google_business", name: "Google Business Profile", what: "Reviews and posts are managed manually today.", comingSoon: true },
  { key: "instagram", name: "Instagram", what: "Content scheduling works now; direct publishing is coming soon.", comingSoon: true },
  { key: "tiktok", name: "TikTok", what: "Content scheduling works now; direct publishing is coming soon.", comingSoon: true },
  { key: "facebook", name: "Facebook", what: "Direct publishing is coming soon.", comingSoon: true },
  { key: "youtube", name: "YouTube", what: "Direct publishing is coming soon.", comingSoon: true },
  { key: "acuity", name: "Acuity", what: "Native booking webhooks create and update appointments.", env: ["ACUITY_USER_ID", "ACUITY_API_KEY"] },
  { key: "calendly", name: "Calendly", what: "Calendar sync uses the connected account token; webhook signing is stored securely in the database.", env: ["CALENDLY_TOKEN"] },
  { key: "whop", name: "Whop", what: "Existing payment webhook.", env: ["WHOP_WEBHOOK_SECRET"] },
  { key: "stripe", name: "Stripe", what: "Payment-plan collection is coming soon.", comingSoon: true },
  { key: "brevo", name: "Brevo", what: "Email blasts use it when configured.", env: ["BREVO_API_KEY", "BLAST_FROM_EMAIL"] },
  { key: "gmail", name: "Gmail", what: "Optional sender for alerts and email verification.", env: ["GMAIL_USER", "GMAIL_APP_PASSWORD"] },
  { key: "telnyx", name: "Telnyx SMS and calls", what: "60-second lead reply, missed-call text-back and STOP handling. Off (console test mode) until all three keys are set. Settings > Messaging has the webhook URLs.", env: ["TELNYX_API_KEY", "TELNYX_PUBLIC_KEY", "TELNYX_FROM_NUMBER"] },
  { key: "twilio", name: "Twilio SMS", what: "Not built. Telnyx is the supported texting provider.", comingSoon: true },
  { key: "google_calendar", name: "Google Calendar", what: "Calendar sync is coming soon.", comingSoon: true },
  { key: "webhooks", name: "Zapier / Make / webhooks", what: "Incoming relays can send the legacy Acuity JSON format.", env: ["ACUITY_WEBHOOK_SECRET"] },
  { key: "content_api", name: "Outside content bot", what: "Reads due posts and marks them posted.", env: ["CONTENT_API_TOKEN"] },
];
