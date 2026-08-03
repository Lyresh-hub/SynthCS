import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { cn } from "../lib/utils";
import ConfirmDialog from "../components/ConfirmDialog";
import { NODE_API } from "../lib/config";
import { ChevronDown, ChevronRight } from "lucide-react";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  username: string | null;
  created_at: string;
}

interface EditableFieldProps {
  icon: string;
  label: string;
  value: string;
  type?: string;
  onSave: (val: string) => Promise<string | null>;
}

function EditableField({ icon, label, value, type = "text", onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  function startEdit() { setDraft(value); setError(""); setEditing(true); }

  async function handleSave() {
    if (draft.trim() === value) { setEditing(false); return; }
    setSaving(true); setError("");
    const err = await onSave(draft.trim());
    setSaving(false);
    if (err) setError(err); else setEditing(false);
  }

  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 gap-3 last:border-b-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="text-base text-gray-400 w-5 text-center pt-0.5 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase mb-0.5">{label}</div>
          {editing ? (
            <div className="flex flex-col gap-1.5 mt-1">
              <input
                autoFocus
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="w-full border border-purple-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {error && <span className="text-xs text-red-500">{error}</span>}
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:opacity-60 transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-md hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm font-medium text-gray-800">
              {value || <span className="text-gray-300 italic">Not set</span>}
            </div>
          )}
        </div>
      </div>
      {!editing && (
        <button onClick={startEdit}
          className="text-xs text-purple-600 hover:underline font-medium flex-shrink-0 pt-1">
          ✏️ Edit
        </button>
      )}
    </div>
  );
}

interface PasswordFieldProps {
  onSave: (current: string, next: string) => Promise<string | null>;
}

function PasswordField({ onSave }: PasswordFieldProps) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function handleSave() {
    if (!next) { setError("New password is required"); return; }
    setSaving(true); setError("");
    const err = await onSave(current, next);
    setSaving(false);
    if (err) setError(err); else { setEditing(false); setCurrent(""); setNext(""); }
  }

  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 gap-3 last:border-b-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="text-base text-gray-400 w-5 text-center pt-0.5 flex-shrink-0">🔒</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase mb-0.5">Password</div>
          {editing ? (
            <div className="flex flex-col gap-1.5 mt-1">
              <input type="password" placeholder="Current password" value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full border border-purple-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <input type="password" placeholder="New password" value={next} autoFocus
                onChange={(e) => setNext(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="w-full border border-purple-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              {error && <span className="text-xs text-red-500">{error}</span>}
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:opacity-60 transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-md hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm font-medium text-gray-800">••••••••••</div>
          )}
        </div>
      </div>
      {!editing && (
        <button onClick={() => { setError(""); setEditing(true); }}
          className="text-xs text-purple-600 hover:underline font-medium flex-shrink-0 pt-1">
          ✏️ Change
        </button>
      )}
    </div>
  );
}

export default function UserAccounts() {
  const [, setLocation] = useLocation();
  const userId = localStorage.getItem("user_id") ?? "";

  const [user, setUser]                   = useState<User | null>(null);
  const [loading, setLoading]             = useState(true);
  const [privacyMode, setPrivacyMode]     = useState(false);
  const [autoDelete, setAutoDelete]       = useState(true);
  const [anonymize, setAnonymize]         = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isAdmin = localStorage.getItem("is_admin") === "true";

  const [termsOpen, setTermsOpen]     = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`${NODE_API}/api/users/${userId}`)
      .then((r) => r.json())
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, [userId]);

  async function updateUser(patch: Record<string, string>): Promise<string | null> {
    try {
      const res = await fetch(`${NODE_API}/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Update failed";
      setUser(data);
      if (patch.first_name || patch.last_name) {
        const fn = patch.first_name ?? user?.first_name ?? "";
        const ln = patch.last_name  ?? user?.last_name  ?? "";
        localStorage.setItem("user_name", `${fn} ${ln}`.trim());
      }
      return null;
    } catch {
      return "Network error";
    }
  }

  const userEmail = user?.email ?? "—";

  function obfuscateEmail(email: string) {
    if (!email || !email.includes("@")) return email;
    const [local, domain] = email.split("@");
    const visible = local.slice(0, 2);
    const masked  = "*".repeat(Math.max(local.length - 2, 3));
    return `${visible}${masked}@${domain}`;
  }

  function handleLogout() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    localStorage.removeItem("last_path");
    sessionStorage.removeItem("schema_builder_draft");
    setLocation("/");
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out?"
        message="You will be signed out of your account and returned to the login page."
        confirmLabel="Log Out"
        cancelLabel="Stay"
        variant="default"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* User Information */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">👤 User Information</h2>
        <div className="border-b border-gray-100 mb-3" />
        <EditableField icon="👤" label="First Name" value={user?.first_name ?? ""}
          onSave={(val) => updateUser({ first_name: val })} />
        <EditableField icon="👤" label="Last Name" value={user?.last_name ?? ""}
          onSave={(val) => updateUser({ last_name: val })} />
        <div className="flex items-start gap-3 py-3 border-b border-gray-50">
          <span className="text-base text-gray-400 w-5 text-center pt-0.5 flex-shrink-0">✉️</span>
          <div>
            <div className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase mb-0.5">Email</div>
            <div className="text-sm font-medium text-gray-800">{obfuscateEmail(userEmail)}</div>
          </div>
        </div>
        <EditableField icon="👤" label="Username" value={user?.username ?? ""}
          onSave={(val) => updateUser({ username: val })} />
        <PasswordField onSave={(current, next) => updateUser({ current_password: current, new_password: next })} />
        <div className="flex items-start gap-3 py-3">
          <span className="text-base text-gray-400 w-5 text-center pt-0.5 flex-shrink-0">🗓️</span>
          <div>
            <div className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase mb-0.5">Member Since</div>
            <div className="text-sm font-medium text-gray-800">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Security */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">🛡️ Privacy & Security</h2>
        <div className="border-b border-gray-100 mb-3" />
        <div className="space-y-4">
          {[
            { label: "Privacy Mode",              desc: "All generated datasets are automatically deleted after 24h.",           value: privacyMode, set: setPrivacyMode },
            { label: "Auto-delete datasets",       desc: "Automatically remove datasets older than 30 days.",                    value: autoDelete,  set: setAutoDelete  },
            { label: "Anonymize exported names",   desc: "Replace real-looking names with fully synthetic ones on export.",      value: anonymize,   set: setAnonymize   },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-start gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-0.5">{item.label}</div>
                <div className="text-xs text-gray-400 leading-relaxed max-w-xs">{item.desc}</div>
              </div>
              <button
                onClick={() => item.set(!item.value)}
                className={cn(
                  "relative w-10 h-5 flex-shrink-0 rounded-full transition-colors duration-200 mt-0.5",
                  item.value ? "bg-purple-600" : "bg-gray-200"
                )}
              >
                <span
                  className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: item.value ? "22px" : "2px" }}
                />
              </button>
            </div>
          ))}
        </div>
        {privacyMode && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 mt-3">
            ⚠️ Enabling <strong>Privacy Mode</strong> will delete all stored datasets automatically after 24 hours.
          </div>
        )}
      </div>

      {/* Terms and Conditions */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setTermsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-900">📄 Terms and Conditions</h2>
          {termsOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {termsOpen && (
          <div className="px-5 pb-5 space-y-3 text-xs text-gray-600 leading-relaxed border-t border-gray-100">
            <p className="text-[10px] text-gray-400 pt-3">Last updated: June 2025</p>

            <div>
              <p className="font-semibold text-gray-800 mb-1">1. Acceptance of Terms</p>
              <p>By accessing or using SynthCS, you agree to be bound by these Terms and Conditions. If you do <strong className="text-red-600">NOT</strong> agree, you may <strong className="text-red-600">NOT</strong> use the platform.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">2. Permitted Use</p>
              <p>SynthCS is intended solely for academic research, educational purposes, and the generation of synthetic datasets. You may use generated data for training machine learning models, research demonstrations, and academic submissions.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">3. Prohibited Use</p>
              <p>You may <strong className="text-red-600">NOT</strong> use SynthCS to generate data intended for fraud, identity theft, financial scams, or any illegal activity. Prompts that attempt to generate harmful, discriminatory, or privacy-violating datasets are strictly prohibited and will result in immediate account suspension.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">4. Strike Policy</p>
              <p>Submitting inappropriate prompts will result in a warning strike. Accumulating 3 strikes will result in a permanent ban. Flagged prompts are reviewed by your instructor before any action is taken.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">5. Generated Data</p>
              <p>All datasets generated by SynthCS are synthetic and do <strong className="text-red-600">NOT</strong> contain real personal information. Generated data is stored for up to 30 days and may be automatically deleted. SynthCS does <strong className="text-red-600">NOT</strong> guarantee the statistical accuracy of generated data for production use.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">6. Account Responsibility</p>
              <p>You are responsible for maintaining the confidentiality of your account credentials. Any activity performed under your account is your responsibility. Report unauthorized access immediately.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">7. Modifications</p>
              <p>SynthCS reserves the right to modify these terms at any time. Continued use of the platform after changes constitutes your acceptance of the revised terms.</p>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Policy */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setPrivacyOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-900">🔒 Privacy Policy</h2>
          {privacyOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {privacyOpen && (
          <div className="px-5 pb-5 space-y-3 text-xs text-gray-600 leading-relaxed border-t border-gray-100">
            <p className="text-[10px] text-gray-400 pt-3">Last updated: June 2025</p>

            <div>
              <p className="font-semibold text-gray-800 mb-1">1. Information We Collect</p>
              <p>We collect your name, email address, and username when you register. We also store metadata about datasets you generate (name, row count, format, timestamp) and your activity within the platform.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">2. How We Use Your Information</p>
              <p>Your information is used solely to operate and improve SynthCS — to authenticate your account, display your generation history, enforce usage policies, and provide instructor oversight. We do <strong className="text-red-600">NOT</strong> sell or share your data with third parties.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">3. Data Storage</p>
              <p>Account information is stored securely in a PostgreSQL database hosted on Railway. Generated dataset files are stored temporarily and automatically deleted after 30 days. Enabling Privacy Mode reduces this to 24 hours.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">4. Generated Datasets</p>
              <p>SynthCS does <strong className="text-red-600">NOT</strong> store the content of your input prompts beyond what is needed for schema generation. Generated datasets are synthetic — they contain <strong className="text-red-600">NO</strong> real personal data. Your datasets are accessible only to you and authorized administrators.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">5. Cookies and Local Storage</p>
              <p>SynthCS uses browser localStorage to maintain your session (user ID, name, preferences). No third-party tracking cookies are used.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">6. Your Rights</p>
              <p>You may request deletion of your account and all associated data at any time by contacting your instructor or system administrator. You may also update your profile information directly from this settings page.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">7. Security</p>
              <p>Passwords are stored using bcrypt hashing. We use HTTPS for all data in transit. However, no system is completely secure — use a strong, unique password for your account.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-1">8. Contact</p>
              <p>For privacy-related concerns, contact your course instructor or the SynthCS development team through your institution.</p>
            </div>
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div className="bg-white border border-red-100 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-red-800 mb-1">⚠️ Account Actions</h2>
        <div className="border-b border-gray-100 mb-3" />
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="px-4 py-2 bg-gray-100 border border-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
          >
            ← Log Out
          </button>
          {isAdmin && (
            <button
              onClick={() => setLocation("/admin")}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 transition-colors"
            >
              🛡️ Manage Admin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
