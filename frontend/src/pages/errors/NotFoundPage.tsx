import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Compass className="h-10 w-10 text-ink-faint" />
      <h1 className="mt-5 text-display-md text-ink">Nothing here</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        That page does not exist. It may have been renamed or removed.
      </p>
      <Link to="/" className="btn btn-primary mt-6">
        Go to the start
      </Link>
    </div>
  );
}
