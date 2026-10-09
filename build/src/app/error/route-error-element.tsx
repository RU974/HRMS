import { useRouteError } from "react-router-dom";
import { ErrorBoundary } from "./error-boundary";

function Thrower({ error }: { error: unknown }): never {
  throw error instanceof Error ? error : new Error(String(error));
}

/**
 * Route-level error element. React Router would otherwise show its raw default
 * error page; re-throwing into our ErrorBoundary gives the styled fallback and
 * the one-time reload for stale-chunk errors after a deploy.
 */
export function RouteErrorElement() {
  const error = useRouteError();
  return (
    <ErrorBoundary>
      <Thrower error={error} />
    </ErrorBoundary>
  );
}
