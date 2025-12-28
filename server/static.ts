import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // API routes should return 404 JSON, not SPA fallback
  // This middleware catches any /api/* requests that weren't handled by API routes
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") && !res.headersSent) {
      return res.status(404).json({ success: false, error: "API endpoint not found" });
    }
    next();
  });

 // fall through to index.html if the file doesn't exist (only for non-API routes)
app.use("*", (req, res, next) => {
  // IMPORTANT: never serve SPA for API routes
  if (req.path.startsWith("/api")) return next();

  res.sendFile(path.resolve(distPath, "index.html"));
});
}
