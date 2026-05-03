// Ini-import natin lahat ng pages na magagamit sa app
import Signup from "./pages/signup";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import { Switch, Route, Router } from "wouter";
// memoryLocation — ito yung puso ng URL hiding feature natin.
// Normally, ang wouter ay nagba-base sa browser URL (e.g. synthcs.site/downloads) para malaman
// kung anong page ang ipapakita. Pero with memoryLocation, ang current page ay naka-store
// sa MEMORY ng browser (hindi sa URL) — kaya kahit mag-navigate ka sa Downloads o Dashboard,
// ang URL bar ay hindi magbabago. Ito yung ginagamit ng malalaking apps para itago ang routes.
import { memoryLocation } from "wouter/memory-location";
// useEffect — ginagamit natin ito para mag-execute ng code pagkatapos mag-render ng component
import { useEffect } from "react";
import Layout from "./components/Layout";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import SchemaBuilder from "./pages/SchemaBuilder";
import SavedSchemas from "./pages/SavedSchemas";
import Downloads from "./pages/Downloads";
import DataPreview from "./pages/DataPreview";
import APIAccess from "./pages/APIAccess";
import PrivacyMode from "./pages/PrivacyMode";
import UserAccounts from "./pages/UserAccounts";
import AdminPanel from "./pages/AdminPanel";
import AdminUsers from "./pages/AdminUsers";

// Bago mag-start ang memory router, tignan muna natin kung may espesyal na params sa URL.
// Halimbawa: kapag nag-click ang user ng verification link sa email, ang URL ay
// "synthcs.site/login?verified=1" — kailangan nating ma-detect ito bago maitago ng replaceState.
// Kapag may nahanap na params, dinadala natin ang user sa tamang page (login, signup, etc.)
// instead na palagi na lang sa "/" (signup page).
function getInitialPath() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("verified"))    return `/login?verified=1`;
  if (params.get("oauth_error")) return `/?oauth_error=${encodeURIComponent(params.get("oauth_error")!)}`;
  if (params.get("error"))       return `/login?error=${encodeURIComponent(params.get("error")!)}`;
  return "/";
}

const { hook } = memoryLocation({ path: getInitialPath() });

// Ito yung lalabas kapag pumunta ang user sa URL na hindi namin kilala
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-5xl font-bold text-purple-600 mb-3">404</div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Page not found</h2>
      <p className="text-sm text-gray-500 mb-5">
        The page you're looking for doesn't exist.
      </p>
    </div>
  );
}

export default function App() {
  // Ito yung pangalawang bahagi ng URL hiding.
  // Kahit naka-memory routing na tayo, may pagkakataon pa rin na mag-appear ang path sa URL bar
  // (hal. kapag may redirect galing sa OAuth o sa ibang external source).
  // Kaya sa bawat render ng App, pinipilit nating palitan ang URL ng "/" lang
  // gamit ang window.history.replaceState — para siguradong domain lang palagi ang makikita.
  // replaceState ay hindi nag-re-reload ng page — bina-"baluktot" lang niya ang URL bar.
  useEffect(() => {
    window.history.replaceState(null, "", "/");
  });

  return (
    // Dito pinasok natin ang memory hook sa Router — ito na ang mag-hahandle ng lahat ng navigation
    // sa loob ng app. Kahit mag-click ka ng link o mag-submit ng form, sa memory nangyayari lahat.
    <Router hook={hook}>
      <Switch>
        {/* Mga public routes — pwedeng i-access kahit hindi naka-login */}
        <Route path="/" component={Signup} />
        <Route path="/login" component={Login} />
        {/* Dito napupunta ang browser pagkatapos mag-login sa GitHub o Google */}
        <Route path="/auth/callback" component={AuthCallback} />

        {/* Admin routes — nakabalot sa AdminLayout para may madilim na design */}
        <Route path="/admin">
          <AdminLayout>
            <AdminPanel />
          </AdminLayout>
        </Route>
        <Route path="/admin/users">
          <AdminLayout>
            <AdminUsers />
          </AdminLayout>
        </Route>

        {/* Regular user routes — lahat nakabalot sa Layout na may sidebar */}
        <Route>
          <Layout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/schema-builder" component={SchemaBuilder} />
              <Route path="/saved-schemas" component={SavedSchemas} />
              <Route path="/downloads" component={Downloads} />
              <Route path="/preview" component={DataPreview} />
              <Route path="/api-access" component={APIAccess} />
              <Route path="/privacy-mode" component={PrivacyMode} />
              <Route path="/user-accounts" component={UserAccounts} />
              {/* Catch-all: kapag wala talagang nagtugmang route, ipakita ang 404 */}
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Route>
      </Switch>
    </Router>
  );
}
