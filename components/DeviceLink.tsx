"use client";
import { useEffect } from "react";

/**
 * Inside the FerriDash app the start screen opens FerriDash with #device=<push token>&platform=<android|ios>.
 * Hand it to the server (app/api/device) and tidy the address. Renders nothing; does nothing in a browser.
 */
export default function DeviceLink() {
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const token = p.get("device"), platform = p.get("platform");
    if (!token || !platform) return;
    history.replaceState(null, "", location.pathname + location.search);
    fetch("/api/device", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, platform }) }).catch(() => {});
  }, []);
  return null;
}
