import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";

import { NODE_API as BACKEND } from "../lib/config";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address")
    .refine((e) => e.endsWith("@gordoncollege.edu.ph"), {
      message: "Only Gordon College email addresses (@gordoncollege.edu.ph) are allowed.",
    }),
  password: z.string().min(1, "Password is required"),
});
type LoginFormValues = z.infer<typeof loginSchema>;

// forgot → user enters email
// forgot-code → user enters 6-digit code + new password
// login → normal sign-in
type View = "login" | "forgot" | "forgot-code";

export default function Login() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<View>("login");

  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg]   = useState("");
  const [isPending, setIsPending]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // forgot step 1
  const [forgotEmail, setForgotEmail]     = useState("");
  const [forgotError, setForgotError]     = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // forgot step 2
  const [resetCode, setResetCode]               = useState("");
  const [resetPass, setResetPass]               = useState("");
  const [resetConfirm, setResetConfirm]         = useState("");
  const [showReset, setShowReset]               = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetError, setResetError]             = useState("");
  const [resetLoading, setResetLoading]         = useState(false);

  // Timer para sa OTP — 60 segundo lang bago mag-expire ang code
  const [timer, setTimer]           = useState(60);
  const [codeExpired, setCodeExpired] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg]     = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_error")) setServerError(decodeURIComponent(params.get("oauth_error")!));
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
      setView("forgot-code");
    } catch {
      setForgotError("Could not reach the server. Try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (resetPass.length < 8) return setResetError("Password must be at least 8 characters.");
    if (resetPass !== resetConfirm) return setResetError("Passwords do not match.");
    setResetLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, code: resetCode, password: resetPass }),
      });
      const json = await res.json();
      if (!res.ok) return setResetError(json.error ?? "Something went wrong.");
      setView("login");
      setForgotEmail("");
      setResetCode("");
      setResetPass("");
      setResetConfirm("");
      setSuccessMsg("Password reset! You can now sign in with your new password.");
    } catch {
      setResetError("Could not reach the server. Try again.");
    } finally {
      setResetLoading(false);
    }
  };

  // Kapag pumunta sa "forgot-code" view, simulan ang 60-segundo countdown
  useEffect(() => {
    if (view !== "forgot-code") return;
    setTimer(60);
    setCodeExpired(false);
    setResendMsg("");
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setCodeExpired(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [view]);

  // Kapag nag-request ng bagong code, i-reset ang timer at i-resend ang email
  const handleResend = async () => {
    setResendLoading(true);
    setResendMsg("");
    setResetError("");
    try {
      await fetch(`${BACKEND}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setResetCode("");
      setCodeExpired(false);
      setResendMsg("New code sent! Check your email.");
      setTimer(60);
      timerRef.current = setInterval(() => {
        setTimer((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            setCodeExpired(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } catch {
      setResetError("Could not resend. Try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const leftTitle = view === "login" ? "Welcome back"
    : view === "forgot" ? "Reset password"
    : "Enter your code";

  const leftSub = view === "login"
    ? "Sign in to access your synthetic datasets, schemas, and generation history."
    : view === "forgot"
    ? "Enter your email and we'll send you a 6-digit reset code."
    : "Check your email for the 6-digit code and enter your new password below.";

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-[#1E1347] relative overflow-hidden px-12">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full bg-indigo-900/30 blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <img src="/synthcs-logo.png" alt="SynthCS logo"
            className="w-36 h-36 mb-6 drop-shadow-[0_0_32px_rgba(123,47,190,0.6)]" />
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
              SynthCS
            </span>
          </h1>
          <p className="text-purple-300/50 text-xs tracking-[0.25em] uppercase mt-1.5 mb-10">
            Synthetic Data Generator
          </p>
          <h2 className="text-3xl font-bold text-white leading-[1.2] tracking-tight">{leftTitle}</h2>
          <p className="mt-4 text-purple-200/55 text-[14px] leading-relaxed max-w-[280px]">{leftSub}</p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        <div className="lg:hidden flex flex-col items-center mb-8">
          <img src="/synthcs-logo.png" alt="SynthCS" className="w-16 h-16 mb-2" />
          <span className="font-bold text-lg text-gray-900">SynthCS</span>
        </div>

        <div className="w-full max-w-md">

          {/* ── Login ── */}
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
                  <input {...register("email")} type="email" placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input {...register("password")} type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
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

          {/* ── Forgot: enter email ── */}
          {view === "forgot" && (
            <>
              <button onClick={() => setView("login")}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Forgot your password?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email and we'll send a 6-digit code to reset your password.
                </p>
              </div>
              {forgotError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {forgotError}
                </div>
              )}
              <form onSubmit={onForgot} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input type="email" required value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)} placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
                  {forgotLoading ? "Sending…" : "Send Code"}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot: enter code + new password ── */}
          {view === "forgot-code" && (
            <>
              <button onClick={() => setView("forgot")}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Enter your code</h2>
                <p className="text-sm text-gray-500 mt-1">
                  We sent a 6-digit code to <strong>{forgotEmail}</strong>. Enter it below along with your new password.
                </p>
              </div>
              {resetError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {resetError}
                </div>
              )}
              {/* Timer display — nagpapakita kung ilang segundo na lang bago mag-expire */}
              <div className={`flex items-center justify-between text-sm mb-3 px-1 ${codeExpired ? "text-red-500" : "text-gray-500"}`}>
                <span>{codeExpired ? "Code expired." : `Code expires in:`}</span>
                {!codeExpired && (
                  <span className={`font-mono font-bold ${timer <= 10 ? "text-red-500" : "text-purple-600"}`}>
                    0:{timer.toString().padStart(2, "0")}
                  </span>
                )}
              </div>

              {/* Resend button — lalabas lang kapag expired na ang code */}
              {codeExpired && (
                <button type="button" onClick={handleResend} disabled={resendLoading}
                  className="w-full mb-3 py-2 border border-purple-300 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors">
                  {resendLoading ? "Sending…" : "Resend New Code"}
                </button>
              )}

              {resendMsg && (
                <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  {resendMsg}
                </div>
              )}

              <form onSubmit={onReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">6-Digit Code</label>
                  <input type="text" required maxLength={6} value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    disabled={codeExpired}
                    className={`w-full border rounded-lg px-3 py-2 text-sm text-center tracking-[0.5em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${codeExpired ? "border-red-200 bg-red-50 text-red-300" : "border-gray-200"}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input type={showReset ? "text" : "password"} required value={resetPass}
                      onChange={(e) => setResetPass(e.target.value)} placeholder="At least 8 characters"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <button type="button" onClick={() => setShowReset(!showReset)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showReset ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <div className="relative">
                    <input type={showResetConfirm ? "text" : "password"} required value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)} placeholder="Re-enter your password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <button type="button" onClick={() => setShowResetConfirm(!showResetConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showResetConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={resetLoading || codeExpired}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
                  {resetLoading ? "Saving…" : "Reset Password"}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

