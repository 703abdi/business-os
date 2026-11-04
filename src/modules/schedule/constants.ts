import type { BadgeColor } from "@/components/app/ui";

export const JOB_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELED", "NO_SHOW"] as const;
export type JobStatusKey = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABEL: Record<JobStatusKey, string> = {
  SCHEDULED: "Unconfirmed",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELED: "Canceled",
  NO_SHOW: "No-show",
};
export const JOB_STATUS_COLOR: Record<JobStatusKey, BadgeColor> = {
  SCHEDULED: "amber",
  CONFIRMED: "teal",
  IN_PROGRESS: "blue",
  DONE: "green",
  CANCELED: "gray",
  NO_SHOW: "red",
};
/** Statuses that take up a slot on the calendar. */
export const ACTIVE_JOB: JobStatusKey[] = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "DONE"];
