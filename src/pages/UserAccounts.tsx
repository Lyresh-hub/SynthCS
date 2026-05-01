import { useState, useEffect, CSSProperties } from "react";
import { useLocation } from "wouter";
import ConfirmDialog from "../components/ConfirmDialog";

import { NODE_API } from "../lib/config";

interface User {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  created_at: string;
}


interface ToggleProps {
  value: boolean;
  onChange: (val: boolean) => void;
}



// ── Inline editable field ────────────────────────────────────────────────────

interface EditableFieldProps {
  icon: string;
  label: string;
  value: string;
  type?: string;
  onSave: (val: string) => Promise<string | null>; // returns error string or null
}

function EditableField({ icon, label, value, type = "text", onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setDraft(value);
    setError("");
    setEditing(true);
  }

  async function handleSave() {
    if (draft.trim() === value) { setEditing(false); return; }
    setSaving(true);
    setError("");
    const err = await onSave(draft.trim());
    setSaving(false);
    if (err) { setError(err); } else { setEditing(false); }
  }

  return (
    <div style={styles.fieldRow}>
      <div style={styles.fieldLeft}>
        <span style={styles.fieldIcon}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={styles.fieldLabel}>{label}</div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              <input
                autoFocus
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                style={styles.editInput}
              />
              {error && <span style={styles.errorText}>{error}</span>}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} style={styles.cancelBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={styles.fieldValue}>{value || <span style={{ color: "#bbb", fontStyle: "italic" }}>Not set</span>}</div>
          )}
        </div>
      </div>
      {!editing && (
        <button style={styles.editBtn} onClick={startEdit}>✏️ Edit</button>
      )}
    </div>
  );
}

// ── Password change field ────────────────────────────────────────────────────

interface PasswordFieldProps {
  onSave: (current: string, next: string) => Promise<string | null>;
}

function PasswordField({ onSave }: PasswordFieldProps) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!next) { setError("New password is required"); return; }
    setSaving(true);
    setError("");
    const err = await onSave(current, next);
    setSaving(false);
    if (err) { setError(err); } else { setEditing(false); setCurrent(""); setNext(""); }
  }

  return (
    <div style={styles.fieldRow}>
      <div style={styles.fieldLeft}>
        <span style={styles.fieldIcon}>🔒</span>
        <div style={{ flex: 1 }}>
          <div style={styles.fieldLabel}>PASSWORD</div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <input
                type="password"
                placeholder="Current password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                style={styles.editInput}
              />
              <input
                type="password"
                placeholder="New password"
                value={next}
                autoFocus
                onChange={(e) => setNext(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                style={styles.editInput}
              />
              {error && <span style={styles.errorText}>{error}</span>}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} style={styles.cancelBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={styles.fieldValue}>••••••••••</div>
          )}
        </div>
      </div>
      {!editing && (
        <button style={styles.editBtn} onClick={() => { setError(""); setEditing(true); }}>✏️ Change</button>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function UserAccounts() {
  const [, setLocation] = useLocation();
  const userId = localStorage.getItem("user_id") ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [privacyMode, setPrivacyMode] = useState(false);
  const [autoDelete, setAutoDelete] = useState(true);
  const [anonymize, setAnonymize] = useState(true);
  const [maskEmail, setMaskEmail] = useState(false);

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
      if (patch.full_name) localStorage.setItem("user_name", patch.full_name);
      return null;
    } catch {
      return "Network error";
    }
  }

  const userName = user?.full_name ?? localStorage.getItem("user_name") ?? "User";
  const userEmail = user?.email ?? "—";


  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isAdmin = localStorage.getItem("is_admin") === "true";

  function handleLogout() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    setLocation("/");
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #6c63ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );

  return (
    <div style={styles.root}>
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
      <div style={styles.content}>
        {/* User Information */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>👤 User Information</h2>
          <div style={styles.divider} />

          <EditableField
            icon="👤"
            label="FULL NAME"
            value={userName}
            onSave={(val) => updateUser({ full_name: val })}
          />
          <div style={styles.fieldRow}>
            <div style={styles.fieldLeft}>
              <span style={styles.fieldIcon}>✉️</span>
              <div>
                <div style={styles.fieldLabel}>EMAIL</div>
                <div style={styles.fieldValue}>{userEmail}</div>
              </div>
            </div>
          </div>
          <EditableField
            icon="👤"
            label="USERNAME"
            value={user?.username ?? ""}
            onSave={(val) => updateUser({ username: val })}
          />
          <PasswordField
            onSave={(current, next) =>
              updateUser({ current_password: current, new_password: next })
            }
          />

          <div style={styles.fieldRow}>
            <div style={styles.fieldLeft}>
              <span style={styles.fieldIcon}>🗓️</span>
              <div>
                <div style={styles.fieldLabel}>MEMBER SINCE</div>
                <div style={styles.fieldValue}>
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy & Security */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>🛡️ Privacy & Security</h2>
          <div style={styles.divider} />
          {[
            { label: "Privacy Mode", desc: "All generated datasets are automatically deleted after 24h.", value: privacyMode, set: setPrivacyMode },
            { label: "Auto-delete datasets", desc: "Automatically remove datasets older than 30 days.", value: autoDelete, set: setAutoDelete },
            { label: "Anonymize exported names", desc: "Replace real-looking names with fully synthetic ones on export.", value: anonymize, set: setAnonymize },
            { label: "Mask email addresses", desc: "Obfuscate email domains in all generated outputs.", value: maskEmail, set: setMaskEmail },
          ].map((item) => (
            <div key={item.label} style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>{item.label}</div>
                <div style={styles.toggleDesc}>{item.desc}</div>
              </div>
              <Toggle value={item.value} onChange={item.set} />
            </div>
          ))}
          {privacyMode && (
            <div style={styles.warningBox}>
              ⚠️ Enabling <strong>Privacy Mode</strong> will delete all stored datasets automatically after 24 hours.
            </div>
          )}
        </section>

        {/* Account Actions */}
        <section style={{ ...styles.card, borderColor: "#ffebee" }}>
          <h2 style={{ ...styles.sectionTitle, color: "#c62828" }}>⚠️ Account Actions</h2>
          <div style={styles.divider} />
          <div style={styles.accountActions}>
            <button style={styles.logoutBtn} onClick={() => setShowLogoutConfirm(true)}>← Log Out</button>
            {isAdmin && (
              <button style={styles.adminBtn} onClick={() => setLocation("/admin")}>
                🛡️ Manage Admin
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ ...styles.toggle, background: value ? "#6c63ff" : "#e0e0e0", justifyContent: value ? "flex-end" : "flex-start" }}
    >
      <div style={styles.toggleKnob} />
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  root: { fontFamily: "'Segoe UI', sans-serif", color: "#1a1a2e", maxWidth: 900 },
  pageHeader: { display: "flex", alignItems: "center", gap: 16, marginBottom: 28 },
  avatarLarge: { width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, #6c63ff, #a78bfa)", color: "#fff", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a2e" },
  pageSubtitle: { margin: "2px 0 0", fontSize: 13, color: "#888" },
  content: { display: "flex", flexDirection: "column", gap: 20 },
  card: { background: "#fff", borderRadius: 14, padding: "22px 26px", border: "1px solid #ececec", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  sectionTitle: { margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1a1a2e" },
  divider: { borderBottom: "1px solid #f0f0f0", marginBottom: 16 },
  fieldRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f8f8f8", gap: 12 },
  fieldLeft: { display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 },
  fieldIcon: { fontSize: 18, color: "#aaa", width: 24, textAlign: "center", paddingTop: 2, flexShrink: 0 },
  fieldLabel: { fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { fontSize: 14, color: "#1a1a2e", fontWeight: 500 },
  editBtn: { background: "none", border: "none", color: "#6c63ff", cursor: "pointer", fontSize: 13, fontWeight: 500, flexShrink: 0, paddingTop: 4 },
  editInput: { fontSize: 14, border: "1px solid #d0c8ff", borderRadius: 6, padding: "6px 10px", outline: "none", width: "100%", boxSizing: "border-box" as const },
  saveBtn: { fontSize: 12, fontWeight: 600, background: "#6c63ff", color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer" },
  cancelBtn: { fontSize: 12, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: "#555" },
  errorText: { fontSize: 12, color: "#e53935" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  planRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  planBadge: { fontSize: 13, background: "#f5f5f5", padding: "4px 12px", borderRadius: 20, color: "#555", fontWeight: 500 },
  upgradeBtn: { background: "linear-gradient(135deg, #6c63ff, #a78bfa)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  statBlock: { marginBottom: 14 },
  statHeader: { display: "flex", justifyContent: "space-between", marginBottom: 5 },
  statLabel: { fontSize: 12, color: "#888" },
  statValue: { fontSize: 12, fontWeight: 600 },
  progressBg: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, transition: "width 0.3s" },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: 600, color: "#1a1a2e", marginBottom: 2 },
  toggleDesc: { fontSize: 12, color: "#888", lineHeight: 1.5, maxWidth: 300 },
  toggle: { width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", padding: "2px 3px", display: "flex", alignItems: "center", flexShrink: 0, transition: "background 0.2s" },
  toggleKnob: { width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" },
  warningBox: { background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#795548", marginTop: 8 },
  apiKeySection: { marginTop: 4 },
  apiKeyBox: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8f8f8", border: "1px solid #ececec", borderRadius: 8, padding: "10px 14px", marginTop: 6, marginBottom: 12 },
  apiKeyText: { fontSize: 13, color: "#555", fontFamily: "monospace", wordBreak: "break-all" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16 },
  apiKeyActions: { display: "flex", gap: 10 },
  copyBtn: { flex: 1, background: "#fff", border: "1px solid #ececec", borderRadius: 8, padding: "8px", fontSize: 13, cursor: "pointer", color: "#555", fontWeight: 500 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 },
  statCard: { borderRadius: 10, padding: "14px 12px", textAlign: "center" },
  statCardIcon: { fontSize: 20, marginBottom: 6 },
  statCardValue: { fontSize: 22, fontWeight: 700, color: "#1a1a2e" },
  statCardLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  schemaHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  newSchemaBtn: { background: "linear-gradient(135deg, #6c63ff, #a78bfa)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 0.5, padding: "8px 12px", borderBottom: "1px solid #f0f0f0" },
  tr: { borderBottom: "1px solid #f8f8f8" },
  td: { padding: "13px 12px", fontSize: 14, color: "#1a1a2e" },
  typeBadge: { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500 },
  actionBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6c63ff", padding: 0 },
  accountActions: { display: "flex", gap: 12, flexWrap: "wrap" },
  logoutBtn: { background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 8, padding: "9px 18px", fontSize: 13, cursor: "pointer", color: "#555", fontWeight: 500 },
  adminBtn:  { background: "#6c63ff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, cursor: "pointer", color: "#fff", fontWeight: 600 },
};
