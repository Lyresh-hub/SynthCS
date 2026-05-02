import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Users, ShieldCheck, FileJson, Rows3,
  ShieldAlert, TrendingUp, Activity, BarChart3, Database,
} from "lucide-react";

import { NODE_API } from "../lib/config";

// Mga TypeScript types para sa iba't ibang data na galing sa backend
interface Stats {
  total_users: number;
  verified_users: number;
  total_schemas: number;
  total_datasets: number;
  total_rows: number;
}

interface GrowthRow    { month: string; count: number; }
interface TopUser      { id: string; full_name: string; email: string; schema_count: number; dataset_count: number; total_rows: number; }
interface RecentSignup { full_name: string; email: string; created_at: string; }
interface RecentSchema { name: string; table_name: string; created_at: string; user_name: string; }
interface GenMode      { kaggle: number; schema: number; }

interface Analytics {
  user_growth:    GrowthRow[];
  top_users:      TopUser[];
  recent_signups: RecentSignup[];
  recent_schemas: RecentSchema[];
  gen_mode:       GenMode;
}

// Custom bar chart component para ipakita ang user registration growth sa nakaraang 6 buwan
function BarChart({ data }: { data: GrowthRow[] }) {
  const max   = Math.max(...data.map((d) => d.count), 1); // pinakamataas na value para sa scaling
  const ticks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  const chartH = 140;

  return (
    <div className="w-full">
      <div className="flex gap-3">
        {/* Y-axis labels sa kaliwa */}
        <div className="flex flex-col justify-between text-right pb-6" style={{ height: chartH }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="text-[10px] text-gray-400 leading-none">{t}</span>
          ))}
        </div>

        {/* Lugar ng mga bars */}
        <div className="flex-1 relative" style={{ height: chartH }}>
          {/* Horizontal na dotted grid lines sa background */}
          <div className="absolute inset-0 flex flex-col justify-between pb-6 pointer-events-none">
            {ticks.map((t) => (
              <div key={t} className="w-full border-t border-dashed border-gray-100" />
            ))}
          </div>

          {/* Mga purple bars — ang taas ay proporsyonal sa bilang ng users */}
          <div className="absolute inset-x-0 bottom-6 top-0 flex items-end gap-2 px-1">
            {data.map((d) => {
              const heightPct = max === 0 ? 0 : (d.count / max) * 100;
              return (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className={`text-[11px] font-semibold transition-colors ${d.count > 0 ? "text-purple-600" : "text-gray-300"}`}>
                    {d.count}
                  </span>
                  <div className="w-full flex items-end" style={{ height: "100px" }}>
                    <div
                      className={`w-full rounded-t-md transition-all duration-500 ${d.count > 0 ? "bg-gradient-to-t from-purple-600 to-purple-400" : "bg-gray-100"}`}
                      style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels sa ibaba — buwan at taon */}
          <div className="absolute bottom-0 inset-x-0 h-6 flex gap-2 px-1">
            {data.map((d) => {
              const [mon, yr] = d.month.split(" ");
              return (
                <div key={d.month} className="flex-1 text-center">
                  <div className="text-[11px] font-medium text-gray-600">{mon}</div>
                  <div className="text-[9px] text-gray-400">{yr}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {data.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data yet</p>}
    </div>
  );
}

// Horizontal bar chart para ipakita ang proportion ng Kaggle vs Schema/LLM generation
function SplitBar({ kaggle, schema }: { kaggle: number; schema: number }) {
  const total = kaggle + schema || 1;
  const kPct  = Math.round((kaggle / total) * 100);
  const sPct  = 100 - kPct;
  return (
    <div className="space-y-3">
      {[
        { label: "Kaggle Import", value: kaggle, pct: kPct, color: "bg-blue-500" },
        { label: "Schema / LLM",  value: schema, pct: sPct, color: "bg-purple-500" },
      ].map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 font-medium">{item.label}</span>
            <span className="text-gray-500">{item.value} ({item.pct}%)</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${item.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Ginagawa nating mas readable ang date — hal. "2m ago", "3h ago", "5d ago"
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminPanel() {
  const [, setLocation] = useLocation();
  const adminId     = localStorage.getItem("user_id") ?? "";
  const isAdminUser = localStorage.getItem("is_admin") === "true";

  const [stats,     setStats]     = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading,   setLoading]   = useState(true);

  // Kapag na-load, titignan natin kung talagang admin ang naka-login — kung hindi, balik sa login
  useEffect(() => {
    if (!isAdminUser) { setLocation("/login"); return; }
    load();
  }, []);

  // Kinukuha sabay-sabay ang stats at analytics para mas mabilis
  async function load() {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`${NODE_API}/api/admin/stats?admin_id=${adminId}`),
        fetch(`${NODE_API}/api/admin/analytics?admin_id=${adminId}`),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (aRes.ok) setAnalytics(await aRes.json());
    } finally {
      setLoading(false);
    }
  }

  // Spinning loader habang naglo-load ang data
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Bilang ng mga unverified users — kinukuwenta mula sa total at verified
  const unverified = (stats?.total_users ?? 0) - (stats?.verified_users ?? 0);

  return (
    <div className="space-y-6">

      {/* KPI Cards sa tuktok — nagpapakita ng mabilis na overview ng platform */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Users",     value: stats?.total_users    ?? 0,                        icon: Users,       bg: "bg-purple-50", fg: "text-purple-600" },
          { label: "Verified",        value: stats?.verified_users ?? 0,                        icon: ShieldCheck, bg: "bg-green-50",  fg: "text-green-600"  },
          { label: "Unverified",      value: unverified,                                         icon: ShieldAlert, bg: "bg-amber-50",  fg: "text-amber-600"  },
          { label: "Total Schemas",   value: stats?.total_schemas  ?? 0,                        icon: FileJson,    bg: "bg-blue-50",   fg: "text-blue-600"   },
          { label: "Total Rows Gen.", value: (stats?.total_rows ?? 0).toLocaleString(),          icon: Rows3,       bg: "bg-indigo-50", fg: "text-indigo-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg} ${s.fg}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-gray-900 truncate">{s.value}</div>
              <div className="text-[11px] text-gray-500 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics row — bar chart at generation mode breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart ng user registrations sa nakaraang 6 buwan */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-800">User Registrations (Last 6 Months)</h3>
          </div>
          <BarChart data={analytics?.user_growth ?? []} />
        </div>

        {/* Breakdown kung gaano karami ang Kaggle vs Schema/LLM na generation */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-800">Dataset Generation Mode</h3>
          </div>
          <div className="mb-4">
            <p className="text-3xl font-bold text-gray-900">
              {(analytics?.gen_mode.kaggle ?? 0) + (analytics?.gen_mode.schema ?? 0)}
            </p>
            <p className="text-xs text-gray-400">total datasets generated</p>
          </div>
          <SplitBar kaggle={analytics?.gen_mode.kaggle ?? 0} schema={analytics?.gen_mode.schema ?? 0} />
        </div>
      </div>

      {/* Top Users at Recent Activity — dalawang card side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Table ng pinaka-aktibong 5 users */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Activity className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-800">Top 5 Most Active Users</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left text-xs text-gray-400 font-semibold px-5 py-2">User</th>
                <th className="text-right text-xs text-gray-400 font-semibold px-3 py-2">Schemas</th>
                <th className="text-right text-xs text-gray-400 font-semibold px-3 py-2">Datasets</th>
                <th className="text-right text-xs text-gray-400 font-semibold px-5 py-2">Rows</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.top_users ?? []).map((u, i) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* Numero ng ranggo ng user */}
                      <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{u.full_name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">{u.schema_count}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">{u.dataset_count}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-gray-500">{u.total_rows.toLocaleString()}</td>
                </tr>
              ))}
              {!(analytics?.top_users ?? []).length && (
                <tr><td colSpan={4} className="text-center text-xs text-gray-400 py-6">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent Activity feed — mga bagong signup at bagong schema na ginawa */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Database className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-800">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {/* Mga bagong user na nag-sign up */}
            {(analytics?.recent_signups ?? []).map((s) => (
              <div key={s.email + s.created_at} className="flex items-start gap-3 px-5 py-3">
                <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 truncate">{s.full_name} signed up</p>
                  <p className="text-[10px] text-gray-400 truncate">{s.email}</p>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(s.created_at)}</span>
              </div>
            ))}
            {/* Mga bagong schema na ginawa ng mga user */}
            {(analytics?.recent_schemas ?? []).map((s) => (
              <div key={s.name + s.created_at} className="flex items-start gap-3 px-5 py-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileJson className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 truncate">Schema "{s.name}" created</p>
                  <p className="text-[10px] text-gray-400 truncate">by {s.user_name}</p>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(s.created_at)}</span>
              </div>
            ))}
            {!analytics?.recent_signups.length && !analytics?.recent_schemas.length && (
              <p className="text-xs text-gray-400 text-center py-6">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
