// Settings > Messaging: provider status, Telnyx webhook URLs, the two templates, texting hours, test button.
import { Badge, Card, btn, input, label } from "@/components/app/ui";
import { CopyButton, Submit } from "@/components/app/client";
import { prisma } from "@/lib/prisma";
import { messagingStatus, TELNYX_ENV } from "@/lib/messaging/provider";
import { resolveConfig } from "@/lib/messaging/settings";
import { webhookUrls } from "@/lib/messaging";
import { renderSms, smsSegments, TEMPLATE_LABEL, TEMPLATE_VARS, firstNameOf } from "@/lib/messaging/templates";
import { saveMessagingSettings, sendTestMessage } from "@/modules/settings/messaging-actions";

const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: h, label: h === 0 || h === 24 ? "12 am" : h === 12 ? "12 pm" : h < 12 ? `${h} am` : `${h - 12} pm` }));
const STATUS_COLOR = { sent: "green", delivered: "green", received: "blue", queued: "amber", sending: "amber", skipped: "gray", canceled: "gray", failed: "red" } as const;

export async function MessagingCard({ ok, error }: { ok?: string; error?: string }) {
  const [row, recent, queued] = await Promise.all([
    prisma.messagingSettings.findUnique({ where: { id: "default" } }),
    prisma.message.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.message.count({ where: { status: "queued" } }),
  ]);
  const cfg = resolveConfig(row);
  const status = messagingStatus();
  const urls = webhookUrls();
  const live = status.provider === "telnyx";
  const preview = (tpl: string, name: string) => renderSms(tpl, { first_name: firstNameOf(name), business_name: cfg.businessName, booking_link: cfg.bookingUrl || "[booking link]" });

  return (
    <Card title={<span id="messaging" className="scroll-mt-24">Messaging (texts)</span>} action={<Badge color={live ? "green" : "gray"}>{live ? "Telnyx: live texts" : "Console: test mode"}</Badge>}>
      <div className="space-y-5 text-sm">
        {ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-green-800">{ok}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}

        <div>
          {live ? (
            <p>Texts go out through Telnyx from <code>{status.fromNumber}</code>.{status.forwardTo ? <> Incoming calls ring <code>{status.forwardTo}</code> first.</> : " Calls are not forwarded (set TELNYX_FORWARD_TO to ring your phone first)."}</p>
          ) : (
            <p>Test mode. Texts are written to the log below and never reach a phone. To go live, add <code>{status.missing.join(", ")}</code> in Vercel and redeploy. All three of {TELNYX_ENV.join(", ")} are needed.</p>
          )}
          {!cfg.bookingUrl && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Add a booking link below. Without it, texts that use {"{{booking_link}}"} are not sent.</p>}
          {queued > 0 && <p className="mt-2 text-muted">{queued} text{queued === 1 ? " is" : "s are"} waiting for the texting window to open.</p>}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Webhook URLs to paste into Telnyx</h3>
          <dl className="space-y-2">
            <div><dt className="text-xs text-muted">Messaging profile, inbound webhook (texts, STOP, delivery updates)</dt><dd className="flex items-center gap-2"><code className="break-all">{urls.sms}</code><CopyButton text={urls.sms} /></dd></div>
            <div><dt className="text-xs text-muted">Voice API application webhook (calls, for missed-call text-back)</dt><dd className="flex items-center gap-2"><code className="break-all">{urls.voice}</code><CopyButton text={urls.voice} /></dd></div>
          </dl>
        </div>

        <form action={saveMessagingSettings} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2"><input type="checkbox" name="leadReplyEnabled" defaultChecked={cfg.leadReplyEnabled} className="mt-1" /><span><span className="font-medium">60-second lead reply</span><br /><span className="text-xs text-muted">Texts a new lead right away, only if their form showed the consent line. Adds a call-back task for you.</span></span></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="missedCallEnabled" defaultChecked={cfg.missedCallEnabled} className="mt-1" /><span><span className="font-medium">Missed-call text-back</span><br /><span className="text-xs text-muted">Texts a caller nobody answered, once per number per {cfg.dedupeHours} hours. New callers become leads.</span></span></label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label} htmlFor="m-name">Business name in texts</label><input id="m-name" name="businessName" className={input} defaultValue={row?.businessName ?? ""} placeholder={cfg.businessName} /></div>
            <div><label className={label} htmlFor="m-book">Booking link</label><input id="m-book" name="bookingUrl" className={input} defaultValue={row?.bookingUrl ?? ""} placeholder={cfg.bookingUrl || "https://calendly.com/your-business"} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={label} htmlFor="m-from">Texts go out from</label><select id="m-from" name="quietStartHour" className={input} defaultValue={cfg.quietStartHour}>{HOURS.slice(0, 24).map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select></div>
            <div><label className={label} htmlFor="m-to">Until</label><select id="m-to" name="quietEndHour" className={input} defaultValue={cfg.quietEndHour}>{HOURS.slice(1).map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select></div>
            <div><label className={label} htmlFor="m-tz">Business time zone</label><input id="m-tz" name="timezone" className={input} defaultValue={row?.timezone ?? ""} placeholder={cfg.timezone} /></div>
          </div>
          <p className="text-xs text-muted">Outside these hours, texts wait and go out when the window opens.</p>

          {([["leadReplyTemplate", "lead_reply", cfg.leadReplyTemplate, "Sam Lee"], ["missedCallTemplate", "missed_call", cfg.missedCallTemplate, ""]] as const).map(([name, key, tpl, who]) => (
            <div key={name}>
              <label className={label} htmlFor={`m-${name}`}>{TEMPLATE_LABEL[key]} text</label>
              <textarea id={`m-${name}`} name={name} rows={3} className={input} defaultValue={tpl} />
              <p className="mt-1 text-xs text-muted">Preview ({smsSegments(preview(tpl, who))} segment{smsSegments(preview(tpl, who)) === 1 ? "" : "s"}): {preview(tpl, who)}</p>
            </div>
          ))}
          <p className="text-xs text-muted">
            Variables you can use: {Object.entries(TEMPLATE_VARS).map(([k, v], i) => <span key={k}>{i ? ", " : ""}<code>{`{{${k}}}`}</code> ({v})</span>)}. Every text must name the business and keep a STOP line.
          </p>
          <Submit className={btn.primary}>Save messaging settings</Submit>
        </form>

        <form action={sendTestMessage} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div><label className={label} htmlFor="m-test-to">Test number</label><input id="m-test-to" name="to" className={input} placeholder="(571) 555-0100" /></div>
          <div><label className={label} htmlFor="m-test-t">Template</label><select id="m-test-t" name="template" className={input}><option value="lead_reply">Lead reply</option><option value="missed_call">Missed-call text-back</option></select></div>
          <Submit className={btn.outline} pending="Logging...">Send test (console only)</Submit>
          <p className="w-full text-xs text-muted">The test never texts anyone, even with Telnyx connected. It renders the saved template and adds it to the log.</p>
        </form>

        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent messages</h3>
          {recent.length === 0 ? <p className="text-muted">No texts yet.</p> : (
            <ul className="divide-y divide-border">
              {recent.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-2 py-2">
                  <Badge color={STATUS_COLOR[m.status as keyof typeof STATUS_COLOR] ?? "gray"}>{m.status}</Badge>
                  <span className="text-xs text-muted">{m.direction === "inbound" ? `from ${m.fromNumber}` : `to ${m.toNumber}`} · {TEMPLATE_LABEL[m.template] ?? m.template} · {m.provider}{m.isSample ? " · sample" : ""} · {m.createdAt.toLocaleString("en-US", { timeZone: cfg.timezone, dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="w-full text-[13px]">{m.body || <em className="text-muted">(no text)</em>}{m.error && <span className="block text-xs text-muted">{m.error}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
