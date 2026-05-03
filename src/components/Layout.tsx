import { useState, useEffect } from "react";
import { useLocation, Link, useRoute } from "wouter";
import {
  LayoutDashboard, Layers, Download,
  Bell, Plus, FileJson, Settings,
} from "lucide-react";
import { cn } from "../lib/utils";

// Mga link na lalabas sa sidebar para sa regular na users
const navItems = [
  { label: "Dashboard",     icon: LayoutDashboard, href: "/dashboard" },
  { label: "Schema Builder", icon: Layers,         href: "/schema-builder" },
  { label: "Saved Schemas",  icon: FileJson,       href: "/saved-schemas", indent: true }, // naka-indent dahil sub-item ito
  { label: "Downloads",     icon: Download,        href: "/downloads" },
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Logo — may easter egg na nakatago dito (5 clicks = admin) */}
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

        {/* Navigation links — naka-highlight ang aktibong page */}
        <nav className="flex-1 p-3 space-y-0.5 flex flex-col">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                  item.indent ? "ml-4 text-xs" : "", // naka-indent ang Saved Schemas
                  isActive
                    ? "bg-purple-50 text-purple-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}>
                  <Icon className={cn(item.indent ? "w-3.5 h-3.5" : "w-4 h-4", isActive ? "text-purple-600" : "text-gray-400")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User card sa ibaba — kapag pinindot, pupunta sa Account Settings */}
        <div className="p-3 border-t border-gray-100">
          <Link href="/user-accounts">
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
              isAccountPage ? "bg-purple-50" : "bg-gray-50 hover:bg-gray-100"
            )}>
              {/* Circle avatar na may initials ng user */}
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
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header — nagbabago ang title at description depende sa kung saang page tayo */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {isAccountPage    ? "Account Settings"
                : isAdminPage       ? "Admin — Overview"
                : isAdminUsersPage  ? "Admin — User Management"
                : navItems.find((n) => n.href === location)?.label ?? "Dashboard"}
            </h1>
            <p className="text-xs text-gray-400">
              {isAccountPage   ? "Manage your account information, settings, and usage."
                : isAdminPage      ? "Platform analytics and statistics"
                : isAdminUsersPage ? "Manage user accounts and permissions"
                : "Generate and manage synthetic datasets"}
            </p>
          </div>
          {/* Yung search bar at mga buttons sa kanan ng header — ipinakita lang sa Dashboard */}
          {!isAccountPage && !isDownloadsPage && !isSavedSchemasPage && !isSchemaBuilderPage && !isAnyAdminPage && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search schemas..."
                  className="text-sm bg-gray-50 border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {/* Bell icon na may maliit na purple dot — notification indicator */}
              <button className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors">
                <Bell className="w-4 h-4 text-gray-500" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-purple-600" />
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                New Dataset
              </button>
            </div>
          )}
        </header>

        {/* Dito nilalabas yung actual na content ng bawat page */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
