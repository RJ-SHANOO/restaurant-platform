import clsx from 'clsx';
import { Palette } from 'lucide-react';
import { ColourField, ChoiceRow } from './WebsiteEditorFields';
import type { TabProps } from './types';

const SHADE_SWATCH: Record<string, string> = {
  dark: '#0D1014',
  midnight: '#0A0F1E',
  slate: '#1A1F26',
  light: '#F7F8FA',
};

export function ColoursTab({ value, set }: TabProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-ember" />
        <h2 className="text-base font-semibold text-ink">Colours</h2>
      </div>

      <div className="space-y-5">
        <ColourField
          label="Primary colour"
          hint="Buttons, prices and highlights."
          value={value.primaryColor ?? '#F5A524'}
          onChange={(colour) => set('primaryColor', colour)}
        />

        <ColourField
          label="Secondary colour"
          hint="Badges and success states."
          value={value.secondaryColor ?? '#3DD68C'}
          onChange={(colour) => set('secondaryColor', colour)}
        />

        <div>
          <p className="field-label mb-2">Background</p>
          <div className="flex flex-wrap gap-2">
            {value.options.backgroundShades.map((shade) => (
              <button
                key={shade}
                onClick={() => set('backgroundShade', shade)}
                className={clsx(
                  'flex items-center gap-2.5 rounded-control border px-3 py-2 text-sm capitalize transition-colors',
                  value.backgroundShade === shade
                    ? 'border-ember bg-ember-soft text-ember'
                    : 'border-line bg-raised text-ink-soft hover:border-line-strong',
                )}
              >
                <span
                  className="h-4 w-4 rounded-full border border-line-strong"
                  style={{ background: SHADE_SWATCH[shade] ?? '#0D1014' }}
                />
                {shade}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label mb-2">Font</p>
          <div className="flex flex-wrap gap-2">
            {value.options.fontFamilies.map((font) => (
              <button
                key={font}
                onClick={() => set('fontFamily', font)}
                style={{ fontFamily: font }}
                className={clsx(
                  'rounded-control border px-3.5 py-2 text-sm transition-colors',
                  value.fontFamily === font
                    ? 'border-ember bg-ember-soft text-ember'
                    : 'border-line bg-raised text-ink-soft hover:border-line-strong',
                )}
              >
                {font}
              </button>
            ))}
          </div>
        </div>

        <ChoiceRow
          label="Layout"
          options={value.options.layoutStyles}
          value={value.layoutStyle ?? 'classic'}
          onChange={(layout) => set('layoutStyle', layout)}
        />
      </div>
    </section>
  );
}
