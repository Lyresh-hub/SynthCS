import { useLocation } from "wouter";
import { Clock } from "lucide-react";

export default function PendingApproval() {
  const [, setLocation] = useLocation();

  const handleSignOut = () => {
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    localStorage.removeItem("last_path");
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-[#1E1347] relative overflow-hidden flex flex-col items-center justify-center px-6">
      {/* Background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md text-center space-y-7">
        {/* Logo */}
        <div className="flex flex-col items-center mb-2">
          <img
            src="/synthcs-logo.png"
            alt="SynthCS"
            className="w-20 h-20 drop-shadow-[0_0_28px_rgba(139,92,246,0.7)] mb-4"
          />
          <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
            SynthCS
          </span>
          <span className="text-purple-300/50 text-[10px] tracking-[0.3em] uppercase mt-1">
            Synthetic Data Generator
          </span>
        </div>

        {/* Clock icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Clock className="w-9 h-9 text-purple-300" />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3">
          <h2 className="text-3xl font-bold text-white">Nothing to see here.</h2>
          <p className="text-purple-200/70 text-sm leading-relaxed">
            Wait for your instructor's approval. You will receive an email
            notification once your account has been approved and you can
            start using SynthCS.
          </p>
        </div>

        {/* Info box */}
        <div className="bg-white/10 border border-white/15 rounded-xl p-4 text-left space-y-2 text-sm text-purple-200/80">
          <p>• Your email has been verified successfully.</p>
          <p>• Your instructor will review your registration.</p>
          <p>• Check your email inbox for an approval notification.</p>
        </div>

        {/* Buttons */}
        <div className="space-y-3 pt-1">
          <button
            onClick={() => setLocation("/login")}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-lg shadow-purple-900/40"
          >
            Try signing in again
          </button>
          <button
            onClick={handleSignOut}
            className="w-full text-sm text-purple-300/60 hover:text-purple-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
