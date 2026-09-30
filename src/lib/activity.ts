import { NODE_API } from "./config";

// Reports something that happened in the browser to the activity log.
// Only the action and its context are sent — the server decides whether it
// is INFO, WARN, or ERROR (see backend/logger.js). Never throws.
export type ClientAction =
  | "logout" | "search_no_results" | "generation_slow" | "generation_failed"
  | "dataset_uploaded" | "dataset_upload_failed" | "dataset_previewed" | "dataset_exported"
  | "dataset_downloaded" | "locked_dataset_access" | "export_failed" | "quota_reached";

export function reportEvent(action: ClientAction, details: Record<string, unknown> = {}): void {
  const userId = localStorage.getItem("user_id");
  if (!userId) return;
  fetch(`${NODE_API}/api/activity/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, action_type: action, details: { ...details, page: window.location.pathname } }),
    keepalive: true, // still delivered if the page is navigating away (e.g. logout)
  }).catch(() => {});
}

// Generation taking longer than this is logged as a WARN
export const SLOW_GENERATION_MS = 3 * 60 * 1000;
