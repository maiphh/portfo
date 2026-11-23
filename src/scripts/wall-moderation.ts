import { apiMessage, ownerRequest, OwnerApiError } from "~/lib/wall-admin/client";

interface Folder {
  id: string;
  kind: string;
  title: string;
  parent: string;
}
interface Draft {
  version: number;
  items: Folder[];
}
interface Submission {
  id: string;
  status: "pending" | "accepted" | "rejected";
  title: string;
  body: string;
  alt: string | null;
  mediaId: string | null;
  folderHint: string | null;
  visitorName: string | null;
  createdAt: number;
}
interface Queue {
  items: Submission[];
  nextCursor: string | null;
}

const select = document.querySelector<HTMLSelectElement>("#submission-status");
const feedback = document.querySelector<HTMLElement>("#submission-feedback");
const list = document.querySelector<HTMLElement>("#submission-list");
const more = document.querySelector<HTMLButtonElement>("#more-submissions");
const reload = document.querySelector<HTMLButtonElement>("#reload-submissions");

if (select && feedback && list && more && reload) {
  let cursor: string | null = null;
  let draft: Draft | undefined;
  let busy = false;
  const element = <T extends keyof HTMLElementTagNameMap>(tag: T, text?: string) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const button = (label: string) => {
    const node = element("button", label);
    node.type = "button";
    return node;
  };
  const setBusy = (pending: boolean) => {
    busy = select.disabled = more.disabled = reload.disabled = pending;
    for (const control of list.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      "button, select",
    ))
      control.disabled = pending;
  };

  const card = (submission: Submission) => {
    const article = element("article");
    article.className = "owner-submission";
    const rawTitle = /^[a-f0-9]{64}$/.test(submission.title.trim()) ? "" : submission.title.trim();
    const heading = rawTitle || (submission.mediaId ? "Untitled photo" : "Untitled");
    const title = element("h3", heading);
    title.id = `title-${submission.id}`;
    article.setAttribute("aria-labelledby", title.id);
    const date = element("time", new Date(submission.createdAt).toLocaleString());
    date.dateTime = new Date(submission.createdAt).toISOString();
    article.append(title, date);
    if (submission.visitorName?.trim()) {
      article.append(element("p", `From ${submission.visitorName.trim()}`));
    }
    if (submission.mediaId) {
      const base = `/api/admin/wall/media/${submission.mediaId}`;
      const link = element("a");
      link.href = `${base}/detail`;
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("aria-label", `Open full photo: ${heading}`);
      const img = element("img");
      img.src = `${base}/thumbnail`;
      img.alt = submission.alt ?? "";
      img.loading = "lazy";
      link.append(img);
      article.append(link);
    }
    if (submission.body) article.append(element("p", submission.body));
    if (submission.status !== "pending") return article;

    const controls = element("div");
    controls.className = "owner-review-actions";
    const label = element("label", "Destination folder");
    const destination = element("select");
    destination.id = `destination-${submission.id}`;
    label.htmlFor = destination.id;
    destination.add(new Option("All memories (root)", "root"));
    const folders = new Map(
      draft?.items.filter((item) => item.kind === "folder").map((item) => [item.id, item]),
    );
    for (const folder of folders.values()) {
      const titles = [folder.title];
      const seen = new Set([folder.id]);
      for (
        let parent = folders.get(folder.parent);
        parent && !seen.has(parent.id);
        parent = folders.get(parent.parent)
      ) {
        titles.unshift(parent.title);
        seen.add(parent.id);
      }
      destination.add(new Option(titles.join(" / "), folder.id));
    }
    const hint = submission.folderHint;
    if (hint && [...destination.options].some((option) => option.value === hint))
      destination.value = hint;
    const accept = button("Accept");
    const reject = button("Reject");
    const decide = async (action: "accept" | "reject") => {
      if (busy) return;
      setBusy(true);
      feedback.textContent = action === "accept" ? "Adding to the draft…" : "Rejecting submission…";
      try {
        await ownerRequest(`/api/admin/wall/submissions/${submission.id}/decision`, {
          method: "POST",
          json: { action, folderId: destination.value, version: draft?.version },
        });
        article.remove();
        await load(
          false,
          action === "accept" ? "Accepted and added to the draft." : "Submission rejected.",
        );
      } catch (error) {
        feedback.textContent = apiMessage(error);
        reload.hidden = !(error instanceof OwnerApiError && error.status === 409);
      } finally {
        setBusy(false);
      }
    };
    accept.addEventListener("click", () => void decide("accept"));
    reject.addEventListener("click", () => void decide("reject"));
    controls.append(label, destination, accept, reject);
    article.append(controls);
    return article;
  };

  async function load(append: boolean, message?: string) {
    if (!select || !feedback || !list || !more || !reload) return;
    const status = select.value;
    const params = new URLSearchParams({ status });
    if (append && cursor) params.set("cursor", cursor);
    setBusy(true);
    feedback.textContent = message ?? "Loading submissions…";
    try {
      const [queue, current] = await Promise.all([
        ownerRequest<Queue>(`/api/admin/wall/submissions?${params}`),
        status === "pending" && !append ? ownerRequest<Draft>("/api/admin/wall/draft") : draft,
      ]);
      draft = current;
      if (!append) list.replaceChildren();
      list.append(...queue.items.map(card));
      cursor = queue.nextCursor;
      more.hidden = !cursor;
      reload.hidden = true;
      feedback.textContent = message ?? (list.childElementCount ? "" : `No ${status} submissions.`);
    } catch (error) {
      feedback.textContent = apiMessage(error);
      reload.hidden = false;
    } finally {
      setBusy(false);
    }
  }
  select.addEventListener("change", () => {
    list.replaceChildren();
    more.hidden = true;
    void load(false);
  });
  more.addEventListener("click", () => void load(true));
  reload.addEventListener("click", () => void load(false));
  void load(false);
}
