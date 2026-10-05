import { NODE_API, PYTHON_API } from "./config";

// ── Login session for every backend request ──────────────────────────────────
// After login, the server gives us a signed token (localStorage "auth_token").
// This wraps window.fetch once so every call to the Node or Python backend sends
// it as "Authorization: Bearer <token>" — the servers identify the user from the
// token, not from a user_id in the request. If a backend says the session is
// missing or expired, the user is signed out and sent to the login page.

const SESSION_KEYS = ["user_id", "user_name", "is_admin", "is_instructor", "auth_token", "instructor", "last_path"];

export function clearSession(): void {
  SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
}

// Logout: tell the server to end the session (the old token stops working there,
// and the server logs the logout). Call this BEFORE clearing localStorage.
export function endServerSession(): void {
  if (!localStorage.getItem("auth_token")) return;
  fetch(`${NODE_API}/api/auth/logout`, { method: "POST", keepalive: true }).catch(() => {});
}

function isBackendUrl(url: string): boolean {
  return url.startsWith(NODE_API) || url.startsWith(PYTHON_API);
}

export function installAuthFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const token = localStorage.getItem("auth_token");

    if (token && isBackendUrl(url)) {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      init = { ...init, headers };
    }

    const res = await originalFetch(input, init);

    if ((res.status === 401 || res.status === 403) && isBackendUrl(url) && localStorage.getItem("user_id")) {
      const body = await res.clone().json().catch(() => null);
      const code = body?.error ?? body?.detail?.error;
      const onLogin = window.location.pathname.startsWith("/login");
      if (code === "banned" && !onLogin) {
        // Banned (e.g. 3rd strike) → signed out immediately, wherever they are in the app
        clearSession();
        window.location.assign("/login?session=banned");
      } else if (res.status === 401 && code === "auth_required" && !onLogin) {
        clearSession();
        window.location.assign("/login?session=expired");
      }
    }
    return res;
  };
}

// Downloads a backend file with the login token attached (a plain <a href> can't send it)
export async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail?.message ?? body?.message ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
