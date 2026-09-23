// Server session, login/logout, user list.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_ACTIVE_APP_KEY, warnStorage } from "./constants.js";
import { apiRequest } from "./core/utils.js";

export const authMethods = {
  isDemoAccount() {
    return Boolean(this.currentUser && (this.currentUser.isDemo || this.currentUser.username === "demo" || this.currentUser.username === "demo_admin"));
  },
  canBookRooms() {
    if (!this.currentUser) return false;
    return this.currentUser.role === "admin" || this.currentUser.role === "moderator";
  },
  // =========================================================================
  // AUTHENTICATION & SERVER REST HANDLERS
  // =========================================================================
  async initServerAuth() {
    try {
      await this.resolveServerSession();
    } finally {
      document.documentElement.classList.remove("is-booting");
    }
  },
  async resolveServerSession() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          await this.fetchServerUsers();
          if (this.currentUser.role === "admin") {
            const savedApp = localStorage.getItem(STORAGE_ACTIVE_APP_KEY) || "social";
            this.setAppView(savedApp === "login" ? "social" : savedApp);
          } else {
            this.setAppView("events");
          }
          this.updateUserNavDisplay();
          return;
        }
      }
    } catch (err) {
      console.warn("Server auth check fallback:", err);
    }

    // Default unauthenticated state
    this.currentUser = null;
    this.setAppView("login");
    this.updateUserNavDisplay();
  },
  // Admins get the full user list; everyone else gets the public directory (names/colours).
  async fetchServerUsers() {
    const url = this.currentUser?.role === "admin" ? "/api/users" : "/api/users/directory";
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      this.users = data;
      this.renderEventsUserFilterBar();
      if (this.activeApp === "admin") this.renderAdminPanel();
    } catch (err) {
      console.warn("Fetch server users error:", err);
    }
  },
  async handleDirectLoginSubmit(e) {
    e.preventDefault();
    const username = this.dom.directLoginUsername.value.trim().toLowerCase();
    const password = this.dom.directLoginPassword.value.trim();
    const errorEl = this.dom.directLoginErrorMsg;
    const showError = msg => { errorEl.textContent = msg; errorEl.style.display = "block"; };

    try {
      const { res, data } = await apiRequest("POST", "/api/auth/login", { username, password });
      if (!res.ok || !data.success) {
        showError(data.error || this.t("login_error_invalid"));
        return;
      }

      errorEl.style.display = "none";
      await this.completeLogin(data.user);
    } catch (err) {
      showError(this.t("login_error_invalid"));
    }
  },
  // After a successful password or passkey sign-in.
  async completeLogin(user) {
    this.currentUser = user;
    await this.fetchServerUsers();
    // Honour the page that asked for a login (e.g. the admin panel), when the role allows it.
    const target = this.pendingLoginTarget;
    this.pendingLoginTarget = null;
    if (this.currentUser.role === "admin") {
      this.setAppView(target === "admin" || target === "events" ? target : "social");
    } else {
      this.setAppView("events");
    }
    this.updateUserNavDisplay();
  },
  // Any action that needs a session sends the visitor to the login screen, then back.
  openLoginDialog(targetApp = "events") {
    this.pendingLoginTarget = targetApp;
    this.setAppView("login");
  },
  async handleLogout() {
    this.currentUser = null;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (err) { warnStorage(err); }
    try {
      localStorage.removeItem(STORAGE_ACTIVE_APP_KEY);
    } catch (err) { warnStorage(err); }
    this.setAppView("login");
    this.updateUserNavDisplay();
  }
};
