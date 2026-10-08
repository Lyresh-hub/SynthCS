// ── One login per browser tab ────────────────────────────────────────────────
// The login (user id, name, role flags, token, current page) used to live only in
// localStorage, which every tab shares. Signing in as an instructor in one tab then
// silently switched an admin tab to the instructor's token, and its pages failed
// ("Administrators only."). The server trusts only the token, so the last login won.
//
// Now each tab keeps its own copy in sessionStorage (per tab):
//   • reading these keys → this tab's copy
//   • writing / removing → this tab's copy AND localStorage, so a NEW tab opens with
//     the most recent login (as before)
//   • a new tab (or a tab that had no login yet) starts from localStorage
// The rest of the app keeps calling localStorage.getItem/setItem as usual.
//
// Must be imported before anything else (first import in main.tsx), because App
// reads the remembered page at module load.

const TAB_KEYS = new Set([
  "user_id", "user_name", "is_admin", "is_instructor", "auth_token", "instructor",
  "tour_done", "last_path", "instructor_id", "instructor_name",
]);
const MARK = "__tab_session";   // set once this tab has its own copy

// True when this page load is a reload of a tab that already had its own login
// (App uses it to return to the same page); false for a brand-new tab.
export let tabWasReloaded = false;
// Admin / instructor pages are remembered only inside their tab, so a NEW tab
// still opens the normal start page (and can sign in as another account).
const TAB_ONLY_PAGE = /^\/(admin|instructor)(\/|$)/;

(function installTabSession() {
  if (typeof window === "undefined" || !window.sessionStorage || !window.localStorage) return;
  const local = window.localStorage;
  const tab = window.sessionStorage;
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;

  tabWasReloaded = get.call(tab, MARK) === "1";
  // First load of this tab: start from the most recent login (localStorage)
  if (!tabWasReloaded) {
    for (const k of TAB_KEYS) {
      const v = get.call(local, k);
      if (v !== null) set.call(tab, k, v);
    }
    set.call(tab, MARK, "1");
  }

  proto.getItem = function (key: string) {
    if (this === local && TAB_KEYS.has(key)) return get.call(tab, key);
    return get.call(this, key);
  };
  proto.setItem = function (key: string, value: string) {
    if (this === local && TAB_KEYS.has(key)) {
      set.call(tab, key, value);
      if (key === "last_path" && TAB_ONLY_PAGE.test(String(value))) return;   // this tab only
    }
    return set.call(this, key, value);
  };
  proto.removeItem = function (key: string) {
    if (this === local && TAB_KEYS.has(key)) remove.call(tab, key);
    return remove.call(this, key);
  };

  // localStorage.clear() (rare) also clears this tab's login
  const clear = proto.clear;
  proto.clear = function () {
    if (this === local) for (const k of TAB_KEYS) remove.call(tab, k);
    return clear.call(this);
  };
})();
