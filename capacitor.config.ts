import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.cfb.manavault",
  appName: "ManaVault",
  webDir: "native_www",
  server: {
    url: "https://manavault.cfb.dev",
    cleartext: false
  },
  android: {
    path: "android"
  },
  ios: {
    path: "ios"
  }
};

export default config;
