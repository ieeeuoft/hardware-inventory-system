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

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
type Filter = "all" | "available" | "empty";
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
type Editor = { kind: "create" } | { kind: "quantity"; item: InventoryItem };

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

async function request<T>(path = "", options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/items${path}`, {
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
  const status = quantity > 0 ? "available" : "empty";
  return (
    <span className={`stock-badge ${status}`}>
      <span />
      {status === "available" ? "In stock" : "Out of stock"}
    </span>
  );
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
    editor.kind === "quantity" ? editor.item.name : "",
  );
  const [quantity, setQuantity] = useState(
    editor.kind === "quantity" ? String(editor.item.quantity) : "0",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const updating = editor.kind === "quantity";

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
    if (saving || conflict) return;
    const count = Number(quantity);
    if (!name.trim()) {
      setError("Enter an item name.");
      return;
    }
    if (
      !quantity.trim() ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 2147483647
    ) {
      setError("Quantity must be a whole number from 0 to 2,147,483,647.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const item = await request<InventoryItem>(
        updating ? `/${encodeURIComponent(editor.item.id)}/quantity` : "",
        {
          method: updating ? "PATCH" : "POST",
          body: JSON.stringify(
            updating
              ? { quantity: count, version: editor.item.version }
              : { name: name.trim(), quantity: count },
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
          {updating ? "Update quantity" : "Add an inventory item"}
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
              disabled={saving}
            />
          </label>
        )}
        <label className="field">
          {updating ? "New quantity" : "Initial quantity"}
          <input
            autoFocus={updating}
            type="number"
            required
            step="1"
            min="0"
            max="2147483647"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={saving || conflict}
          />
        </label>
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
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : updating ? "Save quantity" : "Add item"}
              {!saving && <Icon name={updating ? "check" : "plus"} />}
            </button>
          )}
        </div>
      </form>
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
  };
  const visibleItems = (items ?? [])
    .filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      return (
        matchesSearch &&
        (filter === "all" ||
          (filter === "available" && item.quantity > 0) ||
          (filter === "empty" && item.quantity === 0))
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
        : `Quantity updated for ${item.name}.`,
    );
    if (created) {
      setSearch("");
      setFilter("all");
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
                {items ? formatNumber(counts.empty) : "—"}
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
                            <strong>{item.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="quantity">
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
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : null}

            <div className="panel-footer">
              <span aria-live="polite">
                {items
                  ? `Showing ${formatNumber(visibleItems.length)} of ${formatNumber(items.length)} items`
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
