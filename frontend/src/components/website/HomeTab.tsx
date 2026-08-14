import { Home } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ChoiceRow, SectionOrderEditor, ToggleRow } from './WebsiteEditorFields';
import type { TabProps } from './types';

export function HomeTab({ value, set }: TabProps) {
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Home className="h-4 w-4 text-ember" />
          <h2 className="text-base font-semibold text-ink">Hero banner</h2>
        </div>

        <ImageUploadField
          label="Hero image"
          value={value.bannerUrl ?? ''}
          onChange={(url) => set('bannerUrl', url || null)}
        />

        <TextField
          label="Heading"
          placeholder={'Defaults to your restaurant name'}
          value={value.heroHeading ?? ''}
          onChange={(event) => set('heroHeading', event.target.value || null)}
        />

        <TextField
          label="Subheading"
          placeholder="Charcoal grill since 1998"
          value={value.tagline ?? ''}
          onChange={(event) => set('tagline', event.target.value || null)}
        />

        <TextField
          label="Button text"
          placeholder="Order Now"
          value={value.heroButtonText ?? ''}
          onChange={(event) => set('heroButtonText', event.target.value)}
        />

        <ToggleRow
          label="Show ordering button"
          hint="Adds a button on the hero that starts an order."
          checked={value.allowOnlineOrder ?? false}
          onChange={(next) => set('allowOnlineOrder', next)}
        />
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-base font-semibold text-ink">Sections</h2>

        <ToggleRow
          label="Featured dishes"
          hint="Highlights a few dishes marked as featured in your menu."
          checked={value.showFeaturedProducts ?? true}
          onChange={(next) => set('showFeaturedProducts', next)}
        />

        {value.showFeaturedProducts !== false && (
          <ChoiceRow
            label="How many"
            options={value.options.featuredProductsLimitOptions}
            value={value.featuredProductsLimit ?? 4}
            onChange={(next) => set('featuredProductsLimit', next)}
          />
        )}

        <ToggleRow
          label="About"
          hint="Shows the about text you write below."
          checked={value.showAboutSection ?? true}
          onChange={(next) => set('showAboutSection', next)}
        />

        {value.showAboutSection !== false && (
          <div>
            <label className="field-label">About text</label>
            <textarea
              rows={4}
              className="field resize-none"
              placeholder="A short paragraph about your restaurant."
              value={value.aboutText ?? ''}
              onChange={(event) => set('aboutText', event.target.value || null)}
            />
          </div>
        )}

        <ToggleRow
          label="Our branches"
          hint="Lists your outlets with addresses."
          checked={value.showBranches ?? true}
          onChange={(next) => set('showBranches', next)}
        />
      </section>

      <section className="panel p-5">
        <SectionOrderEditor
          order={value.homeSectionOrder ?? ['hero', 'featured', 'about', 'branches']}
          onChange={(order) => set('homeSectionOrder', order)}
        />
      </section>
    </div>
  );
}
