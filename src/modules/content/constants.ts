export const CONTENT_STATUSES = ["IDEA", "SCRIPTED", "READY_TO_FILM", "FILMED", "EDITED", "SCHEDULED", "POSTED", "ARCHIVED"] as const;
export type ContentStatusKey = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABEL: Record<ContentStatusKey, string> = {
  IDEA: "Idea", SCRIPTED: "Scripted", READY_TO_FILM: "Ready to film", FILMED: "Filmed",
  EDITED: "Edited", SCHEDULED: "Scheduled", POSTED: "Posted", ARCHIVED: "Archived",
};
export const CONTENT_STATUS_COLOR: Record<ContentStatusKey, "gray" | "blue" | "teal" | "amber" | "purple" | "green" | "red"> = {
  IDEA: "gray", SCRIPTED: "blue", READY_TO_FILM: "teal", FILMED: "amber", EDITED: "purple", SCHEDULED: "blue", POSTED: "green", ARCHIVED: "gray",
};
export const CONTENT_FORMATS = ["Short-form", "Long-form", "Carousel", "Story", "Photo post", "Custom"] as const;
export const CONTENT_PLATFORMS = ["Instagram", "TikTok", "Facebook", "YouTube", "Google Business"] as const;
export const CONTENT_POST_STATUSES = ["SCHEDULED", "POSTED", "MISSED"] as const;
export const CONTENT_POST_STATUS_LABEL = { SCHEDULED: "Scheduled", POSTED: "Posted", MISSED: "Missed" } as const;
