import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./lib/elements.cardmeister.min.js";
import "./index.css";
import App from "./App.tsx";

registerSW({ immediate: true });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
