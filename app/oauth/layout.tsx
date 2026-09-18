import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authorize AI client",
  robots: { index: false, follow: false },
};

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
