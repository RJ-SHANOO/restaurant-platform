import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <ShieldOff className="h-10 w-10 text-ink-faint" />
      <h1 className="mt-5 text-display-md text-ink">This area is not yours</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Your role does not include this screen. If you need access, ask your restaurant owner to
        adjust your permissions.
      </p>
      <Link to="/login" className="btn btn-secondary mt-6">
        Back to sign in
      </Link>
    </div>
  );
}
