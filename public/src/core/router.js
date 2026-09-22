// Top-level view switching and the navigation bar.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_ACTIVE_APP_KEY, warnStorage } from "../constants.js";

export const routerMethods = {
  // Top navigation bar.
  bindNavigation() {
    // =========================================================================
    // 4. TOP UNIVERSAL NAVIGATION BAR
    // =========================================================================
    if (this.dom.navEventsBtn) {
      this.dom.navEventsBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "panel";
        this.setAppView("events");
      });
    }
    if (this.dom.navScheduleBtn) {
      this.dom.navScheduleBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "schedule";
        this.setAppView("events");
        this.openScheduleEventPage();
      });
    }
    if (this.dom.navMyEventsBtn) {
      this.dom.navMyEventsBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "my-events";
        this.setAppView("events");
      });
    }
    if (this.dom.btnMyEventsCreateNew) {
      this.dom.btnMyEventsCreateNew.addEventListener("click", () => {
        this.eventsLayoutMode = "schedule";
        this.setAppView("events");
        this.openScheduleEventPage();
      });
    }
    if (this.dom.myEventsFilterTabs) {
      this.dom.myEventsFilterTabs.querySelectorAll(".btn-filter-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          this.dom.myEventsFilterTabs.querySelectorAll(".btn-filter-tab").forEach(b => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          this.myEventsActiveFilter = btn.dataset.filter || "all";
          this.renderMyEventsPage();
        });
      });
    }
    if (this.dom.myEventsSearchInput) {
      this.dom.myEventsSearchInput.addEventListener("input", () => {
        this.renderMyEventsPage();
      });
    }
    if (this.dom.navSocialBtn) {
      this.dom.navSocialBtn.addEventListener("click", () => {
        if (this.currentUser && this.currentUser.role === "admin") {
          this.setAppView("social");
        }
      });
    }
    if (this.dom.navAdminBtn) {
      this.dom.navAdminBtn.addEventListener("click", () => {
        if (this.currentUser && this.currentUser.role === "admin") {
          this.setAppView("admin");
        }
      });
    }
    if (this.dom.navLogoutBtn) {
      this.dom.navLogoutBtn.addEventListener("click", () => this.handleLogout());
    }

    if (this.dom.linkFooterStandards) {
      this.dom.linkFooterStandards.addEventListener("click", (e) => {
        e.preventDefault();
        this.openStandardsModal();
      });
    }
  },
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

    this.applyRoleNavigation();

    this.updateMyEventsBadgeCount();

    // Active menu tab indicator (tabs swapping through pages)
    if (this.dom.navEventsBtn) {
      const isCalendarTab = viewName === "events" && this.eventsLayoutMode === "panel";
      this.dom.navEventsBtn.classList.toggle("is-active", isCalendarTab);
      this.dom.navEventsBtn.setAttribute("aria-selected", isCalendarTab ? "true" : "false");
    }
    if (this.dom.navScheduleBtn) {
      const isScheduleTab = viewName === "events" && this.eventsLayoutMode === "schedule";
      this.dom.navScheduleBtn.classList.toggle("is-active", isScheduleTab);
      this.dom.navScheduleBtn.setAttribute("aria-selected", isScheduleTab ? "true" : "false");
    }
    if (this.dom.navMyEventsBtn) {
      const isMyEventsTab = viewName === "events" && this.eventsLayoutMode === "my-events";
      this.dom.navMyEventsBtn.classList.toggle("is-active", isMyEventsTab);
      this.dom.navMyEventsBtn.setAttribute("aria-selected", isMyEventsTab ? "true" : "false");
    }
    if (this.dom.navSocialBtn) {
      this.dom.navSocialBtn.classList.toggle("is-active", viewName === "social");
      this.dom.navSocialBtn.setAttribute("aria-selected", viewName === "social" ? "true" : "false");
    }
    if (this.dom.navAdminBtn) {
      this.dom.navAdminBtn.classList.toggle("is-active", viewName === "admin");
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

    this.applyRoleNavigation();
  },
  // Social Calendar and Admin are admin-only (the server enforces the same); everything else is shared.
  applyRoleNavigation() {
    const role = this.currentUser?.role;
    const isAdmin = role === "admin";
    const show = (el, visible) => { if (el) el.style.display = visible ? "inline-flex" : "none"; };
    show(this.dom.navSocialBtn, isAdmin);
    show(this.dom.navAdminBtn, isAdmin);
    show(this.dom.navEventsBtn, true);
    show(this.dom.navScheduleBtn, true);
    show(this.dom.navMyEventsBtn, true);
    if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t(role === "user" ? "nav_sign_out" : "nav_logout");
  }
};
