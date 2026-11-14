import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

if (import.meta.env['VITE_ONLINE_ONLY'] === 'true' && location.pathname !== '/online') location.replace('/online');
createRoot(document.getElementById("root")!).render(<RouterProvider router={getRouter()} />);

