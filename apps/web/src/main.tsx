import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./auth/AuthGate";
import { isNativePlatform } from "./lib/camera";
import "./index.css";

// Offline app shell (see sw-template.js). Browser builds only: dev serves no
// sw.js, and the Capacitor shell already loads these files from the app
// bundle — a second cache layer there could only serve something staler.
if (import.meta.env.PROD && "serviceWorker" in navigator && !isNativePlatform()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline shell this session; the app works, it just needs the network.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
