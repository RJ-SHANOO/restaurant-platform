import { useState } from 'react';
import clsx from 'clsx';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { SiteNavLink } from '@/types/api';
import { HOME_SECTION_LABELS } from './types';

/**
 * Small presentational atoms shared by the five editor tabs. Each is a
 * controlled input over a single field on the draft - the tabs own the
 * state, these just render it.
 */

const PRESET_COLOURS = [
  '#F5A524', '#F2555A', '#3DD68C', '#5B9CFF',
  '#A855F7', '#EC4899', '#14B8A6', '#F97316',
];

export function ColourField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (colour: string) => void;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="mb-2.5 text-xs text-ink-faint">{hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        {PRESET_COLOURS.map((colour) => (
          <button
            key={colour}
            onClick={() => onChange(colour)}
            aria-label={colour}
            className={clsx(
              'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
              value.toUpperCase() === colour ? 'border-ink' : 'border-transparent',
            )}
            style={{ background: colour }}
          />
        ))}

        <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-control border border-line bg-raised px-2.5 py-1.5">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
          <span className="numeric text-xs text-ink-soft">{value}</span>
        </label>
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-control bg-raised p-3.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(245_165_36)]"
      />
    </label>
  );
}

/** A row of mutually-exclusive choices, for any field validated as a fixed set. */
export function ChoiceRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatOption = (option) => String(option),
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  formatOption?: (option: T) => string;
}) {
  return (
    <div>
      <p className="field-label mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={clsx(
              'rounded-control border px-3.5 py-2 text-sm capitalize transition-colors',
              value === option
                ? 'border-ember bg-ember-soft text-ember'
                : 'border-line bg-raised text-ink-soft hover:border-line-strong',
            )}
          >
            {formatOption(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Up to 6 restaurant-managed {label, url} links, add/remove, no reordering needed here. */
export function NavLinksEditor({
  links,
  onChange,
}: {
  links: SiteNavLink[];
  onChange: (links: SiteNavLink[]) => void;
}) {
  const update = (index: number, next: Partial<SiteNavLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...next } : link)));

  const remove = (index: number) => onChange(links.filter((_, i) => i !== index));

  const add = () => onChange([...links, { label: '', url: '/' }]);

  return (
    <div>
      <p className="field-label mb-2">Navigation links</p>
      <div className="space-y-2.5">
        {links.map((link, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={link.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Label"
              className="field w-28 shrink-0"
            />
            <input
              value={link.url}
              onChange={(event) => update(index, { url: event.target.value })}
              placeholder="/menu or https://…"
              className="field flex-1"
            />
            <button
              onClick={() => remove(index)}
              aria-label="Remove link"
              className="shrink-0 rounded-control p-2 text-ink-faint hover:bg-raised hover:text-chili"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {links.length < 6 && (
        <button
          onClick={add}
          className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-ember"
        >
          <Plus className="h-3.5 w-3.5" />
          Add link
        </button>
      )}
    </div>
  );
}

/**
 * Drag-to-reorder for the four home page sections. Native HTML5 drag and
 * drop - no extra library for what is a four-item list.
 */
export function SectionOrderEditor({
  order,
  onChange,
}: {
  order: string[];
  onChange: (order: string[]) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <p className="field-label mb-2">Section order</p>
      <div className="space-y-2">
        {order.map((key, index) => (
          <div
            key={key}
            draggable
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedIndex !== null) moveTo(draggedIndex, index);
              setDraggedIndex(null);
            }}
            onDragEnd={() => setDraggedIndex(null)}
            className={clsx(
              'flex cursor-grab items-center gap-2.5 rounded-control border border-line bg-raised px-3 py-2.5 active:cursor-grabbing',
              draggedIndex === index && 'opacity-40',
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
            <span className="text-sm text-ink">{HOME_SECTION_LABELS[key] ?? key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
