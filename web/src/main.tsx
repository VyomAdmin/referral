import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Admin } from "./admin.tsx";
import { Home } from "./home.tsx";
import { Privacy, Terms } from "./legal.tsx";
import { Quote } from "./quote.tsx";
import { Shell, useConfig } from "./shell.tsx";
import { Track } from "./track.tsx";
import "./styles.css";

function App() {
  const { config, error } = useConfig();
  const path = window.location.pathname;
  let page = <p>Loading…</p>;
  if (error) page = <p className="error" role="alert">{error}</p>;
  else if (!config) page = <p>Loading…</p>;
  else if (path.startsWith("/admin")) page = <Admin />;
  else if (path === "/privacy") page = <Privacy config={config} />;
  else if (path === "/terms") page = <Terms config={config} />;
  else if (path === "/track") page = <Track />;
  else if (path.startsWith("/r/")) page = <Quote config={config} code={decodeURIComponent(path.slice(3))} />;
  else page = <Home config={config} />;
  return <Shell config={config}>{page}</Shell>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
