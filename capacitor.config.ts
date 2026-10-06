import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.shoppinghospitalar.portal",
  appName: "Shopping Hospitalar",
  webDir: "dist",
  server: {
    url: "https://frame-capture-cheer.lovable.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#F7F6FA",
  },
};

export default config;