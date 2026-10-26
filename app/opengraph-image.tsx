import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The card iMessage / GroupMe / Snapchat show when someone shares the link.
export const alt = "Acacia JP: fines, balance and your spot in line at JP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const crest = await readFile(join(process.cwd(), "public", "icon-512.png"));
  const src = `data:image/png;base64,${crest.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#FFFFFF" }}>
        <div style={{ height: 24, background: "#D73F09", display: "flex" }} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 56, padding: "0 80px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={300} height={300} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 92, fontWeight: 800, color: "#000000", letterSpacing: -3 }}>Acacia JP</div>
            <div style={{ fontSize: 40, color: "#000000", lineHeight: 1.3, maxWidth: 640 }}>
              Your fines, your balance and your spot in line at JP.
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#D73F09" }}>Oregon State Chapter</div>
          </div>
        </div>
        <div style={{ height: 24, background: "#000000", display: "flex" }} />
      </div>
    ),
    size
  );
}
