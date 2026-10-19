import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { PublicConfig } from "./api.ts";

export function useConfig() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const path = window.location.pathname;
    const referrerPage = path === "/" || path === "";
    fetch(referrerPage ? "/api/referrer-config" : "/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("config");
        return response.json() as Promise<PublicConfig>;
      })
      .then(setConfig)
      .catch(() => setError("Configuration could not be loaded."));
  }, []);
  return { config, error };
}

export function Shell({ config, children }: { config: PublicConfig | null; children: ReactNode }) {
  const brand = config?.brandName ?? "not set";
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">{brand}</a>
        <nav>
          <a href="/#join">Get my link</a>
          <a href="/track">Track</a>
          <a href="/privacy">Privacy</a>
          <a href="/admin">Staff</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <p>{brand}</p>
        <p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
      </footer>
    </>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
