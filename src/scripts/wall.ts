import { WORKER_URL, apiUrl } from "~/lib/api";
import { apiMessage, OwnerApiError, ownerRequest } from "~/lib/wall-admin/client";

type Kind = "folder" | "photo" | "note";
type Item = {
  id: string;
  parent: string;
  kind: Kind;
  title: string;
  x: number;
  y: number;
  rotation?: number;
  src?: string;
  text?: string;
  description?: string;
  alt?: string;
  mediaId?: string;
  width?: number;
  height?: number;
};
const initial: Item[] = [
  {
    id: "f1",
    parent: "root",
    kind: "folder",
    title: "Somewhere else",
    x: 95,
    y: 70,
    description: "Photos and notes from places worth remembering.",
  },
  {
    id: "f2",
    parent: "root",
    kind: "folder",
    title: "Things I made",
    x: 575,
    y: 310,
    description: "A few projects and the moments that went into making them.",
  },
  {
    id: "p1",
    parent: "root",
    kind: "photo",
    title: "A little inspiration",
    x: 330,
    y: 55,
    rotation: -4,
    src: "/work/poet/home-hero.webp",
    text: "A sample image from the portfolio. A little reminder to keep looking.",
  },
  {
    id: "n1",
    parent: "root",
    kind: "note",
    title: "A note to self",
    x: 90,
    y: 340,
    rotation: 3,
    text: "Collect moments, not just milestones.",
  },
  {
    id: "p2",
    parent: "root",
    kind: "photo",
    title: "On the wall",
    x: 355,
    y: 340,
    rotation: 4,
    src: "/work/poet/wall.webp",
    text: "A sample image from the portfolio.",
  },
  {
    id: "f3",
    parent: "f1",
    kind: "folder",
    title: "Little details",
    x: 390,
    y: 70,
    description: "Small things I wanted to look at again.",
  },
  {
    id: "p3",
    parent: "f1",
    kind: "photo",
    title: "A letter",
    x: 100,
    y: 90,
    rotation: -3,
    src: "/work/poet/letter.webp",
    text: "A sample image from the portfolio.",
  },
  {
    id: "n2",
    parent: "f1",
    kind: "note",
    title: "Remember",
    x: 370,
    y: 300,
    rotation: 3,
    text: "The best days have room to wander.",
  },
  {
    id: "p4",
    parent: "f3",
    kind: "photo",
    title: "A small detail",
    x: 120,
    y: 100,
    rotation: 2,
    src: "/work/poet/form.webp",
    text: "A sample image from the portfolio.",
  },
  {
    id: "p5",
    parent: "f2",
    kind: "photo",
    title: "Work in progress",
    x: 130,
    y: 100,
    rotation: -2,
    src: "/work/openportfo/portfolio.webp",
    text: "A sample image from the portfolio.",
  },
];
const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
const canvas = $<HTMLDivElement>("#wall-canvas");
const world = $<HTMLDivElement>("#wall-world");
const tree = $("#wall-tree");
const crumbs = $("#wall-crumbs");
const detail = $<HTMLDialogElement>("#wall-detail");
const detailContent = $("#wall-detail-content");
const app = $("#wall-app");
const hosted = app.dataset.hosted === "true";
const hostedApi = "/api/admin/wall";
const mediaUrl = (id: string, variant: "thumbnail" | "detail") =>
  hosted ? `${hostedApi}/media/${id}/${variant}` : apiUrl(`/wall/media/${id}/${variant}`);
const index = $("#wall-index");
const indexToggle = $("#index-toggle");
const expandButton = $("#expand-all");
const editButton = $("#edit-toggle");
const actions = $("#wall-actions");
const mobileIndex = window.matchMedia("(max-width: 680px)");
const rootFolder = {
  id: "root",
  title: "All memories",
  description: "The main wall, with loose memories and folders to explore.",
};
type FolderView = { x: number; y: number; scale: number };
const storageKey = "personal-wall-prototype-v1";
let items: Item[] = hosted ? [] : structuredClone(initial);
type HostedDraft = {
  version: number;
  baseRevision: string | null;
  activeRevision: string | null;
  items: Item[];
};
let serverDraft: Omit<HostedDraft, "items"> | undefined;
let hostedDirty = false;
let busy = false;
let stale = false;
let leaving = false;
let hasLocalDraft = false;
const database =
  !hosted && import.meta.env.DEV
    ? new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("personal-wall", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("drafts");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
    : null;
async function readDraft(): Promise<Item[] | null> {
  if (!database) return null;
  const db = await database;
  const stored = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction("drafts", "readonly").objectStore("drafts").get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (Array.isArray(stored)) return stored as Item[];
  const legacy = localStorage.getItem(storageKey);
  if (legacy) {
    const parsed: unknown = JSON.parse(legacy);
    if (Array.isArray(parsed)) {
      await writeDraft(parsed as Item[]);
      localStorage.removeItem(storageKey);
      return parsed as Item[];
    }
  }
  return null;
}
async function writeDraft(snapshot: Item[]) {
  if (!database) throw new Error("Local editing is unavailable");
  const db = await database;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(snapshot, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
let saveQueue = Promise.resolve();
let current = "root",
  editing = false,
  scale = 1,
  offsetX = 0,
  offsetY = 0;
let expanded = false;
let folderView: FolderView | undefined;
let fitScale = 1;
let canvasWidth = canvas.clientWidth;
let canvasHeight = canvas.clientHeight;
let suppressClick = false;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: {
  x: number;
  y: number;
  ox: number;
  oy: number;
  distance?: number;
  scale?: number;
  worldX?: number;
  worldY?: number;
} | null = null;
let drag: { id: string; x: number; y: number; ix: number; iy: number; moved: boolean } | null =
  null;
const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
function save() {
  if (hosted) {
    hostedDirty = true;
    hostedControls("Unsaved changes.");
    return;
  }
  hasLocalDraft = true;
  const snapshot = structuredClone(items);
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => writeDraft(snapshot))
    .catch(() => {
      showState(
        "Draft could not be saved. Your changes are still open; export them now and free browser storage before retrying.",
      );
      alert("Draft could not be saved. Export it now and free browser storage before retrying.");
    });
}
function transform() {
  world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  $("#zoom-level").textContent = `${Math.round(scale * 100)}%`;
}
function limitScale(next: number) {
  return Math.max(Math.min(0.3, fitScale), Math.min(2.2, next));
}
function zoom(next: number, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
  const newScale = limitScale(next);
  offsetX = x - ((x - offsetX) * newScale) / scale;
  offsetY = y - ((y - offsetY) * newScale) / scale;
  scale = newScale;
  transform();
}
function bounds(elements: HTMLElement[]) {
  if (!elements.length) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.min(...elements.map((el) => el.offsetLeft));
  const top = Math.min(...elements.map((el) => el.offsetTop));
  const right = Math.max(...elements.map((el) => el.offsetLeft + el.offsetWidth));
  const bottom = Math.max(...elements.map((el) => el.offsetTop + el.offsetHeight));
  return { left, top, width: right - left, height: bottom - top };
}
function fit() {
  const area = bounds(Array.from(world.children, (element) => element as HTMLElement));
  canvasWidth = canvas.clientWidth;
  canvasHeight = canvas.clientHeight;
  if (!canvasWidth || !canvasHeight) return;
  const usableHeight = Math.max(1, canvasHeight - 52);
  const padding = expanded ? 70 : 100;
  fitScale = Math.min(
    1,
    canvasWidth / (area.width + padding),
    usableHeight / (area.height + padding),
  );
  scale = fitScale;
  offsetX = (canvasWidth - area.width * scale) / 2 - area.left * scale;
  offsetY = (usableHeight - area.height * scale) / 2 - area.top * scale;
  transform();
}
function setIndex(open: boolean) {
  app.dataset.indexOpen = String(open);
  index.hidden = !open;
  indexToggle.setAttribute("aria-expanded", String(open));
}
function syncControls() {
  expandButton.setAttribute("aria-pressed", String(expanded));
  expandButton.textContent = expanded ? "Collapse all" : "Expand all";
  editButton.setAttribute("aria-pressed", String(editing && !expanded));
  editButton.textContent = editing && !expanded ? "Editing locally" : "Edit locally";
  actions.hidden = !editing || expanded;
}
function path(id: string) {
  const result: Item[] = [];
  let node = items.find((i) => i.id === id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    result.unshift(node);
    const parent = node.parent;
    node = items.find((i) => i.id === parent);
  }
  return result;
}
function enter(id: string, focusCanvas = false, updateHistory = true) {
  if (updateHistory) {
    const url = new URL(location.href);
    if (id === "root") url.searchParams.delete("folder");
    else url.searchParams.set("folder", id);
    history.pushState({ folder: id }, "", url);
  }
  current = id;
  expanded = false;
  folderView = undefined;
  if (mobileIndex.matches) setIndex(false);
  render();
  fit();
  if (focusCanvas) canvas.focus({ preventScroll: true });
}
function toggleOverview() {
  if (!expanded) {
    folderView = {
      x: (canvas.clientWidth / 2 - offsetX) / scale,
      y: (canvas.clientHeight / 2 - offsetY) / scale,
      scale,
    };
  }
  expanded = !expanded;
  render();
  fit();
  if (!expanded && folderView) {
    scale = folderView.scale;
    offsetX = canvas.clientWidth / 2 - folderView.x * scale;
    offsetY = canvas.clientHeight / 2 - folderView.y * scale;
    folderView = undefined;
    transform();
  }
}
function folderChildren(id: string) {
  return items.filter((item) => item.parent === id);
}
function folderList() {
  const result: { id: string; title: string; depth: number }[] = [{ ...rootFolder, depth: 0 }];
  const seen = new Set([rootFolder.id]);
  function collect(id: string, depth: number) {
    for (const item of folderChildren(id)) {
      if (item.kind !== "folder" || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push({ id: item.id, title: item.title, depth });
      collect(item.id, depth + 1);
    }
  }
  collect(rootFolder.id, 1);
  return result;
}
function renderCard(item: Item) {
  const { id, kind, x, y } = item;
  const title = escapeHTML(item.title);
  const move =
    editing && !expanded
      ? `<div class="item-actions"><button type="button" data-edit="${escapeHTML(id)}" aria-label="Edit ${title}">Edit</button><button type="button" data-move="${escapeHTML(id)}" aria-label="Move ${title} to another folder">Move</button><button type="button" data-delete="${escapeHTML(id)}" aria-label="Delete ${title}">×</button></div>`
      : "";
  let content = "";
  if (kind === "photo")
    content = `<img src="${escapeHTML((item.mediaId ? mediaUrl(item.mediaId, "thumbnail") : item.src) || "")}" alt="" loading="lazy" draggable="false"><div class="item-label"><span>${title}</span><span aria-hidden="true">↗</span></div>`;
  if (kind === "note") content = `<p>${escapeHTML(item.text || "")}</p><small>${title}</small>`;
  if (kind === "folder")
    content = `<div class="folder-tab"></div><div class="folder-face"><span aria-hidden="true">↗</span><strong>${title}</strong><small>${itemCount(folderChildren(id).length)}</small></div>`;
  const action = kind === "folder" ? "Preview folder" : `View ${kind}`;
  return `<div class="wall-item ${kind}" role="button" tabindex="0" aria-label="${action}: ${title}" data-id="${escapeHTML(id)}" style="left:${x}px;top:${y}px;--rotation:${item.rotation || 0}deg">${move}${content}</div>`;
}
function itemCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
function folderDescription(folder: Pick<Item, "id" | "description">) {
  return folder.description;
}
function renderOverview() {
  const seen = new Set([rootFolder.id]);
  function renderContents(id: string, parents: string[]) {
    return folderChildren(id)
      .map((item) => {
        if (item.kind !== "folder") return renderCard(item);
        return seen.has(item.id) ? "" : renderZone(item, parents);
      })
      .join("");
  }
  function renderZone(folder: Item, parents: string[]): string {
    const { id, title } = folder;
    seen.add(id);
    const path = [...parents, title];
    const label = escapeHTML(path.join(" / "));
    const level = parents.length === 0 ? "top-level" : "nested";
    const description = folderDescription(folder);
    const children = renderContents(id, path);
    return `<section class="wall-zone wall-zone-${level}" aria-label="${label}" data-x="${folder.x}" data-y="${folder.y}">
      <div class="wall-zone-heading">
        <button type="button" data-preview-folder="${escapeHTML(id)}" aria-label="${label}" title="${label}">${escapeHTML(title)}</button>
        ${description ? `<p class="wall-zone-description">${escapeHTML(description)}</p>` : ""}
      </div>
      ${children || '<p class="wall-empty">This folder is empty.</p>'}
    </section>`;
  }

  world.innerHTML =
    renderContents(rootFolder.id, []) || '<p class="wall-empty">The wall is empty.</p>';
  layoutOverview(world);
}
function layoutOverview(container: HTMLElement): { width: number; height: number } {
  const gap = 28;
  const heading = container.querySelector<HTMLElement>(":scope > .wall-zone-heading");
  const padding = heading ? 32 : 0;
  if (heading) container.style.width = "350px";
  const contentTop = heading ? heading.offsetHeight + padding : 0;
  const cards = Array.from(container.querySelectorAll<HTMLElement>(":scope > .wall-item"));
  const occupied = cards.map((card) => {
    const item = items.find((candidate) => candidate.id === card.dataset.id);
    const angle = ((item?.rotation ?? 0) * Math.PI) / 180;
    const width =
      Math.abs(card.offsetWidth * Math.cos(angle)) + Math.abs(card.offsetHeight * Math.sin(angle));
    const height =
      Math.abs(card.offsetHeight * Math.cos(angle)) + Math.abs(card.offsetWidth * Math.sin(angle));
    return {
      x: card.offsetLeft + (card.offsetWidth - width) / 2,
      y: card.offsetTop + (card.offsetHeight - height) / 2,
      width,
      height,
    };
  });
  const zones = Array.from(container.querySelectorAll<HTMLElement>(":scope > .wall-zone"));
  for (const zone of zones) {
    const size = layoutOverview(zone);
    const anchor = { x: Number(zone.dataset.x), y: Number(zone.dataset.y) };
    // Candidate edges give the nearest non-overlapping placement without viewport-dependent packing.
    const xs = [
      anchor.x,
      ...occupied.flatMap((r) => [r.x - size.width - gap, r.x + r.width + gap]),
    ];
    const ys = [
      anchor.y,
      ...occupied.flatMap((r) => [r.y - size.height - gap, r.y + r.height + gap]),
    ];
    const candidates = xs.flatMap((x) => ys.map((y) => ({ x, y })));
    candidates.sort(
      (a, b) =>
        (a.x - anchor.x) ** 2 +
          (a.y - anchor.y) ** 2 -
          ((b.x - anchor.x) ** 2 + (b.y - anchor.y) ** 2) ||
        a.y - b.y ||
        a.x - b.x,
    );
    const position =
      candidates.find((p) =>
        occupied.every(
          (r) =>
            p.x + size.width + gap <= r.x ||
            r.x + r.width + gap <= p.x ||
            p.y + size.height + gap <= r.y ||
            r.y + r.height + gap <= p.y,
        ),
      ) ?? anchor;
    zone.style.left = `${position.x}px`;
    zone.style.top = `${position.y}px`;
    occupied.push({ ...position, ...size });
  }
  if (!heading) return { width: 0, height: 0 };
  const minX = Math.min(0, ...occupied.map((r) => r.x));
  const minY = Math.min(0, ...occupied.map((r) => r.y));
  const maxX = Math.max(0, ...occupied.map((r) => r.x + r.width));
  const maxY = Math.max(0, ...occupied.map((r) => r.y + r.height));
  for (const element of [...cards, ...zones]) {
    element.style.left = `${element.offsetLeft - minX + padding}px`;
    element.style.top = `${element.offsetTop - minY + contentTop}px`;
  }
  const empty = container.querySelector<HTMLElement>(":scope > .wall-empty");
  if (empty) empty.style.top = `${contentTop}px`;
  const width = Math.max(350, maxX - minX + padding * 2);
  const height = contentTop + Math.max(maxY - minY, empty?.offsetHeight ?? 0) + padding;
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  return { width, height };
}
function render() {
  syncControls();
  const folders = folderList();
  tree.innerHTML = folders
    .map(({ id, title, depth }) => {
      const active = !expanded && current === id;
      return `<button type="button" data-preview-folder="${escapeHTML(id)}" ${active ? 'class="active" aria-current="location"' : ""} style="padding-left:${8 + Math.min(depth, 6) * 11}px"><span aria-hidden="true">${depth === 0 ? "⌂" : "▰"}</span> ${escapeHTML(title)}</button>`;
    })
    .join("");
  const breadcrumb = [rootFolder, ...path(current)];
  crumbs.innerHTML = expanded
    ? '<span aria-current="page">All folders</span>'
    : breadcrumb
        .map((folder, position) => {
          const label = escapeHTML(folder.title);
          return position === breadcrumb.length - 1
            ? `<span aria-current="page">${label}</span>`
            : `<button type="button" data-folder="${escapeHTML(folder.id)}">${label}</button><span aria-hidden="true">/</span>`;
        })
        .join("");
  if (expanded) {
    renderOverview();
  } else {
    const visible = folderChildren(current);
    world.innerHTML = visible.length
      ? visible.map(renderCard).join("")
      : '<p class="wall-empty">This folder is empty.</p>';
  }
  transform();
}
function showFolder(id: string, trigger: HTMLElement) {
  const folder =
    id === rootFolder.id
      ? rootFolder
      : items.find((item) => item.id === id && item.kind === "folder");
  if (!folder) return;
  const description = folderDescription(folder);
  const parentPath = [rootFolder, ...path(id).slice(0, -1)];
  const edit =
    editing && !expanded && "kind" in folder
      ? '<button type="button" data-edit-folder>Edit details</button>'
      : "";
  detailContent.innerHTML = `<div class="wall-folder-preview">
    ${id === rootFolder.id ? "" : `<p class="wall-folder-path">${escapeHTML(parentPath.map((parent) => parent.title).join(" / "))}</p>`}
    <h2 id="wall-detail-title">${escapeHTML(folder.title)}</h2>
    <p>${escapeHTML(description || "No description yet.")}</p>
    <p class="wall-folder-path">${itemCount(folderChildren(id).length)}</p>
    <div class="wall-preview-actions">${edit}<button type="button" data-open-folder>Open folder</button></div>
  </div>`;
  detailContent.querySelector("[data-open-folder]")?.addEventListener("click", () => {
    detail.close();
    enter(id, true);
  });
  detailContent.querySelector("[data-edit-folder]")?.addEventListener("click", () => {
    if (!("kind" in folder)) return;
    detail.close();
    showFolderEditor(folder, description);
  });
  openDetail(trigger);
}
function openDetail(trigger: HTMLElement) {
  trigger.focus({ preventScroll: true });
  detail.showModal();
}
function openItem(id: string, trigger: HTMLElement) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (item.kind === "folder") {
    showFolder(id, trigger);
    return;
  }
  detailContent.innerHTML = `${item.kind === "photo" ? `<img src="${escapeHTML((item.mediaId ? mediaUrl(item.mediaId, "detail") : item.src) || "")}" alt="${escapeHTML(item.alt || item.title)}">` : ""}<h2 id="wall-detail-title">${escapeHTML(item.title)}</h2><p>${escapeHTML(item.text || "")}</p>`;
  openDetail(trigger);
}
function moveItem(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const invalid = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((i) => {
      if (invalid.has(i.parent) && !invalid.has(i.id)) {
        invalid.add(i.id);
        changed = true;
      }
    });
  }
  const options = [
    { id: "root", title: "All memories" },
    ...items
      .filter((i) => i.kind === "folder" && !invalid.has(i.id))
      .map((i) => ({
        id: i.id,
        title: path(i.id)
          .map((p) => p.title)
          .join(" / "),
      })),
  ];
  showEditor(
    `Move ${item.title}`,
    `<label for="destination">Destination</label><select id="destination" name="destination">${options.map((o) => `<option value="${escapeHTML(o.id)}" ${o.id === item.parent ? "selected" : ""}>${escapeHTML(o.title)}</option>`).join("")}</select>${coordinates({ x: 100, y: 100 })}`,
    "Move",
    (data) => {
      item.parent = String(data.get("destination"));
      Object.assign(item, position(data) ?? { x: 100, y: 100 });
      save();
      render();
      (hosted ? canvas : editButton).focus({ preventScroll: true });
    },
  );
}
function previewFromButton(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-preview-folder]");
  if (button?.dataset.previewFolder) showFolder(button.dataset.previewFolder, button);
}
tree.addEventListener("click", previewFromButton);
world.addEventListener("click", previewFromButton);
crumbs.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-folder]");
  if (button?.dataset.folder) enter(button.dataset.folder, true);
});
world.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const edit = target.closest<HTMLElement>("[data-edit]");
  const remove = target.closest<HTMLElement>("[data-delete]");
  if (edit?.dataset.edit) {
    editItem(edit.dataset.edit);
    return;
  }
  if (remove?.dataset.delete) {
    deleteItem(remove.dataset.delete);
    return;
  }
  const move = target.closest<HTMLElement>("[data-move]");
  if (move) {
    e.stopPropagation();
    if (move.dataset.move) moveItem(move.dataset.move);
    return;
  }
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const item = target.closest<HTMLElement>("[data-id]");
  if (item?.dataset.id) openItem(item.dataset.id, item);
});
world.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
    if (item && !(e.target as HTMLElement).closest(".item-actions")) {
      e.preventDefault();
      if (item.dataset.id) openItem(item.dataset.id, item);
    }
  }
});
canvas.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("button")) return;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const item = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
  if (editing && !expanded && item && pointers.size === 1) {
    const data = items.find((i) => i.id === item.dataset.id);
    if (!data) return;
    drag = { id: data.id, x: e.clientX, y: e.clientY, ix: data.x, iy: data.y, moved: false };
    return;
  }
  if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
  if (pointers.size === 2) {
    drag = null;
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const rect = canvas.getBoundingClientRect(),
      x = (a.x + b.x) / 2 - rect.left,
      y = (a.y + b.y) / 2 - rect.top;
    gesture = {
      x,
      y,
      ox: offsetX,
      oy: offsetY,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      scale,
      worldX: (x - offsetX) / scale,
      worldY: (y - offsetY) / scale,
    };
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag) {
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      const dragId = drag.id;
      const item = items.find((i) => i.id === dragId);
      if (!item) return;
      item.x = Math.round(drag.ix + dx / scale);
      item.y = Math.round(drag.iy + dy / scale);
      const el = world.querySelector<HTMLElement>(`[data-id="${item.id}"]`);
      if (el) {
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
      }
    }
    return;
  }
  if (!gesture) return;
  if (
    pointers.size === 2 &&
    gesture.distance &&
    gesture.scale !== undefined &&
    gesture.worldX !== undefined &&
    gesture.worldY !== undefined
  ) {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const rect = canvas.getBoundingClientRect(),
      x = (a.x + b.x) / 2 - rect.left,
      y = (a.y + b.y) / 2 - rect.top;
    scale = limitScale((gesture.scale * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.distance);
    offsetX = x - gesture.worldX * scale;
    offsetY = y - gesture.worldY * scale;
    transform();
  } else if (pointers.size === 1 && !gesture.distance) {
    offsetX = gesture.ox + e.clientX - gesture.x;
    offsetY = gesture.oy + e.clientY - gesture.y;
    if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4)
      canvas.classList.add("panning");
    transform();
  }
});
function endPointer(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (canvas.classList.contains("panning")) {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 100);
  }
  if (drag) {
    if (drag.moved) {
      save();
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 100);
    }
    drag = null;
  }
  gesture = null;
  canvas.classList.remove("panning");
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(scale * Math.exp(-e.deltaY * 0.001), e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false },
);
canvas.addEventListener("keydown", (e) => {
  if (e.target !== canvas) return;
  const step = 50;
  if (e.key === "ArrowLeft") offsetX += step;
  else if (e.key === "ArrowRight") offsetX -= step;
  else if (e.key === "ArrowUp") offsetY += step;
  else if (e.key === "ArrowDown") offsetY -= step;
  else if (e.key === "+" || e.key === "=") zoom(scale * 1.2);
  else if (e.key === "-") zoom(scale / 1.2);
  else if (e.key === "0") fit();
  else return;
  e.preventDefault();
  transform();
});
$("#zoom-in").addEventListener("click", () => zoom(scale * 1.2));
$("#zoom-out").addEventListener("click", () => zoom(scale / 1.2));
$("#zoom-fit").addEventListener("click", fit);
indexToggle.addEventListener("click", () => setIndex(index.hasAttribute("hidden")));
mobileIndex.addEventListener("change", () => {
  setIndex(!mobileIndex.matches);
  if (expanded) {
    render();
    fit();
  }
});
expandButton.addEventListener("click", toggleOverview);
editButton.addEventListener("click", () => {
  if (expanded) {
    editing = true;
    toggleOverview();
  } else {
    editing = !editing;
    render();
  }
});
new ResizeObserver(() => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  offsetX += (width - canvasWidth) / 2;
  offsetY += (height - canvasHeight) / 2;
  canvasWidth = width;
  canvasHeight = height;
  transform();
}).observe(canvas);
function add(kind: Kind, title: string, extra: Partial<Item> = {}) {
  const item: Item = {
    id: `i${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    parent: current,
    kind,
    title,
    x: Math.round((canvas.clientWidth / 2 - offsetX) / scale - 90),
    y: Math.round((canvas.clientHeight / 2 - offsetY) / scale - 80),
    ...extra,
  };
  items.push(item);
  save();
  render();
}
const editor = $<HTMLDialogElement>("#wall-editor");
function showEditor(
  title: string,
  fields: string,
  submit: string,
  onSubmit: (data: FormData) => void | Promise<void>,
) {
  editor.innerHTML = `<form><h2 id="wall-editor-title">${escapeHTML(title)}</h2>${fields}<p role="status" data-editor-status hidden></p><div class="wall-editor-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${submit}</button></div></form>`;
  const form = editor.querySelector("form");
  const feedback = editor.querySelector<HTMLElement>("[data-editor-status]");
  const cancel = editor.querySelector<HTMLButtonElement>("[data-cancel]");
  if (!form || !feedback || !cancel) return;
  cancel.addEventListener("click", () => editor.close());
  editor.oncancel = (event) => {
    if (cancel.disabled) event.preventDefault();
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (cancel.disabled) return;
    const data = new FormData(form);
    if (typeof data.get("title") === "string" && !String(data.get("title")).trim()) {
      feedback.textContent = "Enter a title.";
      feedback.hidden = false;
      return;
    }
    const controls = form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >("input, select, textarea, button");
    for (const control of controls) control.disabled = true;
    feedback.textContent = "Applying changes…";
    feedback.hidden = false;
    try {
      await onSubmit(data);
      editor.close();
    } catch (error) {
      feedback.textContent = apiMessage(error);
    } finally {
      for (const control of controls) control.disabled = false;
      if (!editor.open && hosted) canvas.focus({ preventScroll: true });
    }
  });
  editor.showModal();
}
function coordinates(item?: Pick<Item, "x" | "y">) {
  if (!hosted) return "";
  const x = item?.x ?? Math.round((canvas.clientWidth / 2 - offsetX) / scale - 90);
  const y = item?.y ?? Math.round((canvas.clientHeight / 2 - offsetY) / scale - 80);
  return `<div class="wall-coordinates">
    <label for="item-x">X position</label><input id="item-x" name="x" type="number" min="-1000000" max="1000000" step="any" value="${x}" required>
    <label for="item-y">Y position</label><input id="item-y" name="y" type="number" min="-1000000" max="1000000" step="any" value="${y}" required>
  </div>`;
}
function position(data: FormData) {
  return hosted ? { x: Number(data.get("x")), y: Number(data.get("y")) } : undefined;
}
function showFolderEditor(folder?: Item, description = folder?.description ?? "") {
  showEditor(
    folder ? "Edit folder" : "New folder",
    `<label for="folder-title">Folder name</label><input id="folder-title" name="title" value="${escapeHTML(folder?.title ?? "")}" required maxlength="100"><label for="folder-description">Description</label><textarea id="folder-description" name="description" maxlength="500">${escapeHTML(description)}</textarea>${coordinates(folder)}`,
    folder ? "Save details" : "Create folder",
    (data) => {
      const title = String(data.get("title")).trim();
      if (!title) return;
      const description = String(data.get("description")).trim();
      if (!folder) {
        add("folder", title, { description, ...position(data) });
        return;
      }
      Object.assign(folder, { title, description, ...position(data) });
      save();
      render();
      canvas.focus({ preventScroll: true });
    },
  );
}
function editItem(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (item.kind === "folder") {
    showFolderEditor(item);
    return;
  }
  const isPhoto = item.kind === "photo";
  showEditor(
    isPhoto ? "Edit photo" : "Edit note",
    `<label for="item-title">Title</label><input id="item-title" name="title" required maxlength="100" value="${escapeHTML(item.title)}"><label for="item-text">${isPhoto ? "Caption" : "Note"}</label><textarea id="item-text" name="text" maxlength="5000">${escapeHTML(item.text || "")}</textarea>${isPhoto ? `<label for="item-alt">Image description</label><input id="item-alt" name="alt" maxlength="500" value="${escapeHTML(item.alt || "")}">` : ""}${coordinates(item)}`,
    "Save",
    (data) => {
      item.title = String(data.get("title")).trim();
      item.text = String(data.get("text")).trim();
      Object.assign(item, position(data));
      if (isPhoto) item.alt = String(data.get("alt")).trim();
      save();
      render();
      canvas.focus({ preventScroll: true });
    },
  );
}
function deleteItem(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of items)
      if (removed.has(child.parent) && !removed.has(child.id)) {
        removed.add(child.id);
        changed = true;
      }
  }
  const count = removed.size - 1;
  showEditor(
    `Delete ${item.title}?`,
    `<p>${count ? `This also deletes ${count} nested ${count === 1 ? "item" : "items"}.` : "This removes the item from your draft."}</p>`,
    "Delete",
    () => {
      items = items.filter((i) => !removed.has(i.id));
      save();
      render();
      canvas.focus({ preventScroll: true });
    },
  );
}
$("#add-folder").addEventListener("click", () => showFolderEditor());
$("#add-note").addEventListener("click", () =>
  showEditor(
    "New note",
    `<label for="note-title">Title</label><input id="note-title" name="title" required maxlength="100"><label for="note-body">Note</label><textarea id="note-body" name="body" required ${hosted ? 'maxlength="5000"' : ""}></textarea>${coordinates()}`,
    "Create note",
    (data) =>
      add("note", String(data.get("title")).trim(), {
        text: String(data.get("body")).trim(),
        ...position(data),
      }),
  ),
);
$("#add-photo").addEventListener("click", () =>
  showEditor(
    "Add photo",
    `<label for="photo-title">${hosted ? "Title" : "Caption"}</label><input id="photo-title" name="title" required maxlength="100">
    ${hosted ? '<label for="photo-caption">Caption</label><textarea id="photo-caption" name="caption" maxlength="5000"></textarea>' : ""}
    <label for="photo-alt">Image description</label><input id="photo-alt" name="alt" maxlength="500">
    <label for="photo-file">Image (up to ${hosted ? 4 : 10} MB)</label><input id="photo-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required>
    <p>JPEG, PNG or WebP only.${hosted ? "" : " Photos are stored only in this browser; browser storage is limited."}</p>
    ${coordinates()}`,
    "Add photo",
    async (data) => {
      const file = data.get("file");
      const limit = hosted ? 4_000_000 : 10_000_000;
      if (
        !(file instanceof File) ||
        (!hosted && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) ||
        !file.size ||
        file.size > limit
      ) {
        throw new OwnerApiError(422, {
          error: `Choose a JPEG, PNG, or WebP image up to ${limit / 1_000_000} MB.`,
        });
      }
      const title = String(data.get("title")).trim();
      const alt = String(data.get("alt")).trim();
      if (hosted) {
        const upload = new FormData();
        upload.set("photo", file);
        const image = await ownerRequest<Pick<Item, "mediaId" | "width" | "height">>(
          `${hostedApi}/media`,
          {
            method: "POST",
            body: upload,
          },
        );
        add("photo", title, {
          ...image,
          ...position(data),
          text: String(data.get("caption")).trim(),
          alt,
        });
        return;
      }
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(
            new OwnerApiError(422, { error: "The image could not be read. Please try again." }),
          );
        reader.readAsDataURL(file);
      });
      add("photo", title, { src, text: "", alt });
    },
  ),
);
const state = $("#wall-state");
function showState(message: string) {
  state.hidden = !message;
  state.textContent = message;
}
function openLinkedFolder() {
  const id = new URL(location.href).searchParams.get("folder") || "root";
  if (id !== "root" && !items.some((item) => item.id === id && item.kind === "folder")) {
    showState("This folder is unavailable. Showing the main wall.");
    enter("root", false, false);
    return;
  }
  enter(id, false, false);
}
window.addEventListener("popstate", openLinkedFolder);
async function initialize() {
  setIndex(!mobileIndex.matches);
  if (import.meta.env.DEV) {
    try {
      const draft = await readDraft();
      if (draft) {
        items = draft;
        hasLocalDraft = true;
      }
    } catch {
      showState("Local storage is unavailable. Changes may not persist; export your draft.");
    }
  }
  editButton.hidden = !import.meta.env.DEV;
  if (!WORKER_URL && !import.meta.env.DEV) {
    items = [];
    showState("The wall is not configured yet.");
    render();
    return;
  }
  if (WORKER_URL) {
    showState("Loading the wall…");
    try {
      const response = await fetch(apiUrl("/wall"));
      if (!response.ok) throw new Error(`Wall returned ${response.status}`);
      const data: { revision: string | null; items: Item[] } = await response.json();
      if (!Array.isArray(data.items)) throw new Error("Invalid wall response");
      if (!hasLocalDraft) items = data.items;
      showState(
        import.meta.env.DEV
          ? hasLocalDraft
            ? "Local browser draft · export to publish."
            : "Published wall · local edits stay in this browser."
          : data.revision
            ? ""
            : "The wall is empty.",
      );
    } catch {
      state.innerHTML =
        'Unable to load the wall. <button type="button" id="wall-retry">Try again</button>';
      state.hidden = false;
      $("#wall-retry").addEventListener("click", () => void initialize());
      render();
      return;
    }
  } else {
    showState("Local editor · sample or browser draft. Export to publish.");
  }
  openLinkedFolder();
  document.fonts.ready.then(fit);
}
function hostedControls(message: string) {
  if (!hosted) return;
  $("#hosted-wall-status").textContent = message;
  $<HTMLButtonElement>("#save-hosted-wall").disabled =
    busy || !serverDraft || !hostedDirty || stale;
  $<HTMLButtonElement>("#preview-hosted-wall").disabled = busy || !serverDraft;
  $<HTMLButtonElement>("#publish-hosted-wall").disabled =
    busy || !serverDraft || stale || serverDraft.activeRevision !== serverDraft.baseRevision;
  const reload = $<HTMLButtonElement>("#reload-hosted-wall");
  reload.disabled = busy;
  reload.hidden = !stale && !!serverDraft;
  const reset = $<HTMLButtonElement>("#reset-hosted-wall");
  reset.disabled = busy || stale;
  reset.hidden = !serverDraft || serverDraft.activeRevision === serverDraft.baseRevision;
  app.inert = busy || !serverDraft;
}

function replaceHosted(draft: HostedDraft) {
  const { items: snapshot, ...versions } = draft;
  items = snapshot;
  serverDraft = versions;
  hostedDirty = false;
  stale = false;
  setIndex(!mobileIndex.matches);
  openLinkedFolder();
}

function readyMessage() {
  if (serverDraft && serverDraft.activeRevision !== serverDraft.baseRevision)
    return "The live wall changed outside this editor. Start from the live wall to publish again.";
  return "Draft ready.";
}

async function loadHosted() {
  replaceHosted(await ownerRequest<HostedDraft>(`${hostedApi}/draft`));
  document.fonts.ready.then(fit);
  return readyMessage();
}

async function saveHosted() {
  if (!serverDraft || !hostedDirty) return;
  const { version, baseRevision, activeRevision } = await ownerRequest<HostedDraft>(
    `${hostedApi}/draft`,
    {
      method: "PUT",
      json: { version: serverDraft.version, items },
    },
  );
  serverDraft = { version, baseRevision, activeRevision };
  hostedDirty = false;
}

async function hostedOperation(progress: string, operation: () => Promise<string>) {
  if (busy) return;
  busy = true;
  hostedControls(progress);
  let message: string;
  try {
    message = await operation();
  } catch (error) {
    message = apiMessage(error);
    if (error instanceof OwnerApiError && error.status === 409) {
      const { version, activeRevision, baseRevision } = error.data;
      if (
        serverDraft &&
        version === serverDraft.version &&
        baseRevision === serverDraft.baseRevision &&
        (activeRevision === null || typeof activeRevision === "string")
      ) {
        serverDraft.activeRevision = activeRevision;
      } else stale = true;
    }
  } finally {
    busy = false;
  }
  hostedControls(message);
}

if (hosted) {
  editing = true;
  $("#save-hosted-wall").addEventListener(
    "click",
    () =>
      void hostedOperation("Saving draft…", async () => {
        await saveHosted();
        return serverDraft?.activeRevision !== serverDraft?.baseRevision
          ? readyMessage()
          : "Draft saved.";
      }),
  );
  $("#preview-hosted-wall").addEventListener("click", () => {
    editing = !editing;
    if (editing && expanded) toggleOverview();
    else render();
    $("#preview-hosted-wall").setAttribute("aria-pressed", String(!editing));
    hostedControls(
      editing
        ? hostedDirty
          ? "Unsaved changes."
          : readyMessage()
        : "Previewing your current draft.",
    );
  });
  $("#publish-hosted-wall").addEventListener(
    "click",
    () =>
      void hostedOperation("Publishing draft…", async () => {
        await saveHosted();
        if (!serverDraft) return "Load the draft again.";
        if (serverDraft.baseRevision !== serverDraft.activeRevision) return readyMessage();
        const { version, revision } = await ownerRequest<{ version: number; revision: string }>(
          `${hostedApi}/publish`,
          {
            method: "POST",
            json: { version: serverDraft.version, baseRevision: serverDraft.baseRevision },
          },
        );
        serverDraft = { version, baseRevision: revision, activeRevision: revision };
        return "Published to the public wall.";
      }),
  );
  $("#reload-hosted-wall").addEventListener("click", () => {
    if (hostedDirty && !confirm("Discard your unsaved changes and reload the server draft?"))
      return;
    void hostedOperation("Reloading draft…", loadHosted);
  });
  $("#reset-hosted-wall").addEventListener("click", () => {
    if (!confirm("Replace the hosted draft and any unsaved changes with the live wall?")) return;
    void hostedOperation("Starting from the live wall…", async () => {
      replaceHosted(
        await ownerRequest<HostedDraft>(`${hostedApi}/reset`, {
          method: "POST",
          json: serverDraft,
        }),
      );
      return "Draft reset to the live wall.";
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (hostedDirty && !leaving) {
      event.preventDefault();
    }
  });
  document.addEventListener("owner-sign-out", (event) => {
    if (
      hostedDirty &&
      !confirm("Sign out with unsaved changes? Cancel to return and save your draft.")
    ) {
      event.preventDefault();
      return;
    }
  });
  document.addEventListener("owner-signed-out", () => {
    leaving = true;
  });
}
if (hosted) void hostedOperation("Loading draft…", loadHosted);
else void initialize();
$("#export-wall").addEventListener("click", async () => {
  try {
    const exported = await Promise.all(
      items.map(async (item) => {
        if (item.kind !== "photo" || item.src?.startsWith("data:")) return item;
        const source = item.mediaId ? mediaUrl(item.mediaId, "detail") : item.src;
        if (!source) throw new Error("Photo has no source");
        const response = await fetch(source);
        if (!response.ok) throw new Error("Photo unavailable");
        const blob = await response.blob();
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const digest = item.mediaId
          ? Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
              (b) => b.toString(16).padStart(2, "0"),
            ).join("")
          : undefined;
        return { ...item, src, sourceHash: digest };
      }),
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ schemaVersion: 1, items: exported }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "wall-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("A photo could not be included in the export. Check its source and try again.");
  }
});

$("#reset-wall").addEventListener("click", () =>
  showEditor(
    "Reset sample wall?",
    "<p>This removes your local draft in this browser.</p>",
    "Reset samples",
    () => {
      items = structuredClone(initial);
      save();
      enter("root");
      (hosted ? canvas : editButton).focus({ preventScroll: true });
    },
  ),
);
