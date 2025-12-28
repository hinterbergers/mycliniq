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

  // 2) SPA fallback ONLY for non-API routes
  app.get("*", (req, res) => {
    // If request is for an API endpoint that wasn't handled, return JSON 404
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ success: false, error: "API endpoint not found" });
    }
    // Otherwise, serve the SPA
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}