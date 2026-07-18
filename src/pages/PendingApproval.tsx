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
    <div className="min-h-screen flex">
      {/* Left panel — same dark style as signup/login */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-[#1E1347] relative overflow-hidden px-12">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img
            src="/synthcs-logo.png"
            alt="SynthCS logo"
            className="w-36 h-36 mb-6 drop-shadow-[0_0_32px_rgba(123,47,190,0.6)]"
          />
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
              SynthCS
            </span>
          </h1>
          <p className="text-purple-300/50 text-xs tracking-[0.25em] uppercase mt-1.5 mb-10">
            Synthetic Data Generator
          </p>
          <h2 className="text-2xl font-bold text-white leading-snug tracking-tight">
            Almost there —
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-purple-400">
              hang tight!
            </span>
          </h2>
          <p className="mt-4 text-purple-200/55 text-[14px] leading-relaxed max-w-[280px]">
            Your instructor will review and approve your account before you can start generating datasets.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        <div className="lg:hidden flex flex-col items-center mb-8">
          <img src="/synthcs-logo.png" alt="SynthCS" className="w-16 h-16 mb-2" />
          <span className="font-bold text-lg text-gray-900">SynthCS</span>
        </div>

        <div className="w-full max-w-md text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-purple-50 border-2 border-purple-100 flex items-center justify-center">
              <Clock className="w-9 h-9 text-purple-500" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Nothing to see here.</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Wait for your instructor's approval. You will receive an email notification
              once your account has been approved and you can start using SynthCS.
            </p>
          </div>

          {/* Info box */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-left space-y-1.5 text-sm text-purple-700">
            <p>• Your email has been verified successfully.</p>
            <p>• Your instructor will review your registration.</p>
            <p>• Check your email inbox for an approval notification.</p>
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => setLocation("/login")}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Try signing in again
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
