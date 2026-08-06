"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function InboundEmailSync({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (running.current || document.visibilityState === "hidden") return;
      running.current = true;
      try {
        const response = await fetch("/api/inbound/resend/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId }),
          cache: "no-store",
        });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && Number(json.imported) > 0) router.refresh();
      } finally {
        running.current = false;
      }
    };

    void sync();
    const interval = window.setInterval(() => void sync(), 30_000);
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, workspaceId]);

  return null;
}
