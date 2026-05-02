import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// React Query — siya yung nag-aalaga ng data fetching, caching, at pag-refresh ng data mula sa server
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css"; // global na Tailwind CSS styles
import App from "./App";

// Ginagawa natin yung isang shared na query client para sa buong app
const queryClient = new QueryClient();

// Dito ini-mount ang buong React app sa loob ng <div id="root"> na nasa index.html
createRoot(document.getElementById("root")!).render(
  // Ang StrictMode ay tumutulong na mahanap ang mga bug sa development mode
  <StrictMode>
    {/* Ibinibigay natin ang queryClient sa lahat ng components sa loob */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
