import { useEffect } from "react";
import { useLocation } from "react-router";

const APP_NAME = "AI Calling Agent";

const titleForPath: Record<string, string> = {
  "/": "Dashboard",
  "/leads": "Leads",
  "/campaigns": "Campaigns",
  "/call-queue": "Live Monitor",
  "/calls": "Call Center",
  "/appointments": "Appointments",
  "/deals": "Deal Analysis",
  "/ai-config": "AI Agent",
  "/sms": "SMS Sequences",
  "/dnc": "DNC & Scrub",
  "/settings": "Settings",
  "/login": "Sign In",
};

/** Sets the document title from the current route (falls back to the app name). */
export function useDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const label = titleForPath[location.pathname] ?? "Dashboard";
    document.title = `${label} · ${APP_NAME}`;
  }, [location.pathname]);
}
