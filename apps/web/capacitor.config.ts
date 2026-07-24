import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // NOTE: appId is the native bundle identifier and is effectively permanent
  // once the app is published to the stores. This is a placeholder — finalize
  // it (ideally to a reverse-DNS of an owned domain) BEFORE first store
  // submission. Changing it later means re-adding the native platforms.
  appId: "com.zitie.app",
  appName: "Zitie",
  webDir: "dist",
};

export default config;
