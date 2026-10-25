"use client";
import { createContext, useContext } from "react";

export type DataMode = "live" | "example";

const ModeContext = createContext<DataMode>("live");

/** Live and example data never mix: every hook branches on this, and example mode disables writes. */
export function ModeProvider({ mode, children }: { mode: DataMode; children: React.ReactNode }) {
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export function useMode(): DataMode {
  return useContext(ModeContext);
}

export function basePath(mode: DataMode): string {
  return mode === "example" ? "/example" : "/app";
}
