import { useEffect } from "react";

declare global { interface Window { Chart: any; } }

export function useChartJs(cb: () => void, deps: unknown[]) {
  useEffect(() => {
    if (window.Chart) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = cb;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
