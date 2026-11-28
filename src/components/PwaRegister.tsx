"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Skip SW on local/dev — cached shells break focus in embedded browsers (Cursor).
    const host = window.location.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local");
    if (isLocal || process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ignore registration failures
    });
  }, []);
  return null;
}
