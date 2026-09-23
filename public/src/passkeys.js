// Passkeys (WebAuthn): sign-in without a password, plus managing your own passkeys.
// Browser side of /api/passkeys/*; the library is served same-origin from /vendor/webauthn.js.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { apiRequest } from "./core/utils.js";

let webauthnClient = null;
async function loadClient() {
  if (!webauthnClient) webauthnClient = (await import("/vendor/webauthn.js")).client;
  return webauthnClient;
}

const supported = () => typeof window.PublicKeyCredential === "function" && window.isSecureContext;

export const passkeyMethods = {
  bindPasskeys() {
    this.dom.passkeyLoginBlock?.toggleAttribute("hidden", !supported());
    this.dom.passkeyLoginBtn?.addEventListener("click", () => this.signInWithPasskey());
    this.dom.navPasskeysBtn?.addEventListener("click", () => this.openPasskeysDialog());
    this.dom.closePasskeysDialogBtn?.addEventListener("click", () => this.dom.passkeysDialog?.close());
    this.dom.passkeyAddBtn?.addEventListener("click", () => this.addPasskey());
    this.dom.editUserResetPasskeysBtn?.addEventListener("click", () => this.adminResetPasskeys(this.dom.editUserId.value));
  },

  // Shown for signed-in, non-demo users on a browser that supports passkeys.
  updatePasskeyNav() {
    const show = Boolean(this.currentUser && !this.currentUser.isDemo && supported());
    this.dom.navPasskeysBtn?.toggleAttribute("hidden", !show);
    this.dom.morePasskeysBtn?.toggleAttribute("hidden", !show);
  },

  // User cancelled the browser prompt / timed out: not an error worth shouting about.
  isPasskeyCancel(err) {
    return err && (err.name === "NotAllowedError" || err.name === "AbortError");
  },

  async signInWithPasskey() {
    const errorEl = this.dom.directLoginErrorMsg;
    const showError = msg => { errorEl.textContent = msg; errorEl.style.display = "block"; };
    try {
      const client = await loadClient();
      const { res: optRes, data: opts } = await apiRequest("POST", "/api/passkeys/login/options");
      if (!optRes.ok) return showError(opts.error || this.t("passkey_login_failed"));
      const authentication = await client.authenticate({ challenge: opts.challenge, userVerification: "required", timeout: 60000 });
      const { res, data } = await apiRequest("POST", "/api/passkeys/login", { authentication });
      if (!res.ok || !data.success) return showError(this.t("passkey_login_failed"));
      errorEl.style.display = "none";
      await this.completeLogin(data.user);
    } catch (err) {
      if (!this.isPasskeyCancel(err)) {
        console.warn("Passkey sign-in failed:", err);
        showError(this.t("passkey_login_failed"));
      }
    }
  },

  async openPasskeysDialog() {
    await this.renderPasskeysList();
    this.dom.passkeysDialog?.showModal();
  },

  async renderPasskeysList() {
    const list = this.dom.passkeysList;
    if (!list) return;
    const { res, data } = await apiRequest("GET", "/api/passkeys");
    const keys = res.ok && Array.isArray(data) ? data : [];
    const fmt = iso => iso ? new Date(iso).toLocaleDateString(this.locale(), { day: "numeric", month: "short", year: "numeric" }) : "—";
    list.innerHTML = keys.map(k => `
      <li class="passkey-item" data-id="${this.escapeHtml(k.id)}">
        ${this.icon("key")}
        <div class="passkey-item-text">
          <strong>${this.escapeHtml(k.name)}</strong>
          <span>${this.escapeHtml(this.tf("passkey_meta", { created: fmt(k.createdAt), used: fmt(k.lastUsedAt) }))}</span>
        </div>
        <button type="button" class="btn btn-danger btn-sm passkey-remove-btn" title="${this.escapeHtml(this.t("passkey_remove"))}" aria-label="${this.escapeHtml(this.t("passkey_remove"))}">${this.icon("trash")}</button>
      </li>`).join("");
    list.querySelectorAll(".passkey-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => this.removePasskey(btn.closest(".passkey-item").dataset.id));
    });
    this.dom.passkeysEmpty?.toggleAttribute("hidden", keys.length > 0);
  },

  async addPasskey() {
    if (this.isDemoAccount()) return this.notify(this.t("demo_no_admin_save"), "warning");
    try {
      const client = await loadClient();
      const { res: optRes, data: opts } = await apiRequest("POST", "/api/passkeys/register/options");
      if (!optRes.ok) return this.notify(opts.error || this.t("passkey_add_failed"), "danger");
      const registration = await client.register({
        challenge: opts.challenge,
        user: opts.user,
        discoverable: "required", // lets the user sign in without typing a username
        userVerification: "required",
        attestation: false,
        timeout: 60000
      });
      const name = this.dom.passkeyNameInput?.value.trim() || "";
      const { res, data } = await apiRequest("POST", "/api/passkeys/register", { registration, name });
      if (!res.ok) return this.notify(data.code === "passkey_exists" ? this.t("passkey_exists") : this.t("passkey_add_failed"), "danger");
      if (this.dom.passkeyNameInput) this.dom.passkeyNameInput.value = "";
      this.notify(this.t("passkey_added"), "success");
      await this.renderPasskeysList();
      await this.refreshUsersAfterPasskeyChange();
    } catch (err) {
      if (err && err.name === "InvalidStateError") return this.notify(this.t("passkey_exists"), "warning");
      if (!this.isPasskeyCancel(err)) {
        console.warn("Passkey registration failed:", err);
        this.notify(this.t("passkey_add_failed"), "danger");
      }
    }
  },

  async removePasskey(id) {
    if (!(await this.confirmDialog(this.t("passkey_remove_confirm")))) return;
    const { res } = await apiRequest("DELETE", `/api/passkeys/${encodeURIComponent(id)}`);
    this.notify(this.t(res.ok ? "passkey_removed" : "passkey_remove_failed"), res.ok ? "success" : "danger");
    await this.renderPasskeysList();
    await this.refreshUsersAfterPasskeyChange();
  },

  // Keeps passkeyCount in the admin user list current (only admins can read that list).
  async refreshUsersAfterPasskeyChange() {
    if (this.currentUser?.role === "admin") await this.fetchServerUsers();
  },

  // Admin: fill the passkey row of the Edit User dialog.
  renderEditUserPasskeys(user) {
    const n = user.passkeyCount || 0;
    this.dom.editUserPasskeysRow?.toggleAttribute("hidden", n === 0);
    if (this.dom.editUserPasskeysCount) this.dom.editUserPasskeysCount.textContent = this.tn("passkey_count", n);
  },

  async adminResetPasskeys(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user || !(await this.confirmDialog(this.tf("passkeys_reset_confirm", { name: user.name })))) return;
    const { res, data } = await apiRequest("DELETE", `/api/users/${encodeURIComponent(userId)}/passkeys`);
    if (!res.ok) return this.notify(data.error || this.t("passkey_remove_failed"), "danger");
    this.notify(this.t("passkeys_reset_done"), "success");
    await this.fetchServerUsers();
    const fresh = this.users.find(u => u.id === userId);
    if (fresh) this.renderEditUserPasskeys(fresh);
  }
};
