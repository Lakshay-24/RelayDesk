import { ImageResponse } from "next/og";

export const alt = "RelayDesk — Remote MCP for your devices";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0b0d10",
        color: "#f5f7fa",
        padding: "72px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 42, fontWeight: 800 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: "#f5f7fa", color: "#0b0d10", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>R</div>
        RelayDesk
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: 72, lineHeight: 1.03, fontWeight: 850, maxWidth: 1000 }}>Your devices, callable from compatible AI.</div>
        <div style={{ fontSize: 32, color: "#b8c3d0" }}>Remote MCP for ChatGPT, Claude, and compatible clients.</div>
      </div>
    </div>,
    size,
  );
}
