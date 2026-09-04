import { defineConfig } from "vite";

// Local dev serves from "/", the GitHub Pages deploy from "/aergebra/". The env var beats
// flag-passing here because Windows shells mangle "--base=/aergebra/" (MSYS path conversion).
export default defineConfig({
  base: process.env.AERGEBRA_BASE ?? "/",
});
