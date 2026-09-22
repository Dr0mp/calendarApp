// In-app replacements for alert() / confirm() / prompt(): themed, translatable, non-blocking.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const feedbackMethods = {
  // Toast message (replaces alert). tone: "info" | "success" | "warning" | "danger"
  notify(message, tone = "info") {
    let region = document.getElementById("toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "toast-region";
      region.className = "toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast--${tone}`;
    toast.textContent = message;
    region.appendChild(toast);
    // Toasts sit above an open modal dialog only if they live in the top layer; move them there.
    const openDialog = document.querySelector("dialog[open]");
    if (openDialog && region.parentElement !== openDialog) openDialog.appendChild(region);
    else if (!openDialog && region.parentElement !== document.body) document.body.appendChild(region);
    setTimeout(() => toast.classList.add("is-leaving"), 4200);
    setTimeout(() => toast.remove(), 4600);
  },

  // Confirmation dialog (replaces confirm). Resolves true / false.
  confirmDialog(message, { confirmLabel, danger = true } = {}) {
    return this.openFeedbackDialog({ message, confirmLabel: confirmLabel || this.t("dialog_confirm"), danger });
  },

  // Text input dialog (replaces prompt). Resolves the text, or null when cancelled.
  promptDialog(message, defaultValue = "") {
    return this.openFeedbackDialog({ message, input: true, defaultValue, confirmLabel: this.t("dialog_ok"), danger: false });
  },

  openFeedbackDialog({ message, input = false, defaultValue = "", confirmLabel, danger }) {
    return new Promise(resolve => {
      const dialog = document.createElement("dialog");
      dialog.className = "feedback-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="feedback-dialog-body">
          <p class="feedback-dialog-message"></p>
          ${input ? '<input type="text" class="form-input feedback-dialog-input">' : ""}
          <div class="feedback-dialog-actions">
            <button type="button" class="btn btn-secondary" value="cancel">${this.escapeHtml(this.t("cancel"))}</button>
            <button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}" value="ok">${this.escapeHtml(confirmLabel)}</button>
          </div>
        </form>`;
      dialog.querySelector(".feedback-dialog-message").textContent = message;
      const field = dialog.querySelector(".feedback-dialog-input");
      if (field) field.value = defaultValue;
      const finish = ok => {
        const value = ok ? (field ? field.value : true) : (field ? null : false);
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.querySelector('button[value="cancel"]').addEventListener("click", () => finish(false));
      dialog.querySelector("form").addEventListener("submit", e => { e.preventDefault(); finish(true); });
      dialog.addEventListener("cancel", e => { e.preventDefault(); finish(false); });
      (document.querySelector("dialog[open]") || document.body).appendChild(dialog);
      dialog.showModal();
      (field || dialog.querySelector('button[value="ok"]')).focus();
      if (field) field.select();
    });
  }
};
