import { PanelBottom } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { ChoiceRow } from './WebsiteEditorFields';
import type { TabProps } from './types';

export function FooterTab({ value, set }: TabProps) {
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <div className="mb-1 flex items-center gap-2">
          <PanelBottom className="h-4 w-4 text-ember" />
          <h2 className="text-base font-semibold text-ink">Footer</h2>
        </div>

        <div>
          <label className="field-label">About text</label>
          <textarea
            rows={3}
            className="field resize-none"
            placeholder="A short line about your restaurant, shown in the footer."
            value={value.footerAboutText ?? ''}
            onChange={(event) => set('footerAboutText', event.target.value || null)}
          />
        </div>

        <TextField
          label="Opening hours"
          placeholder="Mon–Sun: 12pm – 11pm"
          value={value.footerHours ?? ''}
          onChange={(event) => set('footerHours', event.target.value || null)}
        />

        <TextField
          label="Copyright line"
          placeholder="© 2026 Your Restaurant. All rights reserved."
          value={value.footerCopyrightText ?? ''}
          onChange={(event) => set('footerCopyrightText', event.target.value || null)}
        />

        <ChoiceRow
          label="Layout"
          options={value.options.footerLayouts}
          value={value.footerLayout ?? 'simple'}
          onChange={(next) => set('footerLayout', next)}
        />
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">Social links</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Facebook"
            placeholder="https://facebook.com/…"
            value={value.facebookUrl ?? ''}
            onChange={(event) => set('facebookUrl', event.target.value || null)}
          />
          <TextField
            label="Instagram"
            placeholder="https://instagram.com/…"
            value={value.instagramUrl ?? ''}
            onChange={(event) => set('instagramUrl', event.target.value || null)}
          />
        </div>

        <TextField
          label="WhatsApp"
          placeholder="03001234567"
          value={value.whatsappPhone ?? ''}
          onChange={(event) => set('whatsappPhone', event.target.value || null)}
          hint="Used for WhatsApp ordering, and shown as a footer link."
        />
      </section>
    </div>
  );
}
