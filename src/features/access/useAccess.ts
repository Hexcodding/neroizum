import { useContext } from "react";
import { AccessContext } from "./access-context";
import type { AccessState } from "./access-context";

export function useAccess(): AccessState {
  const value = useContext(AccessContext);
  if (value === null) {
    throw new Error("useAccess вызван вне AccessProvider");
  }
  return value;
}
