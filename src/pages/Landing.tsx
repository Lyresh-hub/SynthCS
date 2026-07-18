import { useLocation } from "wouter";
import {
  Bot,
  Search,
  Database,
  BarChart3,
  Shield,
  Download,
  ChevronRight,
  Sparkles,
  TestTube,
  Lock,
  GraduationCap,
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/synthcs-logo.png" alt="SynthCS" className="w-8 h-8" />
            <span className="font-bold text-gray-900 text-lg">SynthCS</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/login")}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setLocation("/signup")}
              className="text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#1E1347] pt-32 pb-24 px-6">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[60%] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-400/30 rounded-full px-4 py-1.5 text-purple-300 text-sm font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            CTGAN-powered synthetic data generation
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
            Generate realistic{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-purple-400">
              synthetic datasets
            </span>{" "}
            in minutes
          </h1>

          <p className="text-lg text-purple-200/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            SynthCS uses deep learning and LLM-powered schema generation to produce high-fidelity
            synthetic tabular data for AI training, software testing, and research — without
            exposing real data.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setLocation("/signup")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-7 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-purple-900/40"
            >
              Get started free
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium px-7 py-3.5 rounded-xl text-sm transition-colors border border-white/20"
            >
              Sign in to your account
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-8 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { label: "Data Sources",         value: "6+" },
            { label: "Generation Methods",   value: "2"  },
            { label: "Dataset Formats",      value: "CSV" },
            { label: "Avg. Generation Time", value: "~90s" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Everything you need to generate synthetic data
            </h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              From searching real datasets to exporting synthetic ones — all in one platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: <Bot className="w-5 h-5 text-purple-600" />,
                title: "CTGAN + LLM Generation",
                desc: "Choose between CTGAN (deep learning on real datasets) or LLM-powered schema generation for when you have no source data at all.",
              },
              {
                icon: <Search className="w-5 h-5 text-purple-600" />,
                title: "Multi-Source Dataset Search",
                desc: "Search across Kaggle, HuggingFace, UCI ML Repository, OpenML, Data.gov.ph, and PSA — all from one unified search bar.",
              },
              {
                icon: <Database className="w-5 h-5 text-purple-600" />,
                title: "Schema Builder",
                desc: "Define field names, data types, constraints, and nullability. Rename or remove columns before generation.",
              },
              {
                icon: <BarChart3 className="w-5 h-5 text-purple-600" />,
                title: "Statistical Validation",
                desc: "Compare synthetic vs. real data distributions. Get column-level fidelity scores and visual reports automatically.",
              },
              {
                icon: <Shield className="w-5 h-5 text-purple-600" />,
                title: "Privacy by Design",
                desc: "No real personal data enters your output. All generation is from statistical patterns — not copies of real records.",
              },
              {
                icon: <Download className="w-5 h-5 text-purple-600" />,
                title: "Export & API Access",
                desc: "Download as CSV or fetch via API. Datasets are stored for 30 days and accessible through a secure token-based API.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-purple-100 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-gradient-to-br from-purple-50 to-white py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How it works</h2>
            <p className="text-gray-500 text-sm">Three steps from idea to dataset.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                step: "01",
                title: "Search or describe",
                desc: "Search for a real dataset from our supported sources, or describe your dataset to generate a schema using AI.",
              },
              {
                step: "02",
                title: "Configure your schema",
                desc: "Review and adjust field names, data types, constraints, and row count in the Schema Editor.",
              },
              {
                step: "03",
                title: "Generate and download",
                desc: "SynthCS trains on your dataset and generates synthetic rows. Preview, validate, and export your CSV.",
              },
            ].map((step) => (
              <div key={step.step} className="relative">
                <div className="text-5xl font-bold text-purple-100 mb-4">{step.step}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Built for research and development
            </h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              SynthCS is purpose-built for the Gordon College community — researchers, students,
              and developers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                icon: <Bot className="w-5 h-5" />,
                title: "AI Model Training",
                desc: "Generate labeled datasets for fraud detection, churn prediction, medical diagnosis, and more — without needing access to real data.",
                color: "text-violet-600 bg-violet-50",
              },
              {
                icon: <TestTube className="w-5 h-5" />,
                title: "Software Testing",
                desc: "Create realistic mock data for unit tests, integration tests, and database seeding. No more manually crafting fake records.",
                color: "text-blue-600 bg-blue-50",
              },
              {
                icon: <Lock className="w-5 h-5" />,
                title: "Cybersecurity Research",
                desc: "Produce synthetic attack logs, network traffic patterns, and anomaly datasets for intrusion detection and security model training.",
                color: "text-red-500 bg-red-50",
              },
              {
                icon: <GraduationCap className="w-5 h-5" />,
                title: "Academic Research",
                desc: "Conduct data-driven research without privacy concerns. Generate compliant datasets for theses, papers, and capstone projects.",
                color: "text-emerald-600 bg-emerald-50",
              },
            ].map((uc) => (
              <div
                key={uc.title}
                className="flex gap-4 p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-gray-200 transition-all"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${uc.color}`}
                >
                  {uc.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">{uc.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{uc.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[#1E1347] py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 to-indigo-900/30 pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to generate synthetic data?
          </h2>
          <p className="text-purple-200/70 text-sm mb-8">
            Available exclusively to Gordon College students, faculty, and staff with a valid{" "}
            <code className="text-purple-300 bg-white/10 px-1.5 py-0.5 rounded">
              @gordoncollege.edu.ph
            </code>{" "}
            email.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setLocation("/signup")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-purple-700 hover:bg-purple-50 font-semibold px-7 py-3.5 rounded-xl text-sm transition-colors"
            >
              Create your account
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium px-7 py-3.5 rounded-xl text-sm transition-colors border border-white/20"
            >
              Sign in
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/synthcs-logo.png" alt="SynthCS" className="w-6 h-6 opacity-80" />
            <span className="text-sm font-medium text-gray-400">SynthCS</span>
          </div>
          <p className="text-xs text-gray-500 text-center">
            Gordon College — College of Computer Studies · Synthetic Data Generator for Academic Use
          </p>
          <div className="flex gap-4 text-xs text-gray-500">
            <button
              onClick={() => setLocation("/login")}
              className="hover:text-gray-300 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setLocation("/signup")}
              className="hover:text-gray-300 transition-colors"
            >
              Sign up
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
