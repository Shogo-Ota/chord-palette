import { useState } from "react";

const ONBOARDING_KEY = "cp_onboarded";

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  };

  return { showOnboarding, dismissOnboarding };
}
