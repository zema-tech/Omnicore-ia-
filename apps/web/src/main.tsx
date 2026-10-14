import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { BrainProvider } from "./brain";
import { ThemeProvider } from "./theme";
import "./index.css";

// HashRouter: la build statica è servita da server.py senza fallback SPA,
// così refresh e deep-link non danno mai 404.
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <ThemeProvider>
        <BrainProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </BrainProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
