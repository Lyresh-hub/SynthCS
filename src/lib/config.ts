/// <reference types="vite/client" />

export const NODE_API   = import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://synthcs-production.up.railway.app";

export const PYTHON_API = import.meta.env.DEV
  ? "http://localhost:8000"
  : "https://heroic-playfulness.up.railway.app";
