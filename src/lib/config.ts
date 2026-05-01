/// <reference types="vite/client" />

export const NODE_API   = import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://nodejs-production-7171.up.railway.app";

export const PYTHON_API = import.meta.env.DEV
  ? "http://localhost:8000"
  : "https://python-service-production-e8a4.up.railway.app";
