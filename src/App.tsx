import { useMemo, useState } from "react";
import { AppState, initialState, StoreContext } from "./store";
import { TilesTab } from "./tabs/TilesTab";
import { RulesTab } from "./tabs/RulesTab";
import { GenerateTab } from "./tabs/GenerateTab";
import { ExportTab } from "./tabs/ExportTab";

const TABS = ["Tiles", "Rules", "Generate", "Export"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [tab, setTab] = useState<Tab>("Tiles");

  const store = useMemo(
    () => ({
      state,
      update: (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })),
    }),
    [state],
  );

  return (
    <StoreContext.Provider value={store}>
      <div className="app">
        <header>
          <h1>Declarative Mapping</h1>
          <nav>
            {TABS.map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
        </header>
        <main>
          {tab === "Tiles" && <TilesTab />}
          {tab === "Rules" && <RulesTab />}
          {tab === "Generate" && <GenerateTab />}
          {tab === "Export" && <ExportTab />}
        </main>
      </div>
    </StoreContext.Provider>
  );
}
