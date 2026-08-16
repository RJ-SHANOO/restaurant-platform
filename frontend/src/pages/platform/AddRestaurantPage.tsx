import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';

type CommissionType = 'percentage' | 'fixed';

const PERCENTAGE_OPTIONS = Array.from({ length: 20 }, (_, i) => Number(((i + 1) * 0.5).toFixed(1)));
const FIXED_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

interface FormState {
  restaurantName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  password: string;
  passwordConfirmation: string;
}

const EMPTY_FORM: FormState = {
  restaurantName: '',
  ownerName: '',
  email: '',
  phone: '',
  city: '',
  password: '',
  passwordConfirmation: '',
};

/**
 * The Super Admin's own onboarding form.
 *
 * Runs the exact same registration transaction as the public form
 * (authService.createRestaurantForAdmin reuses authService.registerRestaurant's
 * logic). The one real difference: here, the admin picks the commission.
 * Restaurants signing themselves up never get that choice - see
 * RegisterRestaurantPage, which only ever shows the platform's current rate.
 */
export default function AddRestaurantPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [commissionType, setCommissionType] = useState<CommissionType>('percentage');
  const [commissionValue, setCommissionValue] = useState('2');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const commissionOptions = commissionType === 'percentage' ? PERCENTAGE_OPTIONS : FIXED_OPTIONS;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (form.password !== form.passwordConfirmation) {
      setErrors({ passwordConfirmation: ['Passwords do not match.'] });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await apiPost<{ restaurant: { name: string } }>(endpoints.platform.restaurants, {
        restaurantName: form.restaurantName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone,
        city: form.city || undefined,
        password: form.password,
        commissionType,
        commissionValue: Number(commissionValue),
      });

      toast.success(`${result.restaurant.name} added.`);
      navigate('/platform/restaurants');
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
    <div className="max-w-2xl space-y-6">
      <div>
        <button
          onClick={() => navigate('/platform/restaurants')}
          className="mb-3 flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Restaurants
        </button>
        <p className="eyebrow">Platform</p>
        <h1 className="mt-1.5 text-display-md text-ink">Add restaurant</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Same onboarding as self-registration, except you set the commission.
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
            label="Owner name"
            required
            value={form.ownerName}
            onChange={update('ownerName')}
            error={errors.ownerName?.[0]}
          />
          <TextField label="City" value={form.city} onChange={update('city')} error={errors.city?.[0]} />
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
            maxLength={11}
            inputMode="numeric"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Owner password"
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
            error={errors.passwordConfirmation?.[0]}
          />
        </div>

        <div className="border-t border-line pt-4">
          <label className="field-label">Commission</label>
          <div className="grid gap-4 sm:grid-cols-2">
            <select
              className="field"
              value={commissionType}
              onChange={(event) => {
                const next = event.target.value as CommissionType;
                setCommissionType(next);
                setCommissionValue(next === 'percentage' ? '2' : '5');
              }}
            >
              <option value="percentage">Percentage of every bill</option>
              <option value="fixed">Fixed amount per bill</option>
            </select>

            <select
              className="field"
              value={commissionValue}
              onChange={(event) => setCommissionValue(event.target.value)}
            >
              {commissionOptions.map((option) => (
                <option key={option} value={option}>
                  {commissionType === 'percentage' ? `${option}%` : `Rs ${option}`}
                </option>
              ))}
            </select>
          </div>

          {errors.commissionValue?.[0] && <p className="field-error">{errors.commissionValue[0]}</p>}

          <p className="mt-2 text-xs text-ink-faint">
            Chosen once, here. The restaurant itself never picks its own rate.
          </p>
        </div>

        <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
          Create restaurant
        </Button>
      </form>
    </div>
  );
}
