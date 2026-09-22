// Server session, login/logout, user list.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_ACTIVE_APP_KEY, warnStorage } from "./constants.js";

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

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.dom.directLoginErrorMsg.textContent = data.error || this.t("login_error_invalid");
        this.dom.directLoginErrorMsg.style.display = "block";
        return;
      }

      this.dom.directLoginErrorMsg.style.display = "none";
      this.currentUser = data.user;
      await this.fetchServerUsers();

      if (this.currentUser.role === "user") {
        this.setAppView("events");
      } else if (this.currentUser.role === "admin") {
        this.setAppView("social");
      } else {
        this.setAppView("events");
      }
      this.updateUserNavDisplay();
    } catch (err) {
      this.dom.directLoginErrorMsg.textContent = this.t("login_error_invalid");
      this.dom.directLoginErrorMsg.style.display = "block";
    }
  },
  openLoginDialog(targetApp = "events") {
    this.pendingLoginTarget = targetApp;
    this.dom.loginUsername.value = "";
    this.dom.loginPassword.value = "";
    this.dom.loginErrorMsg.style.display = "none";

    if (targetApp === "admin") {
      this.dom.loginSubtitle.textContent = this.t("login_subtitle_admin");
    } else {
      this.dom.loginSubtitle.textContent = this.t("login_subtitle_events");
    }

    this.dom.loginDialog.showModal();
    setTimeout(() => this.dom.loginUsername.focus(), 50);
  },
  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = this.dom.loginUsername.value.trim().toLowerCase();
    const password = this.dom.loginPassword.value.trim();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.dom.loginErrorMsg.textContent = data.error || this.t("login_error_invalid");
        this.dom.loginErrorMsg.style.display = "block";
        return;
      }

      const user = data.user;
      if (this.pendingLoginTarget === "admin" && user.role !== "admin") {
        this.dom.loginErrorMsg.textContent = this.t("login_error_no_admin").replace("${name}", user.name);
        this.dom.loginErrorMsg.style.display = "block";
        return;
      }

      this.currentUser = user;
      this.dom.loginDialog.close();
      await this.fetchServerUsers();

      if (user.role === "user") {
        this.setAppView("events");
      } else {
        const target = this.pendingLoginTarget === "admin" ? "admin" : (this.pendingLoginTarget === "events" ? "events" : "social");
        this.setAppView(target);
      }
      this.updateUserNavDisplay();
    } catch (err) {
      this.dom.loginErrorMsg.textContent = this.t("login_error_invalid");
      this.dom.loginErrorMsg.style.display = "block";
    }
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
