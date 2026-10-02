export const THEME_COOKIE = "cartograph.theme";

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}

// Colour tokens key off a class on the root element, so this is the one place
// that decides what is on it. The cookie is what the server reads on the next
// request and what the pre-paint script reads on the next load.
export function applyTheme(theme: Theme): void {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && prefersDark),
  );
}

// Runs before the first paint so "follow the system" doesn't flash the wrong
// palette. It reads the cookie on every pass, which keeps it in step with
// applyTheme once the person has picked a theme. Inlined rather than imported
// because a pre-paint script can't import anything.
export const THEME_SCRIPT = `(function(){var root=document.documentElement,media=window.matchMedia("(prefers-color-scheme: dark)");function wanted(){var match=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(system|light|dark)/);return match?match[1]:"system";}function apply(){var theme=wanted();root.classList.toggle("dark",theme==="dark"||(theme==="system"&&media.matches));}apply();media.addEventListener("change",apply);})();`;
