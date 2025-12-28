export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  // 1) Dedicated API 404 fallback (must be BEFORE static!)
  app.use("/api", (_req, res) => {
    res.status(404).json({ success: false, error: "API endpoint not found" });
  });

  // 2) Static assets
  app.use(express.static(distPath));

  // 3) SPA fallback only for GET/HEAD and never for /api
  app.get("*", (req, res) => {
    if (req.originalUrl.startsWith("/api")) {
      return res.status(404).json({ success: false, error: "API endpoint not found" });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}