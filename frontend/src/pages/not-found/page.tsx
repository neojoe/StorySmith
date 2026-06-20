import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-4 text-center">
      <p className="text-7xl font-extrabold text-neutral-200 dark:text-neutral-700">
        404
      </p>
      <h1 className="text-xl font-semibold text-neutral-800 dark:text-neutral-200">
        Page not found
      </h1>
      <p className="text-sm text-neutral-500">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button>Go back home</Button>
      </Link>
    </div>
  );
}
