import { useState } from "react";
import { Link } from "wouter";
import { NODE_API as BACKEND } from "../lib/config";

export default function ForgotPassword() {
  const [email, setEmail]       = useState("");
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch(`${BACKEND}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-[#1E1347] relative overflow-hidden px-12">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <img src="/synthcs-logo.png" alt="SynthCS logo"
            className="w-36 h-36 mb-6 drop-shadow-[0_0_32px_rgba(123,47,190,0.6)]" />
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
              SynthCS
            </span>
          </h1>
          <p className="text-purple-300/50 text-xs tracking-[0.25em] uppercase mt-1.5">
            Synthetic Data Generator
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-md">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-6">
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your spam folder if you don't see it.
              </p>
              <Link href="/login" className="text-purple-600 font-medium hover:underline text-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Forgot your password?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-gray-500">
                Remember your password?{" "}
                <Link href="/login" className="text-purple-600 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

