import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";
var host = process.env.TAURI_DEV_HOST;
export default defineConfig({
    plugins: [
        react(),
        {
            name: "backup-api",
            configureServer: function (server) {
                server.middlewares.use("/api/backup", function (req, res) {
                    if (req.method === "POST") {
                        var body_1 = "";
                        req.on("data", function (chunk) { return (body_1 += chunk); });
                        req.on("end", function () {
                            var dir = path.resolve("data");
                            if (!fs.existsSync(dir))
                                fs.mkdirSync(dir, { recursive: true });
                            var nome = "/almox_backup.json";
                            fs.writeFileSync(path.join(dir, nome), body_1, "utf-8");
                            res.statusCode = 200;
                            res.end("ok");
                        });
                    }
                    else {
                        res.statusCode = 405;
                        res.end("Method not allowed");
                    }
                });
                // GET /api/sync — retorna seed data para browser mode (deprecated, using /seed.json)
                server.middlewares.use("/api/sync", function (req, res) {
                    var seedPath = path.resolve("data/almox_seed.json");
                    if (fs.existsSync(seedPath)) {
                        var content = fs.readFileSync(seedPath, "utf-8");
                        res.setHeader("Content-Type", "application/json");
                        res.statusCode = 200;
                        res.end(content);
                    }
                    else {
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
                host: host,
                port: 1423,
            }
            : { overlay: false },
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
});
