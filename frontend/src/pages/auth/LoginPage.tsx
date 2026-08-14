import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { landingPathForRole } from '@/routes/ProtectedRoute';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/api/client';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const user = await signIn({ email, password });
      navigate(landingPathForRole(user.primaryRole), { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors({
          email: error.firstError('email') ?? '',
          password: error.firstError('password') ?? '',
        });
        toast.error(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] animate-rise-in">
        <div className="mb-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-ember-soft">
            <Flame className="h-6 w-6 text-ember" />
          </span>
          <h1 className="mt-4 text-display-md text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Counter, kitchen and back office, all in one place.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4 p-6">
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email || undefined}
            leadingIcon={<Mail className="h-4 w-4" />}
            placeholder="you@restaurant.com"
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password || undefined}
            leadingIcon={<Lock className="h-4 w-4" />}
            placeholder="••••••••"
          />

          <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Running a restaurant?{' '}
          <Link to="/register" className="font-medium text-ember hover:underline">
            Register it here
          </Link>
        </p>
      </div>
    </div>
  );
}
