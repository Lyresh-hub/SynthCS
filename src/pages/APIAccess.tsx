import { useState } from "react";
import { Copy, RefreshCw, Eye, EyeOff, Key, Zap } from "lucide-react";

// Ito yung mga endpoint na pwedeng i-call ng user sa API — static muna, hindi pa live
const endpoints = [
  { method: "GET",    path: "/api/v1/generate",      desc: "Generate a dataset on the fly",      color: "bg-green-100 text-green-700" },
  { method: "POST",   path: "/api/v1/schemas",        desc: "Create a new saved schema",          color: "bg-blue-100 text-blue-700" },
  { method: "GET",    path: "/api/v1/schemas/:id",    desc: "Retrieve a saved schema",            color: "bg-green-100 text-green-700" },
  { method: "DELETE", path: "/api/v1/datasets/:id",   desc: "Delete a generated dataset",         color: "bg-red-100 text-red-700" },
  { method: "GET",    path: "/api/v1/downloads",      desc: "List all available downloads",       color: "bg-green-100 text-green-700" },
];

// Hardcoded muna itong API key — palitan mo na ng actual key kapag live na ang API
const API_KEY = "sk-synthgen-a4f2b9c1e8d3f7g0h5i6j2k1l9m8n7o6p5q4r3s2t1u0v";

export default function APIAccess() {
  const [showKey, setShowKey] = useState(false);  // kung true, nakikita na ng user ang buong key
  const [copied, setCopied]   = useState(false);  // para lang sa feedback na "Copied!" sa button

  // Kapag pinindot ang Copy, kokopyahin sa clipboard tapos mag-aappear ang "Copied!" sandali
  const handleCopy = () => {
    navigator.clipboard.writeText(API_KEY);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500); // mawawala ang "Copied!" pagkatapos ng 1.5 segundo
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-400">Integrate SynthGen directly into your apps</p>
      </div>

      {/* Card para sa API Key — may show/hide toggle at copy button */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
            <Key className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Your API Key</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center border border-gray-200 rounded-md bg-gray-50 px-3 py-2 gap-2">
            {/* Nakatago ang key by default — first 14 chars lang makikita, bullet dots na yung iba */}
            <code className="text-xs text-gray-800 font-mono flex-1 truncate">
              {showKey ? API_KEY : API_KEY.slice(0, 14) + "•".repeat(34)}
            </code>
            {/* Toggle para ipakita o itago ang buong key */}
            <button onClick={() => setShowKey(!showKey)} className="text-gray-400 hover:text-gray-700 transition-colors">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Kapag na-click, makikita ang "Copied!" sandali bago bumalik sa "Copy" */}
          <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Copy className="w-3.5 h-3.5" />{copied ? "Copied!" : "Copy"}
          </button>
          {/* Hindi pa gumagana itong regenerate — future feature pa ito */}
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Regenerate
          </button>
        </div>
        {/* Paalala lang — huwag ibahagi ang API key kahit kanino, baka ma-abuse */}
        <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
          Keep your API key secret. Never expose it in client-side code or version control.
        </div>
      </div>

      {/* Listahan ng mga endpoints — may kulay na badge depende sa HTTP method (GET, POST, DELETE) */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Available Endpoints</h3>
        </div>
        <div className="space-y-2">
          {/* I-loop ang bawat endpoint at ipakita ang method, path, at description nito */}
          {endpoints.map((ep) => (
            <div key={ep.path} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md min-w-[44px] text-center ${ep.color}`}>{ep.method}</span>
              <code className="text-xs text-gray-800 font-mono">{ep.path}</code>
              <span className="text-xs text-gray-400 flex-1 text-right">{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sample curl command para makita ng user kung paano gamitin ang API */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Example</h3>
        {/* Palitan lang ang YOUR_API_KEY ng actual key mo para gumana ito */}
        <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto font-mono leading-relaxed">
{`curl -X GET "https://api.synthgen.io/v1/generate" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "personal_data",
    "rows": 1000,
    "format": "json"
  }'`}
        </pre>
      </div>
    </div>
  );
}
