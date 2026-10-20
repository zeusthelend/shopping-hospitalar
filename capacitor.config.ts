import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.shoppinghospitalar.portal",
  appName: "Shopping Hospitalar",
  webDir: "dist",
  // Use the official production domain, not the old Lovable preview URL.
  server: {
    url: "https://shopinghospitalar.replicatepixels.live",
    cleartext: false,
  },
  android: {
    backgroundColor: "#F7F6FA",
  },
};

export default config;
