import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AchievementNotificationHost } from "./AchievementNotificationHost";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <AchievementNotificationHost />
  </StrictMode>,
);
