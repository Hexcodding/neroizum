import { useContext } from "react";
import { ThemeContext, type ThemeState } from "./theme-context";

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === null) {
    throw new Error("useTheme использован вне ThemeProvider");
  }
  return state;
}
