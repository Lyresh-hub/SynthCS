import { useState, useEffect, useRef } from "react";
import { useLocation, Link, useRoute } from "wouter";
import {
  LayoutDashboard, Layers, Download,
  Bell, Plus, FileJson, Settings, CheckCheck, Trash2, Database, Menu, X, HelpCircle,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  getNotifications, markRead, markAllRead, clearNotifications,
  subscribeNotifications, type AppNotification,
} from "../lib/notifications";
import OnboardingTour from "./OnboardingTour";
import { NODE_API } from "../lib/config";

// Mga link na lalabas sa sidebar para sa regular na users
const navItems = [
  { label: "Dashboard",     icon: LayoutDashboard, href: "/dashboard",      tourKey: "nav-dashboard" },
  { label: "Schema Builder", icon: Layers,         href: "/schema-builder", tourKey: "nav-schema" },
  { label: "Saved Schemas",  icon: FileJson,       href: "/saved-schemas",  tourKey: "nav-saved",    indent: true },
  { label: "Downloads",     icon: Download,        href: "/downloads",      tourKey: "nav-downloads" },
];

// Ginagawa natin yung dalawang initials galing sa buong pangalan — hal. "Juan dela Cruz" = "JD"
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Ito yung pangunahing layout na nakabalot sa lahat ng regular user pages.
// May sidebar sa kaliwa at header sa taas — yung children ay yung page na ipinasa.
export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  // Tinutukoy kung nasa alin tayo sa mga pages — para malaman kung anong header ang ipapakita
  const [isAccountPage]      = useRoute("/user-accounts");
  const [isDownloadsPage]    = useRoute("/downloads");
  const [isSavedSchemasPage] = useRoute("/saved-schemas");
  const [isSchemaBuilderPage]= useRoute("/schema-builder");
  const [isAdminPage]        = useRoute("/admin");
  const [isAdminUsersPage]   = useRoute("/admin/users");
  const [isPreviewPage]      = useRoute("/preview");
  const [isValidationPage]   = useRoute("/validation-report");

  // Kinukuha yung pangalan ng naka-login na user mula sa localStorage
  const userName = localStorage.getItem("user_name") ?? "User";

  const isAnyAdminPage = isAdminPage || isAdminUsersPage;

  // Easter egg: i-click ang logo ng 5 beses para mapunta sa admin panel
  const [logoClicks, setLogoClicks] = useState(0);
  useEffect(() => {
    if (logoClicks === 0) return;
    // I-reset ang counter kapag lumipas ng 2 segundo nang walang click
    const t = setTimeout(() => setLogoClicks(0), 2000);
    return () => clearTimeout(t);
  }, [logoClicks]);

  function handleLogoClick() {
    const next = logoClicks + 1;
    if (next >= 5) { setLogoClicks(0); setLocation("/admin"); } // 5 clicks = admin access
    else setLogoClicks(next);
  }

  const userInitials = getInitials(userName);

  // ── Onboarding tour — show only once per user, tracked server-side ──────────
  const [showTour, setShowTour] = useState(() => localStorage.getItem("tour_done") !== "true");
  function startTour() { setShowTour(true); }
  function markTourDone() {
    localStorage.setItem("tour_done", "true");
    const userId = localStorage.getItem("user_id");
    if (userId) {
      fetch(`${NODE_API}/api/user/tour-done`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      }).catch(() => {});
    }
  }
  function endTour()    { markTourDone(); setShowTour(false); }
  function finishTour() { markTourDone(); setShowTour(false); setLocation("/schema-builder"); }

  // ── Mobile sidebar ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotifications());
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => subscribeNotifications(() => setNotifications(getNotifications())), []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bellOpen]);

  function handleNotifClick(n: AppNotification) {
    markRead(n.id);
    setBellOpen(false);
    sessionStorage.setItem("preview_params", JSON.stringify({ id: n.dataset_id, name: n.title, rows: 0 }));
    setLocation("/preview");
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // Shared sidebar content so it can be rendered in both desktop and mobile drawer
  const SidebarContent = (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white"
        onClick={handleLogoClick}
      >
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-purple-400/20 blur-sm" />
          <img src="/synthcs-logo.png" alt="SynthCS" className="relative w-9 h-9 rounded-xl object-cover shadow-sm ring-1 ring-purple-200" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-purple-700 to-violet-500 bg-clip-text text-transparent">
            SynthCS
          </div>
          <div className="text-[9px] font-medium text-purple-400/70 tracking-widest uppercase">
            {logoClicks > 0 ? `${5 - logoClicks} more…` : "Data Generator"}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 flex flex-col">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                data-tour={item.tourKey}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                  item.indent ? "ml-4 text-xs" : "",
                  isActive ? "bg-purple-50 text-purple-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className={cn(item.indent ? "w-3.5 h-3.5" : "w-4 h-4", isActive ? "text-purple-600" : "text-gray-400")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100 space-y-1">
        <Link href="/user-accounts">
          <div
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
              isAccountPage ? "bg-purple-50" : "bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
              isAccountPage ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-600"
            )}>
              {userInitials}
            </div>
            <div className="leading-tight flex-1 min-w-0">
              <div className={cn("text-xs font-medium truncate", isAccountPage ? "text-purple-700" : "text-gray-800")}>
                {userName}
              </div>
            </div>
            <Settings className={cn("w-3 h-3 flex-shrink-0", isAccountPage ? "text-purple-500" : "text-gray-400")} />
          </div>
        </Link>
        <button
          onClick={() => { setSidebarOpen(false); startTour(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Take a Tour
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col shadow-xl transition-transform duration-200 md:hidden",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100">
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {SidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-gray-200 bg-white flex-col">
        {SidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-3 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-md hover:bg-gray-100 flex-shrink-0"
            >
              <Menu className="w-5 h-5 text-gray-500" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-semibold text-gray-900 truncate">
                {isAccountPage    ? "Account Settings"
                  : isAdminPage       ? "Admin — Overview"
                  : isAdminUsersPage  ? "Admin — User Management"
                  : navItems.find((n) => n.href === location)?.label ?? "Dashboard"}
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                {isAccountPage     ? "Manage your account information, settings, and usage."
                  : isAdminPage       ? "Platform analytics and statistics"
                  : isAdminUsersPage  ? "Manage user accounts and permissions"
                  : isSchemaBuilderPage ? "Build schemas, search datasets, and generate synthetic data"
                  : isDownloadsPage   ? "Generated datasets · available for 30 days"
                  : isSavedSchemasPage ? "Saved schema templates for quick generation"
                  : isPreviewPage     ? "Preview and export your synthetic dataset"
                  : isValidationPage  ? "Statistical validation of synthetic vs real data"
                  : "Overview of your activity and generated datasets"}
              </p>
            </div>
          </div>

          {!isAccountPage && !isDownloadsPage && !isSavedSchemasPage && !isSchemaBuilderPage && !isAnyAdminPage && (
            <div className="flex items-center gap-2">
              {/* Search — hidden on mobile */}
              <div className="relative hidden md:block">
                <input
                  type="search"
                  placeholder="Search schemas..."
                  className="text-sm bg-gray-50 border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Notification bell */}
              <div className="relative" ref={bellRef}>
                <button
                  data-tour="notif-bell"
                  onClick={() => { setBellOpen((o) => !o); if (!bellOpen) markAllRead(); }}
                  className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
                >
                  <Bell className="w-4 h-4 text-gray-500" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 top-10 w-[calc(100vw-2rem)] max-w-sm bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                      <span className="text-xs font-semibold text-gray-700">Notifications</span>
                      {notifications.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { markAllRead(); setNotifications(getNotifications()); }} className="text-[11px] text-purple-600 hover:underline flex items-center gap-1">
                            <CheckCheck className="w-3 h-3" /> Mark all read
                          </button>
                          <button onClick={() => { clearNotifications(); setNotifications([]); }} className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-gray-400">No notifications yet</div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                        {notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className={cn(
                              "w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3",
                              !n.read && "bg-purple-50/60"
                            )}
                          >
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Database className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                              <p className="text-[11px] text-gray-500 truncate">{n.message}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                            </div>
                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* New Dataset → Schema Builder */}
              <button
                data-tour="new-dataset-btn"
                onClick={() => setLocation("/schema-builder")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Dataset</span>
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-auto p-3 md:p-6">
          {children}
        </main>
      </div>

      {showTour && <OnboardingTour onDone={endTour} onFinish={finishTour} />}
    </div>
  );
}
