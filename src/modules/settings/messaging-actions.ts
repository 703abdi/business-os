"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { validateTemplate, DEFAULT_TEMPLATES, type TemplateKey } from "@/lib/messaging/templates";
import { validTimeZone } from "@/lib/messaging/rules";
import { toE164 } from "@/lib/messaging/phone";
import { prismaStore } from "@/lib/messaging/prisma-store";
import { sendTest } from "@/lib/messaging/service";

const back = (key: "ok" | "error", msg: string): never => redirect(`/settings?messaging_${key}=${encodeURIComponent(msg)}#messaging`);
const text = (f: FormData, k: string, max = 600) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveMessagingSettings(form: FormData) {
  await requireAdmin();
  const leadReplyTemplate = text(form, "leadReplyTemplate");
  const missedCallTemplate = text(form, "missedCallTemplate");
  const bookingUrl = text(form, "bookingUrl", 300);
  const timezone = text(form, "timezone", 60);
  const start = Number(form.get("quietStartHour"));
  const end = Number(form.get("quietEndHour"));

  const problems = [
    ...validateTemplate(leadReplyTemplate || DEFAULT_TEMPLATES.lead_reply).map((e) => `Lead reply: ${e}`),
    ...validateTemplate(missedCallTemplate || DEFAULT_TEMPLATES.missed_call).map((e) => `Missed-call text: ${e}`),
  ];
  if (bookingUrl && !/^https:\/\/\S+$/i.test(bookingUrl)) problems.push("The booking link must start with https://");
  if (timezone && !validTimeZone(timezone)) problems.push(`"${timezone}" is not a time zone. Use a name like America/New_York.`);
  if (!(start >= 0 && start <= 23 && end >= 1 && end <= 24 && end > start)) problems.push("Texting hours: the end hour must be after the start hour.");
  if (problems.length) back("error", problems.join(" "));

  const data = {
    leadReplyEnabled: form.get("leadReplyEnabled") === "on",
    missedCallEnabled: form.get("missedCallEnabled") === "on",
    // Saving the default text stores "" so future template improvements still reach this install.
    leadReplyTemplate: leadReplyTemplate === DEFAULT_TEMPLATES.lead_reply ? "" : leadReplyTemplate,
    missedCallTemplate: missedCallTemplate === DEFAULT_TEMPLATES.missed_call ? "" : missedCallTemplate,
    businessName: text(form, "businessName", 120),
    bookingUrl,
    timezone,
    quietStartHour: start,
    quietEndHour: end,
  };
  await prisma.messagingSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  revalidatePath("/settings");
  back("ok", "Messaging settings saved.");
}

/** Test button: always the console provider, so nobody gets a text. */
export async function sendTestMessage(form: FormData) {
  await requireAdmin();
  const to = toE164(text(form, "to", 40));
  const template = (text(form, "template", 20) === "missed_call" ? "missed_call" : "lead_reply") as TemplateKey;
  if (!to) back("error", "Type a phone number for the test, like (571) 555-0100.");
  const r = await sendTest(prismaStore, to!, template);
  revalidatePath("/settings");
  back("ok", `Test logged (console only, nothing was texted): ${r.body}`);
}
