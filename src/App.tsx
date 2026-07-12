import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, initialState, StoreContext } from "./store";
import { TilesTab } from "./tabs/TilesTab";
import { RulesTab } from "./tabs/RulesTab";
import { GenerateTab } from "./tabs/GenerateTab";
import { ExportTab } from "./tabs/ExportTab";
import { downloadBlob } from "./lib/render";
import { applyProject, autosave, loadAutosave, serializeProject } from "./lib/project";

const TABS = ["Tiles", "Rules", "Generate", "Export"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [tab, setTab] = useState<Tab>("Tiles");
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const store = useMemo(
    () => ({
      state,
      update: (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })),
    }),
    [state],
  );

  // Restore the autosave (if any) once on mount.
  useEffect(() => {
    const pf = loadAutosave();
    if (!pf) return;
    applyProject(pf)
      .then(({ atlas, catalog, exampleMaps }) => {
        setState((s) => ({ ...s, atlas, catalog, exampleMaps }));
        setStatus("Restored autosaved project");
      })
      .catch(() => {});
  }, []);

  // Debounced autosave whenever there's a catalog. The catalog guard keeps the
  // initial empty state from clobbering a good save before restore runs.
  useEffect(() => {
    if (!state.catalog) return;
    const h = setTimeout(() => autosave(state), 800);
    return () => clearTimeout(h);
  }, [state]);

  const saveProject = () => {
    const pf = serializeProject(state);
    if (!pf) return setStatus("Nothing to save yet — upload a tileset first.");
    downloadBlob(
      new Blob([JSON.stringify(pf)], { type: "application/json" }),
      "project.dm.json",
    );
    setStatus("Project downloaded");
  };

  const loadProject = (file: File) => {
    file
      .text()
      .then((txt) => applyProject(JSON.parse(txt)))
      .then(({ atlas, catalog, exampleMaps }) => {
        setState((s) => ({ ...s, atlas, catalog, exampleMaps }));
        setStatus(`Loaded ${file.name}`);
      })
      .catch((e) => setStatus(`Load failed: ${(e as Error).message}`));
  };

  return (
    <StoreContext.Provider value={store}>
      <div className="app">
        <header>
          <div className="header-bar">
            <h1>Declarative Mapping</h1>
            <div className="project-actions">
              <button onClick={saveProject}>Save project</button>
              <button onClick={() => fileRef.current?.click()}>Load project</button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && loadProject(e.target.files[0])}
              />
              {status && <span className="muted">{status}</span>}
            </div>
          </div>
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
