import { PanelTop } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ChoiceRow, NavLinksEditor, ToggleRow } from './WebsiteEditorFields';
import type { TabProps } from './types';

const ORDER_NOW_TARGET_LABEL: Record<string, string> = {
  menu: 'Menu section',
  whatsapp: 'WhatsApp',
  branches: 'Branches section',
  custom: 'Custom link',
};

export function HeaderTab({ value, set }: TabProps) {
  const target = value.orderNowTarget ?? 'menu';

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <div className="mb-1 flex items-center gap-2">
          <PanelTop className="h-4 w-4 text-ember" />
          <h2 className="text-base font-semibold text-ink">Logo and navigation</h2>
        </div>

        <ImageUploadField
          label="Logo"
          value={value.logoUrl ?? ''}
          onChange={(url) => set('logoUrl', url || null)}
        />

        <ChoiceRow
          label="Logo position"
          options={value.options.logoPositions}
          value={value.logoPosition ?? 'left'}
          onChange={(position) => set('logoPosition', position)}
        />

        <NavLinksEditor
          links={value.headerNavLinks ?? []}
          onChange={(links) => set('headerNavLinks', links)}
        />

        <ToggleRow
          label="Sticky header"
          hint="Keeps the header visible while a visitor scrolls."
          checked={value.headerSticky ?? true}
          onChange={(next) => set('headerSticky', next)}
        />

        <ToggleRow
          label="Show phone number"
          hint="Displays your contact number at the top of the page."
          checked={value.showHeaderPhone ?? false}
          onChange={(next) => set('showHeaderPhone', next)}
        />
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">Order Now button</h2>

        <TextField
          label="Button text"
          placeholder="Order Now"
          value={value.orderNowText ?? ''}
          onChange={(event) => set('orderNowText', event.target.value)}
        />

        <ChoiceRow
          label="Sends visitors to"
          options={value.options.orderNowTargets}
          value={target}
          formatOption={(option) => ORDER_NOW_TARGET_LABEL[option] ?? option}
          onChange={(next) => set('orderNowTarget', next)}
        />

        {target === 'custom' && (
          <TextField
            label="Custom link"
            placeholder="https://…"
            value={value.orderNowUrl ?? ''}
            onChange={(event) => set('orderNowUrl', event.target.value || null)}
          />
        )}
      </section>
    </div>
  );
}
