import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Layers, Pencil, Plus, Search, Sliders, Trash2, UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { MenuCategory, Modifier, ModifierGroup, Product, ProductVariant } from '@/types/api';

/**
 * Categories, products (with variants and modifier groups), and modifier
 * groups - the three catalog pieces a restaurant sets up once and then
 * mostly leaves alone. The backend for all of it existed already
 * (menuService); this page is the first UI on top of it.
 */

type Tab = 'items' | 'modifiers';

export default function MenuPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('items');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: MenuCategory }>({
    open: false,
  });
  const [productModal, setProductModal] = useState<{ open: boolean; editing?: Product }>({
    open: false,
  });
  const [groupModal, setGroupModal] = useState<{ open: boolean; editing?: ModifierGroup }>({
    open: false,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: () => apiGet<MenuCategory[]>(endpoints.menu.categories),
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['menu', 'products', selectedCategoryId, search],
    queryFn: () =>
      apiGet<Product[]>(endpoints.menu.products, {
        categoryId: selectedCategoryId ?? undefined,
        search: search || undefined,
      }),
  });

  const { data: modifierGroups, isLoading: groupsLoading } = useQuery({
    queryKey: ['menu', 'modifierGroups'],
    queryFn: () => apiGet<ModifierGroup[]>(endpoints.menu.modifierGroups),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.menu.category(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] });
      toast.success('Category removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.menu.product(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] });
      toast.success('Item removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.menu.modifierGroup(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'modifierGroups'] });
      toast.success('Modifier group removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canCreate = can('menu.create');
  const canUpdate = can('menu.update');
  const canDelete = can('menu.delete');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1 className="mt-1.5 text-display-md text-ink">Menu</h1>
          <p className="mt-2 text-sm text-ink-soft">
            What you sell, organised into categories, with variants and add-ons customers can choose.
          </p>
        </div>

        <div className="flex gap-2 rounded-control border border-line bg-raised p-1">
          <TabButton active={tab === 'items'} onClick={() => setTab('items')} icon={UtensilsCrossed}>
            Items
          </TabButton>
          <TabButton active={tab === 'modifiers'} onClick={() => setTab('modifiers')} icon={Sliders}>
            Modifier groups
          </TabButton>
        </div>
      </header>

      {tab === 'items' ? (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <CategorySidebar
            categories={categories}
            isLoading={categoriesLoading}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onAdd={() => setCategoryModal({ open: true })}
            onEdit={(category) => setCategoryModal({ open: true, editing: category })}
            onDelete={(category) => {
              if (confirm(`Remove "${category.name}"? This only works if it has no items in it.`)) {
                deleteCategory.mutate(category.id);
              }
            }}
          />

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TextField
                placeholder="Search items…"
                leadingIcon={<Search className="h-4 w-4" />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-xs"
              />

              {canCreate && (
                <Button
                  leadingIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setProductModal({ open: true })}
                  disabled={!categories || categories.length === 0}
                >
                  Add item
                </Button>
              )}
            </div>

            {productsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-52 w-full" />
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onEdit={() => setProductModal({ open: true, editing: product })}
                    onDelete={() => {
                      if (confirm(`Remove "${product.name}" from the menu?`)) {
                        deleteProduct.mutate(product.id);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<UtensilsCrossed className="h-6 w-6" />}
                title={categories && categories.length === 0 ? 'Add a category first' : 'No items yet'}
                description={
                  categories && categories.length === 0
                    ? 'Items belong to a category. Add one on the left to start building the menu.'
                    : 'Add your first dish, drink or side. Prices and availability live here, not in the order screen.'
                }
                action={
                  canCreate &&
                  categories &&
                  categories.length > 0 && (
                    <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setProductModal({ open: true })}>
                      Add item
                    </Button>
                  )
                }
              />
            )}
          </div>
        </div>
      ) : (
        <ModifierGroupsSection
          groups={modifierGroups}
          isLoading={groupsLoading}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onAdd={() => setGroupModal({ open: true })}
          onEdit={(group) => setGroupModal({ open: true, editing: group })}
          onDelete={(group) => {
            if (confirm(`Remove "${group.name}"? It will come off every item that uses it.`)) {
              deleteGroup.mutate(group.id);
            }
          }}
        />
      )}

      {categoryModal.open && (
        <CategoryModal
          editing={categoryModal.editing}
          categories={categories ?? []}
          onClose={() => setCategoryModal({ open: false })}
        />
      )}

      {productModal.open && (
        <ProductModal
          editing={productModal.editing}
          categories={categories ?? []}
          modifierGroups={modifierGroups ?? []}
          defaultCategoryId={selectedCategoryId}
          onClose={() => setProductModal({ open: false })}
        />
      )}

      {groupModal.open && (
        <ModifierGroupModal editing={groupModal.editing} onClose={() => setGroupModal({ open: false })} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof UtensilsCrossed;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-panel text-ink shadow-panel' : 'text-ink-soft hover:text-ink',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

// -------------------------------------------------------------- categories

function CategorySidebar({
  categories,
  isLoading,
  selectedId,
  onSelect,
  canCreate,
  canUpdate,
  canDelete,
  onAdd,
  onEdit,
  onDelete,
}: {
  categories: MenuCategory[] | undefined;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (category: MenuCategory) => void;
  onDelete: (category: MenuCategory) => void;
}) {
  const totalItems = useMemo(
    () => (categories ?? []).reduce((sum, category) => sum + category.productCount, 0),
    [categories],
  );

  return (
    <div className="panel space-y-1 p-3">
      <div className="flex items-center justify-between px-1.5 py-1">
        <p className="eyebrow flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Categories
        </p>
        {canCreate && (
          <button onClick={onAdd} className="rounded-control p-1 text-ink-faint hover:bg-raised hover:text-ink">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          <CategoryRow
            label="All items"
            count={totalItems}
            active={selectedId === null}
            onClick={() => onSelect(null)}
          />

          {(categories ?? []).map((category) => (
            <CategoryRow
              key={category.id}
              label={category.name}
              count={category.productCount}
              active={selectedId === category.id}
              muted={!category.isActive}
              onClick={() => onSelect(category.id)}
              onEdit={canUpdate ? () => onEdit(category) : undefined}
              onDelete={canDelete ? () => onDelete(category) : undefined}
            />
          ))}

          {categories && categories.length === 0 && (
            <p className="px-2 py-3 text-xs text-ink-faint">No categories yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  label,
  count,
  active,
  muted,
  onClick,
  onEdit,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={clsx(
        'group flex items-center justify-between gap-2 rounded-control px-2.5 py-2 text-sm transition-colors',
        active ? 'bg-ember-soft text-ember' : 'text-ink-soft hover:bg-raised hover:text-ink',
      )}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={clsx('truncate', muted && 'text-ink-faint')}>{label}</span>
      </button>

      <span className="numeric shrink-0 text-xs text-ink-faint">{count}</span>

      {(onEdit || onDelete) && (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {onEdit && (
            <button onClick={onEdit} className="rounded p-1 hover:bg-hover" aria-label="Edit category">
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="rounded p-1 text-chili hover:bg-chili-soft" aria-label="Remove category">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- products

function ProductCard({
  product,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  product: Product;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="panel-interactive flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold text-ink">{product.name}</h3>
          {product.category && <p className="mt-0.5 text-xs text-ink-faint">{product.category.name}</p>}
        </div>

        <span className={clsx('pill shrink-0', product.isAvailable ? 'pill-mint' : 'pill-muted')}>
          <span className="status-dot" />
          {product.isAvailable ? 'Available' : 'Off menu'}
        </span>
      </div>

      {product.description && (
        <p className="mt-2.5 line-clamp-2 text-xs text-ink-soft">{product.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {product.isFeatured && <span className="pill pill-ember">Featured</span>}
        {product.variants.length > 0 && (
          <span className="pill pill-sky">
            {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
          </span>
        )}
        {product.modifierGroups.length > 0 && (
          <span className="pill pill-muted">
            {product.modifierGroups.length} add-on group{product.modifierGroups.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <span className="numeric text-lg font-semibold text-ink">Rs {product.basePrice.toLocaleString()}</span>

        {(canUpdate || canDelete) && (
          <div className="flex items-center gap-1">
            {canUpdate && (
              <button onClick={onEdit} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete} className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// --------------------------------------------------------- modifier groups

function ModifierGroupsSection({
  groups,
  isLoading,
  canCreate,
  canUpdate,
  canDelete,
  onAdd,
  onEdit,
  onDelete,
}: {
  groups: ModifierGroup[] | undefined;
  isLoading: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (group: ModifierGroup) => void;
  onDelete: (group: ModifierGroup) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-lg text-sm text-ink-soft">
          Reusable choices, like spice level or size, that attach to any number of items -
          set them up once here, then pick them when editing an item.
        </p>
        {canCreate && (
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Add group
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <article key={group.id} className="panel-interactive p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-sm font-semibold text-ink">{group.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {group.selectionType === 'single' ? 'Pick one' : `Pick ${group.minSelections}–${group.maxSelections}`}
                    {group.isRequired ? ' · required' : ''}
                  </p>
                </div>
                {(canUpdate || canDelete) && (
                  <div className="flex shrink-0 items-center gap-1">
                    {canUpdate && (
                      <button onClick={() => onEdit(group)} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => onDelete(group)} className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {group.modifiers.slice(0, 4).map((modifier) => (
                  <li key={modifier.id} className="flex items-center justify-between text-xs">
                    <span className={clsx('text-ink-soft', !modifier.isAvailable && 'text-ink-faint line-through')}>
                      {modifier.name}
                    </span>
                    <span className="numeric text-ink-faint">
                      {modifier.priceDelta > 0 ? `+Rs ${modifier.priceDelta}` : 'Free'}
                    </span>
                  </li>
                ))}
                {group.modifiers.length > 4 && (
                  <li className="text-xs text-ink-faint">+{group.modifiers.length - 4} more</li>
                )}
                {group.modifiers.length === 0 && <li className="text-xs text-ink-faint">No choices added yet.</li>}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sliders className="h-6 w-6" />}
          title="No modifier groups yet"
          description="Things like spice level, size or extras. Build one, then attach it to any item."
          action={
            canCreate && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={onAdd}>
                Add group
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------- forms

function CategoryModal({
  editing,
  categories,
  onClose,
}: {
  editing?: MenuCategory;
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '');
  const [parentId, setParentId] = useState<string>(editing?.parentId ? String(editing.parentId) : '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? apiPut(endpoints.menu.category(editing.id), payload)
        : apiPost(endpoints.menu.categories, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] });
      toast.success(editing ? 'Category updated.' : 'Category added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const otherCategories = categories.filter((category) => category.id !== editing?.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            onClick={() =>
              save.mutate({
                name,
                description: description || null,
                imageUrl: imageUrl || null,
                parentId: parentId ? Number(parentId) : null,
                isActive,
              })
            }
            disabled={name.trim().length < 2}
          >
            {editing ? 'Save changes' : 'Add category'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Starters" />

        <div>
          <label className="field-label">Description</label>
          <textarea
            rows={2}
            className="field resize-none"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional, shown on the public menu."
          />
        </div>

        <ImageUploadField label="Image" value={imageUrl} onChange={setImageUrl} />

        {otherCategories.length > 0 && (
          <div>
            <label className="field-label">Parent category</label>
            <select className="field" value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">None — top level</option>
              {otherCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
          <span className="text-sm text-ink">Active</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 accent-[rgb(245_165_36)]"
          />
        </label>
      </div>
    </Modal>
  );
}

interface VariantDraft {
  id?: number;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}

function ProductModal({
  editing,
  categories,
  modifierGroups,
  defaultCategoryId,
  onClose,
}: {
  editing?: Product;
  categories: MenuCategory[];
  modifierGroups: ModifierGroup[];
  defaultCategoryId: number | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>(
    editing ? String(editing.categoryId) : defaultCategoryId ? String(defaultCategoryId) : '',
  );
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '');
  const [basePrice, setBasePrice] = useState(editing ? String(editing.basePrice) : '');
  const [prepMinutes, setPrepMinutes] = useState(editing ? String(editing.preparationMinutes) : '10');
  const [isAvailable, setIsAvailable] = useState(editing?.isAvailable ?? true);
  const [isFeatured, setIsFeatured] = useState(editing?.isFeatured ?? false);
  const [variants, setVariants] = useState<VariantDraft[]>(
    editing?.variants.map((variant: ProductVariant) => ({
      id: variant.id,
      name: variant.name,
      priceDelta: variant.priceDelta,
      isDefault: variant.isDefault,
    })) ?? [],
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(
    editing?.modifierGroups.map((group) => group.id) ?? [],
  );

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? apiPut(endpoints.menu.product(editing.id), payload)
        : apiPost(endpoints.menu.products, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] });
      toast.success(editing ? 'Item updated.' : 'Item added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const price = Number(basePrice);
  const canSave =
    name.trim().length >= 2 && categoryId !== '' && basePrice !== '' && !Number.isNaN(price) && price >= 0;

  const addVariant = () => setVariants((current) => [...current, { name: '', priceDelta: 0, isDefault: false }]);
  const updateVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((current) => current.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  const removeVariant = (index: number) => setVariants((current) => current.filter((_, i) => i !== index));

  const toggleGroup = (id: number) =>
    setSelectedGroupIds((current) => (current.includes(id) ? current.filter((g) => g !== id) : [...current, id]));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit item' : 'Add item'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                categoryId: Number(categoryId),
                name,
                description: description || null,
                imageUrl: imageUrl || null,
                basePrice: price,
                preparationMinutes: Number(prepMinutes) || 0,
                isAvailable,
                isFeatured,
                variants: variants
                  .filter((variant) => variant.name.trim().length > 0)
                  .map((variant, index) => ({ ...variant, sortOrder: index })),
                modifierGroupIds: selectedGroupIds,
              })
            }
          >
            {editing ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">Category</label>
            <select className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="" disabled>Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>

          <TextField
            label="Base price (Rs)"
            type="number"
            min={0}
            step="0.01"
            value={basePrice}
            onChange={(event) => setBasePrice(event.target.value)}
            placeholder="450"
          />
        </div>

        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Chicken Karahi" />

        <div>
          <label className="field-label">Description</label>
          <textarea
            rows={2}
            className="field resize-none"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <ImageUploadField label="Image" value={imageUrl} onChange={setImageUrl} />

        <TextField
          label="Prep time (minutes)"
          type="number"
          min={0}
          value={prepMinutes}
          onChange={(event) => setPrepMinutes(event.target.value)}
        />

        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} className="h-4 w-4 accent-[rgb(245_165_36)]" />
            Available
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isFeatured} onChange={(event) => setIsFeatured(event.target.checked)} className="h-4 w-4 accent-[rgb(245_165_36)]" />
            Featured
          </label>
        </div>

        <div className="border-t border-line pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <label className="field-label mb-0">Variants</label>
            <button onClick={addVariant} className="flex items-center gap-1 text-xs font-medium text-ember hover:underline">
              <Plus className="h-3 w-3" /> Add variant
            </button>
          </div>

          {variants.length === 0 ? (
            <p className="text-xs text-ink-faint">
              Optional. Add sizes like Small / Large if this item comes in more than one.
            </p>
          ) : (
            <div className="space-y-2">
              {variants.map((variant, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    className="field flex-1"
                    placeholder="Large"
                    value={variant.name}
                    onChange={(event) => updateVariant(index, { name: event.target.value })}
                  />
                  <input
                    type="number"
                    className="field w-28"
                    placeholder="+Rs"
                    value={variant.priceDelta}
                    onChange={(event) => updateVariant(index, { priceDelta: Number(event.target.value) || 0 })}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={variant.isDefault}
                      onChange={(event) => updateVariant(index, { isDefault: event.target.checked })}
                      className="h-3.5 w-3.5 accent-[rgb(245_165_36)]"
                    />
                    Default
                  </label>
                  <button onClick={() => removeVariant(index)} className="shrink-0 rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {modifierGroups.length > 0 && (
          <div className="border-t border-line pt-4">
            <label className="field-label">Modifier groups</label>
            <div className="flex flex-wrap gap-2">
              {modifierGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  className={clsx(
                    'rounded-control border px-3 py-1.5 text-xs transition-colors',
                    selectedGroupIds.includes(group.id)
                      ? 'border-ember bg-ember-soft text-ember'
                      : 'border-line bg-raised text-ink-soft hover:border-line-strong',
                  )}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface ModifierDraft {
  id?: number;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

function ModifierGroupModal({ editing, onClose }: { editing?: ModifierGroup; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [selectionType, setSelectionType] = useState<'single' | 'multiple'>(editing?.selectionType ?? 'single');
  const [minSelections, setMinSelections] = useState(String(editing?.minSelections ?? 0));
  const [maxSelections, setMaxSelections] = useState(String(editing?.maxSelections ?? 1));
  const [isRequired, setIsRequired] = useState(editing?.isRequired ?? false);
  const [modifiers, setModifiers] = useState<ModifierDraft[]>(
    editing?.modifiers.map((modifier: Modifier) => ({
      id: modifier.id,
      name: modifier.name,
      priceDelta: modifier.priceDelta,
      isAvailable: modifier.isAvailable,
    })) ?? [],
  );

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? apiPut(endpoints.menu.modifierGroup(editing.id), payload)
        : apiPost(endpoints.menu.modifierGroups, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', 'modifierGroups'] });
      toast.success(editing ? 'Modifier group updated.' : 'Modifier group added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const addModifier = () => setModifiers((current) => [...current, { name: '', priceDelta: 0, isAvailable: true }]);
  const updateModifier = (index: number, patch: Partial<ModifierDraft>) =>
    setModifiers((current) => current.map((modifier, i) => (i === index ? { ...modifier, ...patch } : modifier)));
  const removeModifier = (index: number) => setModifiers((current) => current.filter((_, i) => i !== index));

  const canSave = name.trim().length >= 2 && Number(maxSelections) >= Number(minSelections);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit modifier group' : 'Add modifier group'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                name,
                selectionType,
                minSelections: Number(minSelections) || 0,
                maxSelections: Number(maxSelections) || 1,
                isRequired,
                modifiers: modifiers
                  .filter((modifier) => modifier.name.trim().length > 0)
                  .map((modifier, index) => ({ ...modifier, sortOrder: index })),
              })
            }
          >
            {editing ? 'Save changes' : 'Add group'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Spice level" />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label">Selection</label>
            <select className="field" value={selectionType} onChange={(event) => setSelectionType(event.target.value as 'single' | 'multiple')}>
              <option value="single">Pick one</option>
              <option value="multiple">Pick multiple</option>
            </select>
          </div>
          <TextField label="Min" type="number" min={0} value={minSelections} onChange={(event) => setMinSelections(event.target.value)} />
          <TextField label="Max" type="number" min={1} value={maxSelections} onChange={(event) => setMaxSelections(event.target.value)} />
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
          <span className="text-sm text-ink">Required — customer must choose before ordering</span>
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-[rgb(245_165_36)]"
          />
        </label>

        <div className="border-t border-line pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <label className="field-label mb-0">Choices</label>
            <button onClick={addModifier} className="flex items-center gap-1 text-xs font-medium text-ember hover:underline">
              <Plus className="h-3 w-3" /> Add choice
            </button>
          </div>

          {modifiers.length === 0 ? (
            <p className="text-xs text-ink-faint">Add at least one choice, like "Mild", "Medium" or "Hot".</p>
          ) : (
            <div className="space-y-2">
              {modifiers.map((modifier, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    className="field flex-1"
                    placeholder="Extra cheese"
                    value={modifier.name}
                    onChange={(event) => updateModifier(index, { name: event.target.value })}
                  />
                  <input
                    type="number"
                    className="field w-28"
                    placeholder="+Rs"
                    value={modifier.priceDelta}
                    onChange={(event) => updateModifier(index, { priceDelta: Number(event.target.value) || 0 })}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={modifier.isAvailable}
                      onChange={(event) => updateModifier(index, { isAvailable: event.target.checked })}
                      className="h-3.5 w-3.5 accent-[rgb(245_165_36)]"
                    />
                    Available
                  </label>
                  <button onClick={() => removeModifier(index)} className="shrink-0 rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
