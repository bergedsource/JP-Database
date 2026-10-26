import type { MetadataRoute } from "next";

// Lets brothers add the site to their home screen; it then opens full-screen like
// an app (handy for keeping a JP ticket open).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Acacia JP",
    short_name: "Acacia JP",
    description: "Fine lookup and JP tickets for the Oregon State Chapter of Acacia",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#D73F09",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
