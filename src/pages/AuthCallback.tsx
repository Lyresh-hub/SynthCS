import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId   = params.get("user_id");
    const userName = params.get("user_name");
    const isAdmin  = params.get("is_admin");

    if (userId && userName) {
      localStorage.setItem("user_id",   userId);
      localStorage.setItem("user_name", userName);
      localStorage.setItem("is_admin",  isAdmin === "true" ? "true" : "false");
      setLocation(isAdmin === "true" ? "/admin" : "/dashboard");
    } else {
      setLocation("/");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Completing sign in…</p>
      </div>
    </div>
  );
}
