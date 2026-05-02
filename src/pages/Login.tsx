import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";

import { NODE_API as BACKEND } from "../lib/config";

const loginSchema = z.object({
  email:    z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormValues = z.infer<typeof loginSchema>;

type View = "login" | "forgot" | "forgot-sent";

export default function Login() {
  const [, setLocation]   = useLocation();
  const [view, setView]   = useState<View>("login");

  const [serverError, setServerError]   = useState("");
  const [successMsg, setSuccessMsg]     = useState("");
  const [isPending, setIsPending]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotEmail, setForgotEmail]   = useState("");
  const [forgotError, setForgotError]   = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_error")) setServerError(decodeURIComponent(params.get("oauth_error")!));
    if (params.get("reset")    === "1") setSuccessMsg("Password reset! You can now sign in with your new password.");
    if (params.get("verified") === "1") setSuccessMsg("Email verified! You can now sign in.");
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsPending(true);
    setServerError("");
    try {
      const res  = await fetch(`${BACKEND}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error ?? "Invalid email or password"); return; }
      localStorage.setItem("user_id",   json.id);
      localStorage.setItem("user_name", json.full_name);
      localStorage.setItem("is_admin",  json.is_admin ? "true" : "false");
      setLocation("/dashboard");
    } catch {
      setServerError("Could not reach the server. Make sure the backend is running.");
    } finally {
      setIsPending(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    try {
      await fetch(`${BACKEND}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setView("forgot-sent");
    } catch {
      setForgotError("Could not reach the server. Try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const leftPanel = (
    <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-[#1E1347] relative overflow-hidden px-12">
      <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />
      <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full bg-indigo-900/30 blur-[80px] pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <img src="/synthcs-logo.svg" alt="SynthCS logo"
          className="w-36 h-36 mb-6 drop-shadow-[0_0_32px_rgba(123,47,190,0.6)]" />
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
            SynthCS
          </span>
        </h1>
        <p className="text-purple-300/50 text-xs tracking-[0.25em] uppercase mt-1.5 mb-10">
          Synthetic Data Generator
        </p>
        <h2 className="text-3xl font-bold text-white leading-[1.2] tracking-tight">
          {view === "login" ? "Welcome back" : "Reset password"}
        </h2>
        <p className="mt-4 text-purple-200/55 text-[14px] leading-relaxed max-w-[280px]">
          {view === "login"
            ? "Sign in to access your synthetic datasets, schemas, and generation history."
            : "Enter your email and we'll send you a link to reset your password."}
        </p>
        <div className="mt-8 w-full max-w-[280px] space-y-2.5">
          <div className="h-px bg-white/10 rounded-full" />
          <div className="h-px bg-white/7 rounded-full w-4/5 mx-auto" />
          <div className="h-px bg-white/5 rounded-full w-3/5 mx-auto" />
        </div>
        {view === "login" && (
          <div className="mt-10 flex gap-8">
            {[{ value: "238", label: "Datasets" }, { value: "133", label: "Schemas" }, { value: "220", label: "Downloads" }].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-purple-300/50 text-[11px] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="absolute bottom-8 left-0 right-0 text-center text-purple-300/30 text-[11px] tracking-wide z-10">
        Trusted by data engineers and ML teams worldwide
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {leftPanel}

      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        <div className="lg:hidden flex flex-col items-center mb-8">
          <img src="/synthcs-logo.svg" alt="SynthCS" className="w-16 h-16 mb-2" />
          <span className="font-bold text-lg text-gray-900">SynthCS</span>
        </div>

        <div className="w-full max-w-md">

          {/* ── Login form ── */}
          {view === "login" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Sign in to your account</h2>
                <p className="text-sm text-gray-500 mt-1">Welcome back — enter your credentials to continue</p>
              </div>

              {successMsg && (
                <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  {successMsg}
                </div>
              )}
              {serverError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
                  <div className="text-right mt-1">
                    <button type="button" onClick={() => { setView("forgot"); setServerError(""); setSuccessMsg(""); }}
                      className="text-xs text-purple-600 hover:underline">
                      Forgot password?
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-1">
                  {isPending ? "Signing in…" : "Sign In"}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-gray-500">
                Don't have an account?{" "}
                <Link href="/" className="text-purple-600 font-medium hover:underline">Sign up</Link>
              </p>
            </>
          )}

          {/* ── Forgot password form ── */}
          {view === "forgot" && (
            <>
              <button onClick={() => setView("login")}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Forgot your password?</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send you a reset link.</p>
              </div>

              {forgotError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {forgotError}
                </div>
              )}

              <form onSubmit={onForgot} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
                  {forgotLoading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot sent confirmation ── */}
          {view === "forgot-sent" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-6">
                If an account exists for <strong>{forgotEmail}</strong>, a password reset link has been sent.
                Check your spam folder if you don't see it.
              </p>
              <button onClick={() => { setView("login"); setForgotEmail(""); }}
                className="text-purple-600 font-medium hover:underline text-sm">
                Back to sign in
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
