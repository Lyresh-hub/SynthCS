import Signup from "./pages/signup";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import { Switch, Route } from "wouter";
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
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Signup} />
      <Route path="/login" component={Login} />
<Route path="/auth/callback" component={AuthCallback} />

      {/* Admin routes — separate dark layout */}
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

      {/* Regular user routes */}
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
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}
