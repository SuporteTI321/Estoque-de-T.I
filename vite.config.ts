import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "backup-api",
      configureServer(server) {
        server.middlewares.use("/api/backup", (req, res) => {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              const dir = path.resolve("data");
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              const nome = "/almox_backup.json";
              fs.writeFileSync(path.join(dir, nome), body, "utf-8");
              res.statusCode = 200;
              res.end("ok");
            });
          } else {
            res.statusCode = 405;
            res.end("Method not allowed");
          }
        });
        // GET /api/sync — retorna seed data para browser mode (deprecated, using /seed.json)
        server.middlewares.use("/api/sync", (req, res) => {
          const seedPath = path.resolve("data/almox_seed.json");
          if (fs.existsSync(seedPath)) {
            const content = fs.readFileSync(seedPath, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(content);
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "seed not found" }));
          }
        });
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 1423,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1423,
        }
      : { overlay: false },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
