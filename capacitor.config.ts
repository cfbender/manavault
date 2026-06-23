import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "dev.cfb.manavault",
  appName: "ManaVault",
  webDir: "native_www",
  server: {
    allowNavigation: ["*", "http://*"],
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#18040d",
    },
  },
  android: {
    path: "android",
  },
  ios: {
    path: "ios",
  },
}

export default config
