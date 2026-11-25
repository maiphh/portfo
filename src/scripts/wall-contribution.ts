import { apiMessage, ownerRequest } from "~/lib/wall-admin/client";

const dialog = document.querySelector<HTMLDialogElement>("#wall-contribution");
const form = dialog?.querySelector("form");
const kind = dialog?.querySelector<HTMLSelectElement>("#contribution-kind");
const nameInput = dialog?.querySelector<HTMLInputElement>("#contribution-name");
const title = dialog?.querySelector<HTMLInputElement>("#contribution-title");
const titleLabel = dialog?.querySelector<HTMLLabelElement>("#contribution-title-label");
const body = dialog?.querySelector<HTMLTextAreaElement>("#contribution-body");
const label = dialog?.querySelector<HTMLLabelElement>("#contribution-body-label");
const fields = dialog?.querySelector<HTMLElement>("#contribution-image-fields");
const photoInput = dialog?.querySelector<HTMLInputElement>("#contribution-photo");
const folderInput = dialog?.querySelector<HTMLInputElement>("#contribution-folder");
const folderHint = dialog?.querySelector<HTMLElement>("#contribution-folder-hint");
const close = dialog?.querySelector<HTMLButtonElement>("#contribution-close");
const send = dialog?.querySelector<HTMLButtonElement>("button[type=submit]");
const feedback = dialog?.querySelector<HTMLElement>("#contribution-status");
const wall = document.querySelector<HTMLElement>("#wall-app");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const isImageFile = (file: File) =>
  IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

if (
  dialog &&
  form &&
  kind &&
  nameInput &&
  title &&
  titleLabel &&
  body &&
  label &&
  fields &&
  photoInput &&
  folderInput &&
  folderHint &&
  close &&
  send &&
  feedback
) {
  let sent = false;
  const currentFolder = () => wall?.dataset.currentFolder || "root";
  const folderLabel = () => {
    const id = currentFolder();
    if (id === "root") return "All memories";
    const active = document.querySelector<HTMLElement>(
      `#wall-tree [data-preview-folder="${CSS.escape(id)}"].active, .wall-item.folder[data-id="${CSS.escape(id)}"]`,
    );
    return active?.textContent?.replace(/\s+/g, " ").trim() || "this folder";
  };
  const update = () => {
    const photo = kind.value === "photo";
    titleLabel.textContent = photo ? "Title (optional)" : "Title";
    title.required = !photo;
    label.textContent = photo ? "Caption (optional)" : "Note";
    body.required = !photo;
    fields.hidden = !photo;
    for (const input of fields.querySelectorAll("input")) {
      input.disabled = !photo;
      input.required = photo && input.id === "contribution-photo";
    }
    folderInput.value = currentFolder();
    folderHint.textContent = `Submitting to: ${folderLabel()}`;
  };
  document.querySelector("#wall-contribute")?.addEventListener("click", () => {
    if (sent) {
      sent = false;
      form.reset();
      send.disabled = false;
      feedback.textContent = "";
    }
    update();
    dialog.showModal();
  });
  kind.addEventListener("change", update);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (close.disabled) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    const photo = kind.value === "photo";
    const visitorName = nameInput.value.trim();
    const sharedTitle = title.value.trim();
    const caption = body.value.trim();
    const alt = (form.querySelector<HTMLInputElement>("#contribution-alt")?.value ?? "").trim();
    const folder = currentFolder();
    folderInput.value = folder;

    const files = photo
      ? [...(photoInput.files ?? [])].filter((file) => file.size && isImageFile(file))
      : [];
    if (photo && !files.length) {
      feedback.textContent = "Choose at least one JPEG, PNG, or WebP image up to 4 MB.";
      return;
    }
    if (files.length > 10) {
      feedback.textContent = "Submit up to 10 photos at a time.";
      return;
    }
    for (const file of files) {
      if (file.size > 4_000_000) {
        feedback.textContent = `${file.name} must be 4 MB or smaller.`;
        return;
      }
    }
    if (!photo && (!sharedTitle || !caption)) {
      feedback.textContent = "Enter a title and note.";
      return;
    }

    const controls = form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
    >("input, textarea, select, button");
    for (const control of controls) control.disabled = true;
    try {
      if (!photo) {
        feedback.textContent = "Submitting for review…";
        const data = new FormData();
        data.set("id", crypto.randomUUID());
        data.set("title", sharedTitle);
        data.set("body", caption);
        data.set("folderHint", folder);
        if (visitorName) data.set("visitorName", visitorName);
        await ownerRequest("/api/wall/submissions", { method: "POST", body: data });
      } else {
        for (const [index, file] of files.entries()) {
          feedback.textContent = `Submitting ${index + 1} of ${files.length}…`;
          const data = new FormData();
          data.set("id", crypto.randomUUID());
          // Keep title empty unless the visitor typed one for a single photo.
          data.set("title", files.length === 1 ? sharedTitle : "");
          data.set("body", caption);
          data.set("alt", alt);
          data.set("folderHint", folder);
          if (visitorName) data.set("visitorName", visitorName);
          data.set("photo", file);
          await ownerRequest("/api/wall/submissions", { method: "POST", body: data });
        }
      }
      sent = true;
      feedback.textContent =
        photo && files.length > 1
          ? `Thanks for sharing ${files.length} photos. The owner will review them.`
          : "Thanks for sharing. The owner will review your contribution.";
    } catch (error) {
      feedback.textContent = apiMessage(error);
    } finally {
      for (const control of controls) control.disabled = false;
      update();
      send.disabled = sent;
    }
  });
}
