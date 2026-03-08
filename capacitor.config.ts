import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "at.mycliniq.app",
  appName: "mycliniq",
  webDir: "dist/public",
  bundledWebRuntime: false,
  packageClassList: ["MycliniqWidgetBridge"],
  server: {
    cleartext: false,
  },
};

export default config;
