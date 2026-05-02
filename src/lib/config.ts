/// <reference types="vite/client" />

// Ito yung base URL ng Node.js backend (login, signup, email, database, etc.)
// Kapag nag-develop tayo locally, port 5000 sa sariling computer.
// Kapag na-deploy na sa production, yung Railway URL na ang gagamitin.
export const NODE_API   = import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://nodejs-production-7171.up.railway.app";

// Ito naman yung base URL ng Python backend (yung gumagawa ng synthetic data gamit ang CTGAN)
// Locally, port 8000. Sa production, yung Railway Python service.
export const PYTHON_API = import.meta.env.DEV
  ? "http://localhost:8000"
  : "https://python-service-production-e8a4.up.railway.app";
