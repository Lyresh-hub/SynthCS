// Ini-import natin lahat ng pages na magagamit sa app
import Signup from "./pages/signup";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import { Switch, Route } from "wouter"; // ito yung ginagamit namin para sa routing (katulad ng React Router)
import Layout from "./components/Layout";           // yung pangunahing layout na may sidebar at header
import AdminLayout from "./components/AdminLayout"; // hiwalay na layout para sa admin pages (madilim)
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

// Ito yung lalabas kapag pumunta ang user sa URL na hindi namin kilala
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-5xl font-bold text-purple-600 mb-3">404</div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Page not found</h2>
      <p className="text-sm text-gray-500 mb-5">
        The page you're looking for doesn't exist.
      </p>
      <a href="/" className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 transition-colors">
        Go to Dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    // Yung Switch ay nagre-render lang ng unang route na nagtutugma sa kasalukuyang URL
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
  );
}
