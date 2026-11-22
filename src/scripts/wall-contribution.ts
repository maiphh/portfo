import { apiMessage, ownerRequest } from "~/lib/wall-admin/client";

const dialog = document.querySelector<HTMLDialogElement>("#wall-contribution");
const form = dialog?.querySelector("form");
const kind = dialog?.querySelector<HTMLSelectElement>("#contribution-kind");
const body = dialog?.querySelector<HTMLTextAreaElement>("#contribution-body");
const label = dialog?.querySelector<HTMLLabelElement>("#contribution-body-label");
const fields = dialog?.querySelector<HTMLElement>("#contribution-image-fields");
const close = dialog?.querySelector<HTMLButtonElement>("#contribution-close");
const send = dialog?.querySelector<HTMLButtonElement>("button[type=submit]");
const feedback = dialog?.querySelector<HTMLElement>("#contribution-status");

if (dialog && form && kind && body && label && fields && close && send && feedback) {
  let submissionId: string | undefined;
  let sent = false;
  const update = () => {
    const photo = kind.value === "photo";
    label.textContent = photo ? "Caption (optional)" : "Note";
    body.required = !photo;
    fields.hidden = !photo;
    for (const input of fields.querySelectorAll("input")) {
      input.disabled = !photo;
      input.required = photo;
    }
  };
  document.querySelector("#wall-contribute")?.addEventListener("click", () => {
    if (sent) {
      sent = false;
      submissionId = undefined;
      form.reset();
      send.disabled = false;
      feedback.textContent = "";
      update();
    }
    dialog.showModal();
  });
  kind.addEventListener("change", update);
  form.addEventListener("input", () => {
    submissionId = undefined;
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (close.disabled) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    const data = new FormData(form);
    submissionId ??= crypto.randomUUID();
    data.set("id", submissionId);
    const controls = form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
    >("input, textarea, select, button");
    for (const control of controls) control.disabled = true;
    feedback.textContent = "Submitting for review…";
    try {
      await ownerRequest("/api/wall/submissions", { method: "POST", body: data });
      sent = true;
      feedback.textContent = "Thanks for sharing. The owner will review your contribution.";
    } catch (error) {
      feedback.textContent = apiMessage(error);
    } finally {
      for (const control of controls) control.disabled = false;
      update();
      send.disabled = sent;
    }
  });
}
