import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const SCALAR_PUBLIC_PATH = "/vendor/scalar-api-reference.js";

/**
 * Serve the Scalar API reference bundle from our own origin instead of a
 * floating CDN URL (supply-chain + CSP). In dev the file is served from
 * node_modules; in the client build it is emitted as a static asset.
 */
const scalarVendorPlugin = (): Plugin => {
  // The browser bundle is not an exported subpath of the package (neither is its
  // package.json), so resolve it on disk; the package is a direct devDependency.
  const bundlePath = path.resolve(import.meta.dirname, "node_modules/@scalar/api-reference/dist/browser/standalone.js");

  return {
    name: "snarvei:scalar-vendor",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== SCALAR_PUBLIC_PATH) {
          return next();
        }
        response.setHeader("content-type", "application/javascript; charset=utf-8");
        response.setHeader("cache-control", "no-cache");
        response.end(readFileSync(bundlePath));
      });
    },
    generateBundle() {
      if (this.environment?.name !== "client") {
        return;
      }
      this.emitFile({
        type: "asset",
        fileName: SCALAR_PUBLIC_PATH.slice(1),
        source: readFileSync(bundlePath),
      });
    },
  };
};

export default defineConfig({
  plugins: [react(), cloudflare(), scalarVendorPlugin()],
});
