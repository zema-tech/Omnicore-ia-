import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiGet, type DoctorDto, type StatusDto } from "./lib/api";

export type Brain = "api" | "local" | "euristica" | "offline" | "…";

interface BrainState {
  brain: Brain;
  provider: string;
  budgetPct: number | null;
  budgetUsed: number;
  budgetLimit: number;
  calls: number;
  refresh: () => void;
}

const Ctx = createContext<BrainState>({
  brain: "…",
  provider: "",
  budgetPct: null,
  budgetUsed: 0,
  budgetLimit: 0,
  calls: 0,
  refresh: () => {},
});

export function BrainProvider({ children }: { children: ReactNode }) {
  const [brain, setBrain] = useState<Brain>("…");
  const [provider, setProvider] = useState("");
  const [budgetPct, setBudgetPct] = useState<number | null>(null);
  const [budgetUsed, setBudgetUsed] = useState(0);
  const [budgetLimit, setBudgetLimit] = useState(0);
  const [calls, setCalls] = useState(0);

  const refresh = useCallback(() => {
    Promise.all([
      apiGet<DoctorDto>("/api/doctor").catch(() => null),
      apiGet<StatusDto>("/api/status").catch(() => null),
    ]).then(([d, s]) => {
      if (!d && !s) {
        setBrain("offline");
        return;
      }
      if (d) {
        setBrain(d.active as Brain);
        setProvider(d.provider);
      } else if (s) setBrain((s.brain || "…") as Brain);
      if (s) {
        setBudgetPct(s.budget.pct);
        setBudgetUsed(s.budget.used);
        setBudgetLimit(s.budget.limit);
        setCalls(s.budget.calls);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ brain, provider, budgetPct, budgetUsed, budgetLimit, calls, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useBrain(): BrainState {
  return useContext(Ctx);
}
