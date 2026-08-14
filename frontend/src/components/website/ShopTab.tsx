import { ShoppingBag } from 'lucide-react';
import { ChoiceRow, ToggleRow } from './WebsiteEditorFields';
import type { TabProps } from './types';

export function ShopTab({ value, set }: TabProps) {
  return (
    <section className="panel space-y-4 p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-ember" />
        <h2 className="text-base font-semibold text-ink">Menu page</h2>
      </div>

      <ToggleRow
        label="Show menu"
        hint="Turns your menu page off entirely if you are not ready to publish it."
        checked={value.showMenu ?? true}
        onChange={(next) => set('showMenu', next)}
      />

      {value.showMenu !== false && (
        <>
          <ChoiceRow
            label="View"
            options={value.options.shopViewStyles}
            value={value.shopViewStyle ?? 'grid'}
            onChange={(next) => set('shopViewStyle', next)}
          />

          {value.shopViewStyle !== 'list' && (
            <ChoiceRow
              label="Items per row"
              options={value.options.shopItemsPerRowOptions}
              value={value.shopItemsPerRow ?? 3}
              onChange={(next) => set('shopItemsPerRow', next)}
            />
          )}

          <ToggleRow
            label="Show price"
            hint="Hide prices if you would rather guests ask, or order elsewhere."
            checked={value.shopShowPrice ?? true}
            onChange={(next) => set('shopShowPrice', next)}
          />

          <ToggleRow
            label="Category filter"
            hint="Lets a visitor jump to one category."
            checked={value.shopShowCategoryFilter ?? true}
            onChange={(next) => set('shopShowCategoryFilter', next)}
          />

          <ToggleRow
            label="Search box"
            hint="Lets a visitor search dish names."
            checked={value.shopShowSearch ?? true}
            onChange={(next) => set('shopShowSearch', next)}
          />

          <ToggleRow
            label="Product image"
            hint="Shows a photo on each dish card."
            checked={value.shopShowProductImage ?? true}
            onChange={(next) => set('shopShowProductImage', next)}
          />
        </>
      )}
    </section>
  );
}
