import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, GraduationCap } from "lucide-react";
import { NODE_API } from "../lib/config";

export default function AcceptInvitation() {
  const [, setLocation] = useLocation();

  const token   = new URLSearchParams(window.location.search).get("token") ?? "";
  const userId  = localStorage.getItem("user_id");

  type InvData = { instructor_name: string; course: string; student_email: string };
  const [inv,     setInv]     = useState<InvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) { setError("Invalid invitation link."); setLoading(false); return; }
    fetch(`${NODE_API}/api/invitation/accept?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setInv(d);
      })
      .catch(() => setError("Could not reach the server."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!userId) {
      // Not logged in — send to login, come back after
      sessionStorage.setItem("pending_invite_token", token);
      setLocation("/login");
      return;
    }
    setAccepting(true);
    try {
      const res = await fetch(`${NODE_API}/api/invitation/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to accept invitation."); return; }
      // Update localStorage so SchemaBuilder picks up the instructor
      if (data.instructor_name) localStorage.setItem("instructor", data.instructor_name);
      sessionStorage.removeItem("pending_invite_token");
      setAccepted(true);
      // Redirect to dashboard with a flag so it shows a welcome banner
      sessionStorage.setItem("class_joined", JSON.stringify({ instructor: data.instructor_name, course: data.course }));
      setTimeout(() => setLocation("/dashboard"), 2200);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm max-w-md w-full px-8 py-10 text-center">
        <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-5">
          <GraduationCap className="w-7 h-7 text-purple-600" />
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading invitation…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm font-medium text-gray-700">{error}</p>
            <button onClick={() => setLocation("/login")}
              className="mt-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
              Go to Login
            </button>
          </div>
        )}

        {!loading && !error && !accepted && inv && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Class Invitation</h1>
            <p className="text-sm text-gray-500 mb-6">
              <strong className="text-gray-800">{inv.instructor_name}</strong> has invited you to join their class on SynthCS.
            </p>

            <div className="bg-purple-50 border border-purple-100 rounded-xl px-5 py-4 mb-6 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Instructor</span>
                <span className="font-medium text-gray-900">{inv.instructor_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Course</span>
                <span className="font-medium text-gray-900">{inv.course}</span>
              </div>
            </div>

            {!userId && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                You need to be logged in to accept. You'll be redirected to login and then brought back here.
              </p>
            )}

            <button onClick={handleAccept} disabled={accepting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {accepting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</>
                : userId ? "Accept Invitation" : "Log in to Accept"}
            </button>
          </>
        )}

        {accepted && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <h2 className="text-lg font-bold text-gray-900">You're in!</h2>
            <p className="text-sm text-gray-500">
              You've joined <strong>{inv?.instructor_name}</strong>'s class. Redirecting to your dashboard…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
