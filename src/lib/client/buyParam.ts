"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `?buy=25` on a stock or basket page (links from the texting assistant) opens the normal buy form
 * with the amount filled in. Returns the amount; `openSheet` is called on the phone layout, where
 * the form lives in a sheet. The user still reviews and confirms as usual.
 */
export function useBuyParam(openSheet: () => void): string | undefined {
  const [amount, setAmount] = useState<string>();
  const open = useRef(openSheet);
  open.current = openSheet;
  useEffect(() => {
    const url = new URL(window.location.href);
    const buy = url.searchParams.get("buy");
    if (buy === null) return;
    url.searchParams.delete("buy");
    window.history.replaceState(null, "", url.toString());
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(buy)) return;
    setAmount(buy);
    // Desktop shows the form in the side panel; only the phone layout needs the sheet opened.
    if (!window.matchMedia("(min-width: 1024px)").matches) open.current();
  }, []);
  return amount;
}
