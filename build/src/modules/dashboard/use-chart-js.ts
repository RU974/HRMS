import { useEffect } from "react";

export function useChartJs(cb: () => void, deps: unknown[]) {
  useEffect(() => {
    cb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
