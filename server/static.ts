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

  // 1) Static assets
  app.use(express.static(distPath));

  // 2) IMPORTANT: API routes must never fall back to SPA
  // If an /api/* route wasn't handled by the API router, return JSON 404.
  app.use("/api", (req, res) => {
    return res.status(404).json({ success: false, error: "API endpoint not found" });
  });

  // 3) SPA fallback ONLY for non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}