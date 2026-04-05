import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Note",
    short_name: "Note",
    description: "Note personali con testo ricco, emoji custom e sync cloud opzionale.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0914",
    theme_color: "#0f0914",
    icons: [
      {
        src: "/icons/icon-192.png?v=20260404-235900",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png?v=20260404-235900",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/notedijaco_icon.ico?v=20260303-234200",
        sizes: "256x256",
        type: "image/x-icon",
      },
    ],
  };
}
