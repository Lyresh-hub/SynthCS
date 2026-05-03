// Ini-import natin lahat ng pages na magagamit sa app
import Signup from "./pages/signup";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import { Switch, Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location"; // routing sa memory — URL bar palaging domain lang
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

// Ginagawa natin ang memory-based router — routes ay naka-store sa memory, hindi sa URL
// Kaya palaging "synthcs.site" lang ang makikita sa address bar kahit saan ka pumunta
const { hook } = memoryLocation({ path: "/" });

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
  // Sa bawat render, tinatago natin ang URL para palaging domain lang ang makikita
  useEffect(() => {
    window.history.replaceState(null, "", "/");
  });

  return (
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
