import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () =>
      (localStorage.getItem("omnicore_theme") as Theme | null) ?? "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("omnicore_theme", theme);
    } catch {
      /* best-effort */
    }
  }, [theme]);
  return (
    <Ctx.Provider
      value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
