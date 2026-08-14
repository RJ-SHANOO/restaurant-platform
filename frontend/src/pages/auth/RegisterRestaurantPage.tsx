import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flame, Info } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import type { AuthenticatedUser } from '@/types/api';

interface PlatformTerms {
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
  settlementFrequency: 'daily' | 'every_2_days' | 'weekly' | 'monthly';
  currencyCode: string;
}

interface RegistrationForm {
  restaurantName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  password: string;
  passwordConfirmation: string;
}

const EMPTY_FORM: RegistrationForm = {
  restaurantName: '',
  ownerName: '',
  email: '',
  phone: '',
  city: '',
  password: '',
  passwordConfirmation: '',
};

const SETTLEMENT_LABEL: Record<PlatformTerms['settlementFrequency'], string> = {
  daily: 'every day',
  every_2_days: 'every two days',
  weekly: 'every week',
  monthly: 'every month',
};

/**
 * Registration also fixes the commercial terms.
 *
 * The rate is fetched from the platform and displayed before the restaurant
 * agrees to it - the same figure the server applies a moment later. The form
 * never sends a commission value: a restaurant does not get to name its own
 * rate, and the server would ignore one if it arrived.
 */
export default function RegisterRestaurantPage() {
  const navigate = useNavigate();
  const { hydrateSession } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: terms } = useQuery({
    queryKey: ['platform-terms'],
    queryFn: () => apiGet<PlatformTerms>(endpoints.auth.platformTerms),
    staleTime: Infinity,
  });

  const update = (field: keyof RegistrationForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const commissionText = terms
    ? terms.commissionType === 'percentage'
      ? `${terms.commissionValue}% of every paid bill`
      : `${terms.currencyCode} ${terms.commissionValue} per paid bill`
    : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await apiPost<{ token: string; user: AuthenticatedUser }>(
        endpoints.auth.registerRestaurant,
        { ...form, acceptsTerms: acceptsTerms },
      );

      hydrateSession(result.token, result.user);
      toast.success('Restaurant registered. Set up your menu next.');
      navigate('/app', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px] animate-rise-in">
        <div className="mb-7 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-ember-soft">
            <Flame className="h-6 w-6 text-ember" />
          </span>
          <h1 className="mt-4 text-display-md text-ink">Register your restaurant</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            You will get a main branch, an owner account and a menu you can start filling in straight away.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4 p-6">
          <TextField
            label="Restaurant name"
            required
            value={form.restaurantName}
            onChange={update('restaurantName')}
            error={errors.restaurantName?.[0]}
            hint="This is the name customers will see."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Your name"
              required
              value={form.ownerName}
              onChange={update('ownerName')}
              error={errors.ownerName?.[0]}
            />
            <TextField
              label="City"
              value={form.city}
              onChange={update('city')}
              error={errors.city?.[0]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={update('email')}
              error={errors.email?.[0]}
            />
            <TextField
              label="Phone"
              required
              value={form.phone}
              onChange={update('phone')}
              error={errors.phone?.[0]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Password"
              type="password"
              required
              value={form.password}
              onChange={update('password')}
              error={errors.password?.[0]}
              hint="At least 8 characters, with a number."
            />
            <TextField
              label="Confirm password"
              type="password"
              required
              value={form.passwordConfirmation}
              onChange={update('passwordConfirmation')}
            />
          </div>

          {/* ------------------------------------------------ commercial terms */}
          <section className="rounded-card border border-line-strong bg-raised p-4">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">Commission terms</h2>

                {commissionText ? (
                  <>
                    <p className="mt-1.5 text-sm text-ink-soft">
                      The platform charges{' '}
                      <span className="font-semibold text-ember">{commissionText}</span>. It is
                      deducted only from bills that are fully paid, and settled{' '}
                      {SETTLEMENT_LABEL[terms!.settlementFrequency]}.
                    </p>
                    <p className="mt-2 text-xs text-ink-faint">
                      Cancelled, unpaid and refunded orders are never charged. This rate is fixed
                      when you register.
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-faint">Loading current terms…</p>
                )}

                <label className="mt-3.5 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={acceptsTerms}
                    onChange={(event) => setAcceptsTerms(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(245_165_36)]"
                  />
                  <span className="text-sm text-ink-soft">
                    I accept these commission terms
                  </span>
                </label>

                {errors.acceptsTerms?.[0] && (
                  <p className="mt-1.5 text-xs text-chili">{errors.acceptsTerms[0]}</p>
                )}
              </div>
            </div>
          </section>

          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!acceptsTerms || !terms}
            className="w-full"
            size="lg"
          >
            Create restaurant
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-ember hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
