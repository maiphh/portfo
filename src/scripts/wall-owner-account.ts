import { apiMessage, OwnerApiError, ownerRequest } from "~/lib/wall-admin/client";

const logout = document.querySelector<HTMLButtonElement>("[data-sign-out]");
logout?.addEventListener("click", async () => {
  if (!document.dispatchEvent(new Event("owner-sign-out", { cancelable: true }))) return;
  const status = document.querySelector<HTMLElement>("[data-sign-out-status]");
  logout.disabled = true;
  try {
    await ownerRequest("/api/admin/logout", { method: "POST" });
    document.dispatchEvent(new Event("owner-signed-out"));
    location.assign("/login");
  } catch (error) {
    if (status) status.textContent = apiMessage(error);
    logout.disabled = false;
  }
});

const form = document.querySelector<HTMLFormElement>("[data-account-form]");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = form.dataset.accountForm;
  const values = Object.fromEntries(new FormData(form));
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!status || !button || button.disabled) return;
  const fields = form.querySelectorAll<HTMLElement>("[data-field]");
  for (const field of fields) {
    field.textContent = "";
    form.querySelector(`[name="${field.dataset.field}"]`)?.removeAttribute("aria-invalid");
  }
  button.disabled = true;
  status.textContent = action === "login" ? "Signing in…" : "Changing password…";
  try {
    await ownerRequest(`/api/admin/${action}`, { method: "POST", json: values });
    form.reset();
    if (action === "login") location.assign("/admin/wall");
    else status.textContent = "Password changed. Your other sessions have been signed out.";
  } catch (error) {
    status.textContent = apiMessage(error);
    if (error instanceof OwnerApiError) {
      for (const field of fields) {
        const message = error.fields?.[field.dataset.field ?? ""];
        if (message) {
          field.textContent = message;
          form
            .querySelector(`[name="${field.dataset.field}"]`)
            ?.setAttribute("aria-invalid", "true");
        }
      }
    }
  } finally {
    button.disabled = false;
  }
});
