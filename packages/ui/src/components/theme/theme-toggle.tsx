import * as React from "react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const KEY = "cb-theme";

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // ignore
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>(() => getInitialTheme());

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {theme === "dark" ? "Dark" : "Light"}
    </Button>
  );
}

