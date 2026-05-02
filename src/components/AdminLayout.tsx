import { useLocation, Link, useRoute } from "wouter";
import { LayoutDashboard, Users, Zap, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "../lib/utils";

// Mga link na makikita sa sidebar ng admin
const navItems = [
  { label: "Overview",        icon: LayoutDashboard, href: "/admin" },
  { label: "User Management", icon: Users,           href: "/admin/users" },
];

// Ginagawa natin yung dalawang initials galing sa buong pangalan — halimbawa "John Doe" → "JD"
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Ito yung wrapper layout para sa lahat ng admin pages.
// Nagbibigay ito ng madilim na sidebar at header — yung children ay yung actual na page content.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isOverview] = useRoute("/admin"); // magiging true kapag nasa /admin overview page

  // Kinukuha yung pangalan ng naka-login na admin mula sa localStorage
  const adminName = localStorage.getItem("user_name") ?? "Admin";

  // Kapag nag-logout, burahin ang lahat ng naka-save na user info at pumunta sa login
  function handleLogout() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    setLocation("/login");
  }

  // Tinutukoy kung anong page title at description ang ipapakita base sa kasalukuyang route
  const pageTitle = isOverview ? "Overview" : "User Management";
  const pageDesc  = isOverview
    ? "Platform analytics and statistics"
    : "Manage user accounts and permissions";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 bg-[#1E1347] flex flex-col">

        {/* Logo at "Admin Portal" badge sa taas ng sidebar */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white">SynthCS</div>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-2.5 h-2.5 text-purple-300" />
              <span className="text-[10px] text-purple-300 font-semibold tracking-wide uppercase">Admin Portal</span>
            </div>
          </div>
        </div>

        {/* Mga navigation links — yung aktibong link ay naka-highlight na purple */}
        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header sa taas na nagpapakita kung anong page tayo ngayon */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
            <p className="text-xs text-gray-400">{pageDesc}</p>
          </div>
        </header>

        {/* Scrollable na content area — dito nilalagay ng route yung page niya */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
