"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

//in backend, Category it has one more field being a inv item id array, but frontend only uses 
//id and name
type Category = { id: string; name: string };
type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  categories: Category[];
};
type Filter = "all" | "available" | "empty" | "negative";
type IconName =
  | "box"
  | "grid"
  | "plus"
  | "search"
  | "refresh"
  | "arrow"
  | "close"
  | "check"
  | "alert"
  | "layers";
type Editor = { kind: "create" } | { kind: "quantity" | "edit"; item: InventoryItem };

function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    box: (
      <>
        <path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" />
        <path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5V15" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 6a8 8 0 0 1 13.2 3M4.7 15a8 8 0 0 0 13.2 3" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
  };
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path = "", options?: RequestInit, base = "/api/items"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: options?.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(
        "The inventory service took too long to respond. Please refresh and try again.",
        0,
      );
    }
    if (options?.signal?.aborted) throw error;
    throw new ApiError(
      "Couldn’t reach the inventory service. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      data?.error || "The inventory service is unavailable. Please try again.",
      response.status,
    );
  }
  if (data === null)
    throw new ApiError(
      "The inventory service returned an unexpected response. Please try again.",
      0,
    );
  return data as T;
}

const formatNumber = (value: number) => value.toLocaleString("en-CA");
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

function StockBadge({ quantity }: { quantity: number }) {
  const status =
    quantity > 0 ? "available" : quantity === 0 ? "empty" : "negative";
  return (
    <span className={`stock-badge ${status}`}>
      <span />
      {status === "available"
        ? "In stock"
        : status === "empty"
          ? "Out of stock"
          : "Negative stock"}
    </span>
  );
}

function useCategories(enabled = true) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(enabled);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoryAttempt, setCategoryAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      setCategoriesLoading(true);
      setCategoriesError("");
      try {
        const data = await request<Category[]>("", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        }, "/api/categories");
        if (!controller.signal.aborted) setCategories(data);
      } catch (error) {
        if (!controller.signal.aborted) setCategoriesError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [enabled, categoryAttempt]);

  return { categories, categoriesLoading, categoriesError, setCategoryAttempt };
}

function ItemEditor({
  editor,
  onClose,
  onSaved,
  onReload,
}: {
  editor: Editor;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
  onReload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(
    editor.kind !== "create" ? editor.item.name : "",
  );
  const [quantity, setQuantity] = useState(
    editor.kind !== "create" ? String(editor.item.quantity) : "0",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const updating = editor.kind === "quantity";
  const [categoryIds, setCategoryIds] = useState<string[]>(
    editor.kind === "edit" ? editor.item.categories.map((category) => category.id) : [],
  );
  const { categories, categoriesLoading, categoriesError, setCategoryAttempt } = useCategories(!updating);

  function toggleCategory(id: string) {
    setCategoryIds((selected) =>
      selected.includes(id)
        ? selected.filter((categoryId) => categoryId !== id)
        : [...selected, id]
    );
  }

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || conflict || (editor.kind === "edit" && (categoriesLoading || categoriesError))) return;
    const count = Number(quantity);
    if (!name.trim()) {
      setError("Enter an item name.");
      return;
    }
    if (editor.kind !== "edit" && (
      !quantity.trim() ||
      !Number.isInteger(count) ||
      count < -2147483648 ||
      count > 2147483647
    )) {
      setError(
        "Quantity must be a whole number from -2,147,483,648 to 2,147,483,647.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const item = await request<InventoryItem>(
        editor.kind === "create" ? "" : `/${encodeURIComponent(editor.item.id)}${updating ? "/quantity" : ""}`,
        {
          method: editor.kind === "create" ? "POST" : "PATCH",
          body: JSON.stringify(
            editor.kind === "quantity"
              ? { quantity: count, version: editor.item.version }
              : editor.kind === "edit"
                ? { name: name.trim(), categoryIds, version: editor.item.version }
                : { name: name.trim(), quantity: count, categoryIds },
          ),
        },
      );
      onSaved(item);
    } catch (error) {
      setError(errorMessage(error));
      setConflict(
        error instanceof ApiError &&
        (error.status === 409 || error.status === 404),
      );
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="item-dialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <span className="dialog-icon">
            <Icon name={updating ? "layers" : "box"} />
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={saving}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="editor-title">
          {updating ? "Update quantity" : editor.kind === "edit" ? "Edit item" : "Add an inventory item"}
        </h2>
        {updating ? (
          <div className="editing-item">
            <Icon name="box" />
            <div>
              <strong>{editor.item.name}</strong>
              <span>
                Current quantity: {formatNumber(editor.item.quantity)}
              </span>
            </div>
          </div>
        ) : (
          <label className="field">
            Item name
            <input
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Arduino Uno R3"
              disabled={saving || conflict}
            />
          </label>
        )}
        {editor.kind !== "edit" && (<label className="field">
          {updating ? "New quantity" : "Initial quantity"}
          <input
            autoFocus={updating}
            type="number"
            required
            step="1"
            min="-2147483648"
            max="2147483647"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={saving || conflict}
          />
        </label>)}
        {!updating && (
          <fieldset className="category-field" disabled={saving || conflict}>
            <legend>Categories</legend>
            <p className="category-help">Select any that apply, or leave blank for no category.</p>

            <div className="category-options" aria-busy={categoriesLoading}>
              {categoriesLoading && (
                <p className="category-empty" role="status">Loading categories…</p>
              )}
              {categoriesError && (
                <div className="category-empty" role="alert">
                  <p>Could not load categories. {categoriesError}</p>
                  <button type="button" className="button secondary" onClick={() => setCategoryAttempt((attempt) => attempt + 1)}>
                    Try again
                  </button>
                </div>
              )}
              {categories.map((category) => (
                <label className="category-option" key={category.id}>
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
              {!categoriesLoading && !categoriesError && categories.length === 0 && (
                <p className="category-empty">No categories available.</p>
              )}
            </div>
          </fieldset>
        )}
        {error && (
          <div className="form-error" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          {conflict ? (
            <button type="button" className="button primary" onClick={onReload}>
              <Icon name="refresh" />
              Reload inventory
            </button>
          ) : (
            <button
              className="button primary"
              type="submit"
              disabled={saving || (editor.kind === "edit" && (categoriesLoading || Boolean(categoriesError)))}
            >
              {saving ? "Saving…" : updating ? "Save quantity" : editor.kind === "edit" ? "Save changes" : "Add item"}
              {!saving && <Icon name={editor.kind !== "create" ? "check" : "plus"} />}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

function CategoryDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="category-drawer"
      aria-labelledby="category-drawer-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="category-drawer-heading">
        <h2 id="category-drawer-title">Filter by category</h2>
        <button type="button" className="icon-button" aria-label="Close category filter" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="category-drawer-options">{children}</div>
      <div className="category-drawer-footer">
        <button type="button" className="button primary" onClick={onClose}>Done</button>
      </div>
    </dialog>
  );
}

export default function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("name");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showUncategorized, setShowUncategorized] = useState(false);
  const { categories, categoriesLoading, categoriesError, setCategoryAttempt } = useCategories();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const loadItems = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await request<InventoryItem[]>("", {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!controller.signal.aborted) {
        setItems(data);
        setLastLoaded(new Date());
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
    return () => activeRequest.current?.abort();
  }, [loadItems]);

  const counts = {
    all: items?.length ?? 0,
    available: items?.filter((item) => item.quantity > 0).length ?? 0,
    empty: items?.filter((item) => item.quantity === 0).length ?? 0,
    negative: items?.filter((item) => item.quantity < 0).length ?? 0,
  };
  const visibleItems = (items ?? [])
    .filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      return (
        matchesSearch &&
        ((selectedCategories.length === 0 && !showUncategorized) ||
          item.categories.some((category) => selectedCategories.includes(category.id)) ||
          (showUncategorized && item.categories.length === 0)) &&
        (filter === "all" ||
          (filter === "available" && item.quantity > 0) ||
          (filter === "empty" && item.quantity === 0) ||
          (filter === "negative" && item.quantity < 0))
      );
    })
    .sort((a, b) => {
      if (sort === "quantity-asc")
        return a.quantity - b.quantity || a.name.localeCompare(b.name);
      if (sort === "quantity-desc")
        return b.quantity - a.quantity || a.name.localeCompare(b.name);
      if (sort === "updated")
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All items" },
    { value: "available", label: "In stock" },
    { value: "empty", label: "Out of stock" },
    { value: "negative", label: "Negative stock" },
  ];

  function saved(item: InventoryItem) {
    const created = editor?.kind === "create";
    setItems((current) =>
      created
        ? [...(current ?? []), item]
        : (current ?? []).map((existing) =>
          existing.id === item.id ? item : existing,
        ),
    );
    setNotice(
      created
        ? `${item.name} added to inventory.`
        : editor?.kind === "edit"
          ? `${item.name} updated.`
          : `Quantity updated for ${item.name}.`,
    );
    if (created) {
      setSearch("");
      setFilter("all");
      setSelectedCategories([]);
      setShowUncategorized(false);
    }
    setEditor(null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to inventory
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="IEEE UofT inventory home">
          <Image
            className="brand-logo"
            src="/ieee-logo.svg"
            alt=""
            width={48}
            height={48}
            loading="eager"
          />
          <span className="brand-wordmark">IEEE UofT</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="/" aria-current="page">
            <Icon name="grid" />
            Inventory
            <span className="nav-indicator" />
          </a>
        </nav>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>Inventory</strong>
          </div>
          <span className="branch-tag">IEEE UofT</span>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">HARDWARE MANAGEMENT</div>
              <h1>Inventory</h1>
            </div>
            <button
              className="button primary"
              onClick={() => setEditor({ kind: "create" })}
              disabled={loading || !!error}
            >
              <Icon name="plus" />
              Add item
            </button>
          </div>

          <div className="summary-grid" aria-label="Inventory summary">
            <div className="summary-card">
              <div className="summary-label">
                Total items
                <span className="summary-icon blue">
                  <Icon name="box" />
                </span>
              </div>
              <strong>{items ? formatNumber(items.length) : "—"}</strong>
            </div>
            <div className="summary-card">
              <div className="summary-label">
                Total units
                <span className="summary-icon teal">
                  <Icon name="layers" />
                </span>
              </div>
              <strong>
                {items
                  ? formatNumber(
                    items.reduce((total, item) => total + item.quantity, 0),
                  )
                  : "—"}
              </strong>
            </div>
            <div className="summary-card">
              <div className="summary-label">
                Needs attention
                <span className="summary-icon amber">
                  <Icon name="alert" />
                </span>
              </div>
              <strong>
                {items ? formatNumber(counts.empty + counts.negative) : "—"}
              </strong>
            </div>
          </div>

          {notice && (
            <div className="notice" role="status">
              <Icon name="check" />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="alert" />
              <div>
                <strong>Couldn’t load inventory</strong>
                <p>
                  {error}
                  {items ? " The items below may be out of date." : ""}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => void loadItems()}
                disabled={loading}
              >
                Try again
              </button>
            </div>
          )}

          <section
            className="inventory-panel"
            aria-labelledby="inventory-title"
            aria-busy={loading}
          >
            <div className="panel-heading">
              <div>
                <h2 id="inventory-title">
                  Your inventory{" "}
                  <span className="count-tag">
                    {items ? formatNumber(items.length) : "—"} items
                  </span>
                </h2>
              </div>
              <button
                className="button secondary refresh-button"
                disabled={loading}
                onClick={() => void loadItems()}
              >
                <Icon name="refresh" className={loading ? "spinning" : ""} />
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
            <div className="inventory-controls">
              <div
                className="filter-tabs"
                role="group"
                aria-label="Filter by stock status"
              >
                {filters.map((tab) => (
                  <button
                    key={tab.value}
                    className={filter === tab.value ? "selected" : ""}
                    aria-pressed={filter === tab.value}
                    onClick={() => setFilter(tab.value)}
                  >
                    {tab.label}
                    <span>{items ? counts[tab.value] : "—"}</span>
                  </button>
                ))}
              </div>
              <div className="search-sort">
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    type="search"
                    placeholder="Search items…"
                    aria-label="Search items"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <div className="filter-sort">
                  <button
                    type="button"
                    className="category-filter"
                    aria-haspopup="dialog"
                    aria-expanded={categoryDrawerOpen}
                    onClick={() => setCategoryDrawerOpen(true)}
                  >
                    Category: {selectedCategories.length || showUncategorized ? `${selectedCategories.length + Number(showUncategorized)} selected` : "All categories"}
                  </button>
                  <label className="sort-field">
                    <span>Sort by:</span>
                    <select
                      aria-label="Sort items"
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                    >
                      <option value="name">Name A–Z</option>
                      <option value="quantity-asc">Quantity: low to high</option>
                      <option value="quantity-desc">Quantity: high to low</option>
                      <option value="updated">Recently updated</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Item name</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Stock status</th>
                    <th scope="col">Last updated</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items !== null &&
                    visibleItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="item-name">
                            <span className="item-symbol">
                              <Icon name="box" />
                            </span>
                            <div className="item-details">
                              <strong>{item.name}</strong>
                              <ul className="item-categories" aria-label="Categories">
                                {item.categories.length > 0 ? item.categories.map((category) => (
                                  <li className="item-category" key={category.id}>{category.name}</li>
                                )) : (
                                  <li className="item-category uncategorized">Uncategorized</li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`quantity ${item.quantity < 0 ? "negative-quantity" : ""}`}
                          >
                            {formatNumber(item.quantity)}
                          </span>
                          <span className="unit-label">units</span>
                        </td>
                        <td>
                          <StockBadge quantity={item.quantity} />
                        </td>
                        <td className="updated-cell">
                          <time
                            dateTime={item.updatedAt}
                            title={new Date(item.updatedAt).toLocaleString(
                              "en-CA",
                            )}
                          >
                            {new Date(item.updatedAt).toLocaleDateString(
                              "en-CA",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </time>
                        </td>
                        <td className="action-cell">
                          <div className="item-actions">
                            <button
                              className="row-action"
                              disabled={loading || !!error}
                              aria-label={`Update quantity for ${item.name}`}
                              onClick={() =>
                                setEditor({ kind: "quantity", item })
                              }
                            >
                              Update quantity
                              <Icon name="arrow" />
                            </button>
                            <button
                              className="row-action"
                              disabled={loading || !!error}
                              aria-label={`Edit item ${item.name}`}
                              onClick={() => setEditor({ kind: "edit", item })}
                            >
                              Edit item
                              <Icon name="arrow" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {items === null && loading ? (
              <div className="empty-state" role="status">
                <span className="empty-icon">
                  <Icon name="refresh" className="spinning" />
                </span>
                <h3>Loading your inventory</h3>
              </div>
            ) : items === null ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="alert" />
                </span>
                <h3>Inventory is unavailable</h3>
              </div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="box" />
                </span>
                <h3>No items yet</h3>
                <button
                  className="button primary"
                  disabled={loading || !!error}
                  onClick={() => setEditor({ kind: "create" })}
                >
                  <Icon name="plus" />
                  Add your first item
                </button>
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="search" />
                </span>
                <h3>No matching items</h3>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setSelectedCategories([]);
                    setShowUncategorized(false);
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : null}

            <div className="panel-footer">
              <span aria-live="polite">
                {items
                  ? `Showing ${formatNumber(visibleItems.length)} of ${formatNumber(visibleItems.length)} items`
                  : "Inventory items"}
              </span>
              <span className="sync-status">
                <span className={error ? "status-dot offline" : "status-dot"} />
                {loading
                  ? "Syncing inventory…"
                  : error
                    ? "Connection issue"
                    : lastLoaded
                      ? `Last synced at ${lastLoaded.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}`
                      : "Not connected"}
              </span>
            </div>
          </section>
          <footer className="page-footer">
            <span>IEEE University of Toronto</span>
          </footer>
        </main>
      </div>
      {categoryDrawerOpen && (
        <CategoryDrawer onClose={() => setCategoryDrawerOpen(false)}>
          <button type="button" className="button secondary" onClick={() => {
            setSelectedCategories([]);
            setShowUncategorized(false);
          }}>Clear selection</button>
          <p className="category-help">Match any selected category.</p>
          <label className="category-option">
            <input type="checkbox" checked={showUncategorized} onChange={(event) => setShowUncategorized(event.target.checked)} />
            <span>Uncategorized</span>
          </label>
          {categoriesLoading && <p className="category-empty" role="status">Loading categories…</p>}
          {categoriesError && <div role="alert" className="category-empty">
            <p>{categoriesError}</p>
            <button type="button" className="button secondary" onClick={() => setCategoryAttempt((attempt) => attempt + 1)}>Try again</button>
          </div>}
          {categories.map((category) => (
            <label className="category-option" key={category.id}>
              <input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={() => setSelectedCategories((selected) => selected.includes(category.id) ? selected.filter((id) => id !== category.id) : [...selected, category.id])} />
              <span>{category.name}</span>
            </label>
          ))}
        </CategoryDrawer>
      )}
      {editor && (
        <ItemEditor
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
          onReload={() => {
            setEditor(null);
            void loadItems();
          }}
        />
      )}
    </div>
  );
}
