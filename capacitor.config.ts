import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.shoppinghospitalar.portal",
  appName: "Shopping Hospitalar",
  webDir: "dist",
  server: {
    url: "https://id-preview--9307696b-3411-4b4f-9125-52eebc082b8c.lovable.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#F7F6FA",
  },
};

export default config;