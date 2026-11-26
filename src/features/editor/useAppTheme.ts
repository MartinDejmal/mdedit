import { useEffect, useState } from "react";
import type { ThemePreference } from "../../services/appStateService";

export function useAppTheme(preference: ThemePreference) {
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);
  return resolved;
}
