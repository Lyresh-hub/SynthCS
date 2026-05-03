import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Check, X } from "lucide-react";

import { NODE_API as BACKEND } from "../lib/config";

const passwordRules = [
  { label: "At least 8 characters",      test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter (A-Z)",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter (a-z)",  test: (p: string) => /[a-z]/.test(p) },
  { label: "One number (0-9)",            test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character (!@#$...)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const signupSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName:  z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address")
      .refine((e) => e.endsWith("@gordoncollege.edu.ph"), {
        message: "Only Gordon College email addresses (@gordoncollege.edu.ph) are allowed.",
      }),
    password: z.string()
      .min(8,          "Password must be at least 8 characters")
      .regex(/[A-Z]/,  "Password must contain at least one uppercase letter")
      .regex(/[a-z]/,  "Password must contain at least one lowercase letter")
      .regex(/[0-9]/,  "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string(),
    agreeTerms: z.boolean().refine((v) => v === true, {
      message: "You must agree to the Terms of Service",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

export default function Signup() {
  const [, setLocation] = useLocation();
  const [serverError, setServerError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<"idle"|"sending"|"sent">("idle");

  // Show error message if redirected back from a failed OAuth attempt
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    if (oauthError) setServerError(decodeURIComponent(oauthError));
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName:  "",
      email: "",
      password: "",
      confirmPassword: "",
      agreeTerms: false,
    },
  });

  const onSubmit = async (data: SignupFormValues) => {
    setIsPending(true);
    setServerError("");
    try {
      const res = await fetch(`${BACKEND}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: data.firstName,
          last_name:  data.lastName,
          email: data.email,
          password: data.password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error ?? "Failed to create account";
        if (res.status === 400 && msg.toLowerCase().includes("exists")) {
          setError("email", { message: "An account with this email already exists" });
        } else {
          setServerError(msg);
        }
        return;
      }
      if (json.pending_verification) {
        setPendingEmail(json.email);
        return;
      }
      localStorage.setItem("user_id", json.id);
      localStorage.setItem("user_name", json.full_name ?? `${json.first_name} ${json.last_name}`);
      setLocation("/dashboard");
    } catch {
      setServerError("Could not reach the server. Make sure the backend is running.");
    } finally {
      setIsPending(false);
    }
  };

  const handleResend = async () => {
    setResendStatus("sending");
    await fetch(`${BACKEND}/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingEmail }),
    }).catch(() => {});
    setResendStatus("sent");
  };

  if (pendingEmail) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto text-3xl">
          ✉️
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Check your inbox</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          We sent a verification link to <strong className="text-gray-700">{pendingEmail}</strong>.
          Click it to activate your account.
        </p>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-xs text-purple-700 text-left space-y-1">
          <p>• Check your spam/junk folder if you don't see it.</p>
          <p>• The link expires in 24 hours.</p>
        </div>
        <p className="text-sm text-gray-400">
          Didn't receive it?{" "}
          <button
            onClick={handleResend}
            disabled={resendStatus !== "idle"}
            className="text-purple-600 font-medium hover:underline disabled:opacity-50"
          >
            {resendStatus === "sending" ? "Sending…" : resendStatus === "sent" ? "Sent!" : "Resend email"}
          </button>
        </p>
        <p className="text-sm text-gray-400">
          <Link href="/login" className="text-purple-600 font-medium hover:underline">
            Back to Sign in
          </Link>
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* ── Left showcase panel ── */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-[#1E1347] relative overflow-hidden px-12">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full bg-indigo-900/30 blur-[80px] pointer-events-none" />

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
          <h2 className="text-3xl font-bold text-white leading-[1.2] tracking-tight">
            Start generating<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-purple-400">
              in minutes
            </span>
          </h2>
          <p className="mt-4 text-purple-200/55 text-[14px] leading-relaxed max-w-[280px]">
            Create realistic synthetic datasets for testing, AI training, and development — without exposing real data.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        <div className="lg:hidden flex flex-col items-center mb-8">
          <img src="/synthcs-logo.png" alt="SynthCS" className="w-16 h-16 mb-2" />
          <span className="font-bold text-lg text-gray-900">SynthCS</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
            <p className="text-sm text-gray-500 mt-1">Sign up to your SynthCS account to continue</p>
          </div>

          {serverError && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* First Name + Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  {...register("firstName")}
                  placeholder="John"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  {...register("lastName")}
                  placeholder="Doe"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>}
              </div>
            </div>

            {/* Email */}
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

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Live password requirements */}
              {watch("password") && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-lg grid grid-cols-1 gap-1">
                  {passwordRules.map((rule) => {
                    const passed = rule.test(watch("password"));
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        {passed
                          ? <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          : <X className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                        <span className={`text-xs ${passed ? "text-green-600" : "text-gray-400"}`}>
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            {/* Agree Terms */}
            <div className="flex items-start gap-2 pt-1">
              <input
                {...register("agreeTerms")}
                type="checkbox"
                id="agreeTerms"
                className="mt-0.5 accent-purple-600"
              />
              <label htmlFor="agreeTerms" className="text-sm text-gray-600 cursor-pointer">
                I agree to the{" "}
                <a href="#" className="text-purple-600 hover:underline font-medium">Terms of Service</a>
                {" "}and{" "}
                <a href="#" className="text-purple-600 hover:underline font-medium">Privacy Policy</a>
              </label>
            </div>
            {errors.agreeTerms && <p className="text-xs text-red-500">{errors.agreeTerms.message}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-1"
            >
              {isPending ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-purple-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

