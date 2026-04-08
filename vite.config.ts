import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Vite plugin: dev server middleware to save CSV files to public/
function csvSavePlugin(): Plugin {
  return {
    name: "csv-save",
    configureServer(server) {
      server.middlewares.use("/api/save-csv", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const { filename, content } = JSON.parse(body);
            if (!filename || !content) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing filename or content" }));
              return;
            }
            // Only allow saving known CSV files
            const allowed = ["attendance.csv", "2026_calander.csv"];
            if (!allowed.includes(filename)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: "File not allowed" }));
              return;
            }
            const filePath = path.resolve(__dirname, "public", filename);
            fs.writeFileSync(filePath, content, "utf-8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/ml-api": {
        target: "https://attendance-ml-api-8sqi.onrender.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ml-api/, ""),
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    csvSavePlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
