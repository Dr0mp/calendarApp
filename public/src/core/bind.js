// Event listener wiring. Each feature module owns its own bind*() method; this calls them in order.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const bindMethods = {
  bindEvents() {
    this.bindGlobal();
    this.bindPasskeys();
    this.bindWorkspaceRefresh();
    this.bindResponsiveTables();
    this.bindSocialCalendar();
    this.bindNavigation();
    this.bindAdminDialogs();
    this.bindEventsCalendar();
  },
  // Delegated handlers (theme, language, demo logins, share buttons) and the login form.
  bindGlobal() {
    // Broken platform icons: hide them (and show the colour dot instead, where there is one).
    // Replaces inline onerror="" handlers, which the Content-Security-Policy blocks.
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
      img.style.display = "none";
      if (img.dataset.fallback === "dot" && img.nextElementSibling) img.nextElementSibling.style.display = "inline-block";
    }, true);

    // =========================================================================
    // 1. GLOBAL DELEGATED EVENT HANDLERS (Theme, Language, Demo Accounts)
    // =========================================================================
    document.addEventListener("click", (e) => {
      // Theme toggles
      const themeBtn = e.target.closest("[data-theme-toggle]");
      if (themeBtn) {
        e.preventDefault();
        this.toggleTheme();
        return;
      }

      // Language switcher
      const langBtn = e.target.closest(".lang-btn");
      if (langBtn) {
        e.preventDefault();
        const targetLang = langBtn.dataset.lang;
        if (targetLang && targetLang !== this.currentLang) {
          this.setLanguage(targetLang);
        }
        return;
      }

      // Direct Login 1-Click Demo accounts (Isolated Read-Only Previews)
      const directDemoChip = e.target.closest(".direct-demo-chip");
      if (directDemoChip) {
        e.preventDefault();
        // Read-only demo accounts; the password is the server's DEMO_PASSWORD (default "demo123").
        const DEMO_ACCOUNTS = {
          demo: "demo123",
          demo_admin: "demo123"
        };
        const u = directDemoChip.dataset.user;
        if (this.dom.directLoginUsername) this.dom.directLoginUsername.value = u;
        if (this.dom.directLoginPassword) this.dom.directLoginPassword.value = DEMO_ACCOUNTS[u] || "";
        if (this.dom.directLoginForm) this.dom.directLoginForm.requestSubmit();
        return;
      }

      // Quick copy share link buttons
      const copyBtn = e.target.closest(".btn-quick-copy-share, .btn-feed-copy-share");
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const link = copyBtn.dataset.link;
        if (link) {
          this.copyToClipboard(link, copyBtn);
        }
        return;
      }

      // Feed open share link buttons
      const openBtn = e.target.closest(".btn-feed-open-share");
      if (openBtn) {
        e.stopPropagation();
        return;
      }
    });
    // =========================================================================
    // 2. AUTHENTICATION & LOGIN FORM HANDLERS
    // =========================================================================
    if (this.dom.directLoginForm) {
      this.dom.directLoginForm.addEventListener("submit", (e) => this.handleDirectLoginSubmit(e));
    }
  }
};
