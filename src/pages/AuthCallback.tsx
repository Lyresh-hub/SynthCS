import { useEffect } from "react";
import { useLocation } from "wouter";

// Ito yung page na pinupuntahan ng browser pagkatapos mag-login sa GitHub o Google.
// Ang backend ang nag-redirect dito at nilagyan ng user info sa URL.
export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Kinukuha natin yung user info na nilagay ng backend sa URL query string
    const params = new URLSearchParams(window.location.search);
    const userId   = params.get("user_id");
    const userName = params.get("user_name");
    const isAdmin  = params.get("is_admin");

    if (userId && userName) {
      // Sine-save natin ang user info sa localStorage para malaman ng app kung sino ang naka-login
      localStorage.setItem("user_id",   userId);
      localStorage.setItem("user_name", userName);
      localStorage.setItem("is_admin",  isAdmin === "true" ? "true" : "false");
      // Kung admin, papunta sa admin panel. Kung regular user, sa dashboard
      setLocation(isAdmin === "true" ? "/admin" : "/dashboard");
    } else {
      // Kapag walang user info sa URL, ibig sabihin may problema — balik sa signup
      setLocation("/");
    }
  }, []);

  // Ito yung lalabas habang nagpo-process pa ang redirect — yung spinning circle
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Completing sign in…</p>
      </div>
    </div>
  );
}
