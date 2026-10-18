import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { LayoutDashboard, Users, Zap, LogOut, ShieldCheck, GraduationCap, Activity, Menu, X, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { endServerSession } from "../lib/authFetch";
import { NODE_API } from "../lib/config";
import OnboardingTour, { type TourStep } from "./OnboardingTour";

const navItems = [
  { label: "Overview",          icon: LayoutDashboard, href: "/admin",          tour: "admin-nav-overview" },
  { label: "User Management",   icon: Users,           href: "/admin/users",    tour: "admin-nav-users" },
  { label: "Classes",           icon: GraduationCap,   href: "/admin/classes",  tour: "admin-nav-classes" },
  { label: "Activity History",  icon: Activity,        href: "/admin/activity", tour: "admin-nav-activity" },
];

// ── Admin walkthrough ────────────────────────────────────────────────────────
// Each admin page mounts its own AdminLayout, so the current step is kept in this
// tab's sessionStorage and the tour continues on the next page.
const TOUR_STEP_KEY = "admin_tour_step";

function adminTourSteps(go: (href: string, openMenu: boolean) => void): TourStep[] {
  const nav = (href: string, key: string, title: string, description: string): TourStep => ({
    title, description, target: `[data-tour='${key}']`, placement: "right", onEnter: () => go(href, true),
  });
  return [
    {
      title: "Welcome to the Admin Portal!",
      description: "As administrator you oversee the whole system: every account, every class and course, and everything students and instructors do. Here's a quick look at each page.",
      target: null,
      onEnter: () => go("/admin", false),
    },
    nav("/admin", "admin-nav-overview", "Overview",
      "The numbers at a glance: users, schemas and rows generated, plus the Usage section (last 7, 30 or 90 days) — generations per day, active users, flagged prompts and instructor decisions, errors, and the top categories."),
    nav("/admin/users", "admin-nav-users", "User Management",
      "Every account in one list. Search and filter students and instructors, verify accounts, make or revoke admins, reset strikes, ban or unban, and register an instructor directly."),
    nav("/admin/classes", "admin-nav-classes", "Classes",
      "Each course with its instructor, student invite link and enrolled students. The Instructor Invites tab creates a one-time sign-up link (valid 7 days) that adds a new instructor and assigns their course."),
    nav("/admin/activity", "admin-nav-activity", "Activity History",
      "Everything students and instructors do — logins, searches, generations, downloads, flags and decisions — marked INFO, WARNING or ERROR. The prompt text itself stays with the instructor. Filter it, or use Download CSV."),
    {
      title: "You're all set!",
      description: "You can replay this walkthrough anytime with the \"Take a Tour\" button at the top.",
      target: "[data-tour='admin-tour-button']",
      placement: "bottom",
      onEnter: () => go("/admin", false),
    },
  ];
}

// Ginagawa natin yung dalawang initials galing sa buong pangalan — halimbawa "John Doe" → "JD"
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Ito yung wrapper layout para sa lahat ng admin pages.
// Nagbibigay ito ng madilim na sidebar at header — yung children ay yung actual na page content.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  // Phones / small tablets: the sidebar slides in from the left (☰ button)
  const [menuOpen, setMenuOpen] = useState(false);

  const adminName = localStorage.getItem("user_name") ?? "Admin";
  const adminId   = localStorage.getItem("user_id") ?? "";

  // Walkthrough: shown once per admin (saved on the server); "Take a Tour" replays it
  const doneKey = `admin_tour_done:${adminId}`;
  const [tourStep, setTourStep] = useState<number | null>(() => {
    const saved = sessionStorage.getItem(TOUR_STEP_KEY);
    return saved === null ? null : Number(saved);
  });
  useEffect(() => {
    if (tourStep !== null || !adminId || localStorage.getItem(doneKey) === "true") return;
    fetch(`${NODE_API}/api/users/${adminId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u?.admin_tour_done) localStorage.setItem(doneKey, "true");
        else if (u) setTourStep(0);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goForTour = (href: string, openMenu: boolean) => {
    setMenuOpen(openMenu && window.innerWidth < 768);   // phones: show the menu item being explained
    if (location !== href) setLocation(href);
  };
  const endTour = () => {
    sessionStorage.removeItem(TOUR_STEP_KEY);
    setTourStep(null);
    setMenuOpen(false);
    if (localStorage.getItem(doneKey) === "true") return;
    localStorage.setItem(doneKey, "true");
    fetch(`${NODE_API}/api/user/tour-done`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: adminId, tour: "admin" }),
    }).catch(() => {});
  };

  function handleLogout() {
    endServerSession(); // ends the session on the server (and logs it) before the token is cleared
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    localStorage.removeItem("last_path");
    sessionStorage.removeItem("schema_builder_draft");
    setLocation("/login");
  }

  const PAGE_INFO: Record<string, [string, string]> = {
    "/admin":          ["Overview", "Platform analytics and statistics"],
    "/admin/users":    ["User Management", "Manage user accounts, roles, and strikes"],
    "/admin/classes":  ["Courses", "Manage courses, invitation links, and instructor activity"],
    "/admin/activity": ["Activity History", "Every user's account and system activity"],
  };
  const [pageTitle, pageDesc] = PAGE_INFO[location] ?? PAGE_INFO["/admin"];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {tourStep !== null && (
        <OnboardingTour
          steps={adminTourSteps(goForTour)}
          initialStep={tourStep}
          onStepChange={(i) => sessionStorage.setItem(TOUR_STEP_KEY, String(i))}
          finishLabel="Done"
          onDone={endTour}
          onFinish={endTour}
        />
      )}

      {/* Dark backdrop behind the slide-in menu (phones) — tap to close */}
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}

      {/* ── Sidebar ── always visible from tablet width up; a slide-in menu on phones */}
      <aside className={cn(
        "w-60 flex-shrink-0 border-r border-gray-200 bg-[#1E1347] flex flex-col",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:translate-x-0",
        menuOpen ? "translate-x-0" : "-translate-x-full"
      )}>

        {/* Logo at "Admin Portal" badge sa taas ng sidebar */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight flex-1">
            <div className="text-sm font-bold text-white">SynthCS</div>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-2.5 h-2.5 text-purple-300" />
              <span className="text-[10px] text-purple-300 font-semibold tracking-wide uppercase">Admin Portal</span>
            </div>
          </div>
          <button onClick={() => setMenuOpen(false)} className="md:hidden p-1 text-white/60 hover:text-white" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mga navigation links — yung aktibong link ay naka-highlight na purple */}
        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                <div data-tour={item.tour} className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors",
                  isActive
                    ? "bg-purple-600 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                )}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Avatar ng admin, pangalan, at logout button sa ibaba ng sidebar */}
        <div className="p-3 border-t border-white/10 space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
            {/* Circle na may initials ng admin */}
            <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {getInitials(adminName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{adminName}</div>
              <div className="text-[10px] text-purple-300">Administrator</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header sa taas na nagpapakita kung anong page tayo ngayon */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center gap-3 px-4 md:px-6 flex-shrink-0">
          <button onClick={() => setMenuOpen(true)} className="md:hidden p-1.5 -ml-1 rounded-md hover:bg-gray-100 flex-shrink-0" aria-label="Open menu">
            <Menu className="w-5 h-5 text-gray-500" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-gray-900 truncate">{pageTitle}</h1>
            <p className="text-xs text-gray-400 truncate">{pageDesc}</p>
          </div>
          <button onClick={() => setTourStep(0)} data-tour="admin-tour-button" title="Take a Tour"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-500 hover:text-purple-700 hover:bg-purple-50 flex-shrink-0">
            <HelpCircle className="w-4 h-4" /> <span className="hidden sm:inline">Take a Tour</span>
          </button>
        </header>

        {/* Scrollable na content area — dito nilalagay ng route yung page niya */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
