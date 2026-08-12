import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { GraduationCap, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { NODE_API } from "../lib/config";

export default function JoinClass() {
  const [, setLocation] = useLocation();
  const token  = new URLSearchParams(window.location.search).get("token") ?? "";
  const userId = localStorage.getItem("user_id") ?? "";

  type InvData = { instructor_name: string; course: string };
  const [inv,      setInv]      = useState<InvData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [joining,  setJoining]  = useState(false);
  const [joined,   setJoined]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!token) { setError("Invalid invite link."); setLoading(false); return; }
    fetch(`${NODE_API}/invite/${token}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setInv(d); })
      .catch(() => setError("Could not reach the server."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!userId) { setLocation("/login"); return; }
    setJoining(true);
    try {
      const res = await fetch(`${NODE_API}/api/class-invite/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to join class."); return; }
      setJoined(true);
      setTimeout(() => setLocation("/classes"), 2200);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setJoining(false);
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
            <p className="text-sm">Loading class info…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm font-medium text-gray-700">{error}</p>
            <button onClick={() => setLocation("/classes")}
              className="mt-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
              Back to Classes
            </button>
          </div>
        )}

        {!loading && !error && !joined && inv && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Join a Class</h1>
            <p className="text-sm text-gray-500 mb-6">
              You've been invited to join a class on SynthCS. Your instructor will need to approve your enrollment.
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
            <button onClick={handleJoin} disabled={joining}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {joining ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</> : "Join Class"}
            </button>
          </>
        )}

        {joined && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <h2 className="text-lg font-bold text-gray-900">Request sent!</h2>
            <p className="text-sm text-gray-500">
              Your enrollment in <strong>{inv?.course}</strong> is pending approval from <strong>{inv?.instructor_name}</strong>. You'll be notified once they approve you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
