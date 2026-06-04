/// <reference types="@capawesome/capacitor-badge" />
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
  plugins: {
    Badge: {
      persist: true,
      autoClear: false,
    },
  },
};

export default config;
