import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.arkavo.portal",
  appName: "OrgPortal",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
