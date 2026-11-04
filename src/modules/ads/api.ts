// Ad platform API connections. Stubbed: numbers are entered by hand on the
// Ads page for now. To connect later, implement these and call them from a
// cron route that writes AdStat rows (one per campaign per day).
//
// Meta Marketing API: GET /v21.0/act_{META_AD_ACCOUNT_ID}/insights
//   ?level=campaign&fields=campaign_id,campaign_name,spend,actions&time_increment=1
//   with META_ACCESS_TOKEN (system user token with ads_read).
// Google Ads API: GoogleAdsService.SearchStream with a developer token,
//   OAuth refresh token and customer id (GOOGLE_ADS_*).

export function adApiStatus() {
  return {
    meta: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
    google: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID),
  };
}

export async function syncMetaAds(): Promise<{ ok: false; reason: string }> {
  return { ok: false, reason: "Meta sync is not built yet. Enter weekly numbers by hand on the Ads page." };
}

export async function syncGoogleAds(): Promise<{ ok: false; reason: string }> {
  return { ok: false, reason: "Google Ads sync is not built yet. Enter weekly numbers by hand on the Ads page." };
}
