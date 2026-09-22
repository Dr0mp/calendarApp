// Top-level view switching and the navigation bar.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_ACTIVE_APP_KEY, warnStorage } from "../constants.js";

export const routerMethods = {
  // =========================================================================
  // VIEW NAVIGATION & SESSION MANAGEMENT
  // =========================================================================
  setAppView(viewName) {
    if (!this.currentUser && viewName !== "login") {
      this.setAppView("login");
      return;
    }

    // Security check: Regular users cannot access Social Calendar, Admin Panel or Portal
    if (this.currentUser && this.currentUser.role === "user") {
      if (viewName !== "events") {
        viewName = "events";
      }
    }

    this.activeApp = viewName;
    try {
      localStorage.setItem(STORAGE_ACTIVE_APP_KEY, viewName);
    } catch (e) { warnStorage(e); }

    // Containers
    if (this.dom.directLoginView) {
      this.dom.directLoginView.style.display = viewName === "login" ? "flex" : "none";
    }
    if (this.dom.socialCalendarApp) {
      this.dom.socialCalendarApp.style.display = viewName === "social" ? "block" : "none";
    }
    if (this.dom.eventsCalendarApp) {
      this.dom.eventsCalendarApp.style.display = viewName === "events" ? "block" : "none";
    }
    if (this.dom.adminApp) {
      this.dom.adminApp.style.display = viewName === "admin" ? "block" : "none";
    }

    // Universal Nav Bar
    if (viewName === "login") {
      this.dom.universalNavBar.style.display = "none";
    } else {
      this.dom.universalNavBar.style.display = "flex";
    }

    // Role-specific nav adjustments
    if (this.currentUser && this.currentUser.role === "user") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "none";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "none";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navMyEventsBtn) this.dom.navMyEventsBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_sign_out");
    } else {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "inline-flex";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "inline-flex";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navMyEventsBtn) this.dom.navMyEventsBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }

    this.updateMyEventsBadgeCount();

    // Active menu tab indicator (tabs swapping through pages)
    if (this.dom.navEventsBtn) {
      const isCalendarTab = viewName === "events" && this.eventsLayoutMode === "panel";
      this.dom.navEventsBtn.classList.toggle("active", isCalendarTab);
      this.dom.navEventsBtn.setAttribute("aria-selected", isCalendarTab ? "true" : "false");
    }
    if (this.dom.navScheduleBtn) {
      const isScheduleTab = viewName === "events" && this.eventsLayoutMode === "schedule";
      this.dom.navScheduleBtn.classList.toggle("active", isScheduleTab);
      this.dom.navScheduleBtn.setAttribute("aria-selected", isScheduleTab ? "true" : "false");
    }
    if (this.dom.navMyEventsBtn) {
      const isMyEventsTab = viewName === "events" && this.eventsLayoutMode === "my-events";
      this.dom.navMyEventsBtn.classList.toggle("active", isMyEventsTab);
      this.dom.navMyEventsBtn.setAttribute("aria-selected", isMyEventsTab ? "true" : "false");
    }
    if (this.dom.navSocialBtn) {
      this.dom.navSocialBtn.classList.toggle("active", viewName === "social");
      this.dom.navSocialBtn.setAttribute("aria-selected", viewName === "social" ? "true" : "false");
    }
    if (this.dom.navAdminBtn) {
      this.dom.navAdminBtn.classList.toggle("active", viewName === "admin");
      this.dom.navAdminBtn.setAttribute("aria-selected", viewName === "admin" ? "true" : "false");
    }

    // Nav user pill
    if (this.currentUser) {
      this.dom.navUserPill.style.display = "inline-flex";
      this.dom.navUserAvatar.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-user"></use></svg>';
      const cleanName = (this.currentUser.name || this.currentUser.username || "").replace(/\s*\([^)]*\)/g, "").trim();
      this.dom.navUserName.textContent = cleanName;
      if (this.isDemoAccount()) {
        this.dom.navUserRole.textContent = this.t("demo_badge");
        this.dom.navUserRole.className = "user-role-badge role-demo";
      } else {
        this.dom.navUserRole.textContent = this.currentUser.role;
        this.dom.navUserRole.className = `user-role-badge ${this.currentUser.role === "admin" ? "role-admin" : ""}`;
      }
      if (this.currentUser.role === "admin") {
        this.updateStorageQuotaDisplay();
      }
    } else {
      this.dom.navUserPill.style.display = "none";
    }

    // Render corresponding sub-app
    if (viewName === "social") {
      this.syncSocialViewMode();
      this.render();
      this.updateSocialNotificationBadge();
    } else if (viewName === "events") {
      const mode = this.eventsLayoutMode || "panel";
      this.setEventsLayoutMode(mode);
    } else if (viewName === "admin") {
      this.renderAdminPanel();
    }

    this.updateUserNavDisplay();
  },
  updateUserNavDisplay() {
    if (!this.dom || !this.dom.navUserPill) return;

    if (this.currentUser) {
      this.dom.navUserPill.style.display = "inline-flex";
      if (this.dom.navUserAvatar) {
        this.dom.navUserAvatar.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-user"></use></svg>';
      }
      if (this.dom.navUserName) {
        const cleanName = (this.currentUser.name || this.currentUser.username || "").replace(/\s*\([^)]*\)/g, "").trim();
        this.dom.navUserName.textContent = cleanName;
      }
      if (this.dom.navUserRole) {
        if (this.isDemoAccount()) {
          this.dom.navUserRole.textContent = this.t("demo_badge");
          this.dom.navUserRole.className = "user-role-badge role-demo";
        } else {
          this.dom.navUserRole.textContent = this.currentUser.role;
          this.dom.navUserRole.className = `user-role-badge ${this.currentUser.role === "admin" ? "role-admin" : ""}`;
        }
      }
      if (this.currentUser.role === "admin") {
        this.updateStorageQuotaDisplay();
      }
    } else {
      this.dom.navUserPill.style.display = "none";
    }

    // Role-specific nav adjustments
    if (this.currentUser && this.currentUser.role === "user") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "none";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "none";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_sign_out");
    } else if (this.currentUser && this.currentUser.role === "admin") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "inline-flex";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "inline-flex";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }
  }
};
