/// <reference types="vite/client" />

const isProd = import.meta.env.PROD;

export const NODE_API   = import.meta.env.VITE_NODE_API
  ?? (isProd ? "https://nodejs-production-7171.up.railway.app" : "http://localhost:5000");

export const PYTHON_API = import.meta.env.VITE_PYTHON_API
  ?? (isProd ? "https://synthcs-production.up.railway.app" : "http://localhost:8000");
