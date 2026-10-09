import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { AppProviders } from "./app/providers/app-providers";
import { appRouter } from "./app/routes/app-routes";
import { ErrorBoundary } from "./app/error/error-boundary";
import { reloadOnceForNewDeploy } from "./utils/chunk-reload";

// Vite fires this when a lazy chunk (or its CSS) fails to load, e.g. after a new deploy.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewDeploy()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={appRouter} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>
);


