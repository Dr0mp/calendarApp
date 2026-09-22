// Language and theme: t(), applyLanguage(), theme switching.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_LANG_KEY, STORAGE_THEME_KEY, warnStorage } from "../constants.js";
import { TRANSLATIONS } from "../data/i18n.js";

export const i18nMethods = {
  loadLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_LANG_KEY);
      if (stored === "en" || stored === "ro") return stored;
    } catch (e) { warnStorage(e); }
    // Default to Romanian ('ro')
    return "ro";
  },
  saveLanguage(lang) {
    this.currentLang = lang;
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch (e) { warnStorage(e); }
  },
  loadTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch (e) { warnStorage(e); }
    return "light";
  },
  applyTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = this.theme;
    document.documentElement.style.colorScheme = this.theme;
    const nextTheme = this.theme === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const label = `Switch to ${nextTheme} theme`;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.setAttribute("aria-pressed", String(this.theme === "light"));
    });
    try { localStorage.setItem(STORAGE_THEME_KEY, this.theme); } catch (e) { warnStorage(e); }
  },
  toggleTheme() {
    this.applyTheme(this.theme === "dark" ? "light" : "dark");
  },
  t(key, fallback = "") {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.ro;
    if (dict[key] !== undefined) return dict[key];
    if (!this._missingKeys) this._missingKeys = new Set();
    if (!this._missingKeys.has(key)) {
      this._missingKeys.add(key);
      console.warn(`[i18n] missing key "${key}" (${this.currentLang})`);
    }
    return fallback || key;
  },
  setLanguage(lang) {
    if (lang !== "ro" && lang !== "en") lang = "ro";
    this.saveLanguage(lang);
    this.applyLanguage(lang, true);
  },
  applyLanguage(lang, reRenderViews = true) {
    document.documentElement.lang = lang;

    // Update all elements with data-i18n attribute
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.dataset.i18n;
      if (k) el.textContent = this.t(k);
    });

    // Update all language toggle buttons
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });

    // 1. Universal Top Navigation Bar
    const brandTitle = document.querySelector(".nav-brand-title span");
    if (brandTitle) brandTitle.textContent = this.t("nav_brand");
    const navEventsLabel = this.dom.navEventsBtn?.querySelector(".nav-tab-label");
    if (navEventsLabel) navEventsLabel.textContent = this.t("nav_events");
    const navScheduleLabel = this.dom.navScheduleBtn?.querySelector(".nav-tab-label");
    if (navScheduleLabel) navScheduleLabel.textContent = this.t("nav_schedule");
    const navMyEventsLabel = this.dom.navMyEventsBtn?.querySelector(".nav-tab-label");
    if (navMyEventsLabel) navMyEventsLabel.textContent = this.t("nav_my_events");
    const navSocialLabel = this.dom.navSocialBtn?.querySelector(".nav-tab-label");
    if (navSocialLabel) navSocialLabel.textContent = this.t("nav_social");
    if (this.dom.navAdminBtn) {
      const navAdminLabel = this.dom.navAdminBtn.querySelector(".nav-tab-label");
      const quotaBadge = document.getElementById("nav-admin-quota-badge");
      if (navAdminLabel) navAdminLabel.textContent = this.t("nav_admin");
      this.dom.navAdminBtn.title = this.t("nav_admin");
      this.dom.navAdminBtn.setAttribute("aria-label", this.t("nav_admin"));
      if (quotaBadge) quotaBadge.title = this.t("nav_quota_alert_tooltip");
    }
    if (this.dom.navLogoutBtn) {
      this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }

    // 2. Direct Login View
    const dlTitle = document.querySelector(".direct-login-title");
    if (dlTitle) dlTitle.textContent = this.t("direct_login_title");
    const dlSubtitle = document.querySelector(".direct-login-subtitle");
    if (dlSubtitle) dlSubtitle.textContent = this.t("direct_login_subtitle");
    const dlUserLabel = document.querySelector("label[for='direct-login-username']");
    if (dlUserLabel) dlUserLabel.textContent = this.t("direct_login_username_label");
    if (this.dom.directLoginUsername) this.dom.directLoginUsername.placeholder = this.t("direct_login_username_placeholder");
    const dlPassLabel = document.querySelector("label[for='direct-login-password']");
    if (dlPassLabel) dlPassLabel.textContent = this.t("direct_login_password_label");
    if (this.dom.directLoginPassword) this.dom.directLoginPassword.placeholder = this.t("direct_login_password_placeholder");
    const dlDemoTitle = document.querySelector("#direct-login-view .quick-demo-logins span");
    if (dlDemoTitle) dlDemoTitle.textContent = this.t("direct_login_demo_title");
    const demoLabels = {
      demo: "direct_login_demo_user",
      demo_admin: "direct_login_demo_admin"
    };
    document.querySelectorAll("#direct-login-view .direct-demo-chip, #login-dialog .btn-demo-chip").forEach(btn => {
      const userKey = btn.dataset.user;
      if (demoLabels[userKey]) {
        btn.textContent = this.t(demoLabels[userKey]);
      }
    });
    const dlSubmitBtn = document.querySelector("#direct-login-form button[type='submit']");
    if (dlSubmitBtn) dlSubmitBtn.textContent = this.t("direct_login_submit");

    const notifLabels = { all: "notif_filter_all", pending: "notif_filter_pending", promoted: "notif_filter_posted" };
    document.querySelectorAll("[data-notif-filter-label]").forEach(label => {
      label.textContent = this.t(notifLabels[label.dataset.notifFilterLabel]);
    });

    // 3. Social Media Calendar Sub-App
    const smcTitle = document.querySelector("#social-calendar-app .header-main-title");
    if (smcTitle) smcTitle.textContent = this.t("social_title");
    if (this.dom.prevMonthBtn) this.dom.prevMonthBtn.title = this.t("social_prev_month");
    if (this.dom.nextMonthBtn) this.dom.nextMonthBtn.title = this.t("social_next_month");
    if (this.dom.todayBtn) this.dom.todayBtn.textContent = this.t("social_today_btn");
    if (this.dom.viewMonthBtn) {
      this.dom.viewMonthBtn.textContent = this.t("social_view_calendar");
      this.dom.viewMonthBtn.title = this.t("social_view_calendar");
    }
    if (this.dom.viewYearBtn) {
      this.dom.viewYearBtn.textContent = this.t("social_view_year");
      this.dom.viewYearBtn.title = this.t("social_view_year");
    }
    if (this.dom.viewFeedBtn) {
      this.dom.viewFeedBtn.textContent = this.t("social_view_feed");
      this.dom.viewFeedBtn.title = this.t("social_view_feed");
    }
    const openControlPanelLbl = document.getElementById("lbl-open-control-panel") || this.dom.openControlPanelBtn?.querySelector("span");
    if (openControlPanelLbl) openControlPanelLbl.textContent = this.t("social_platforms_btn");
    if (this.dom.openControlPanelBtn) this.dom.openControlPanelBtn.title = this.t("social_platforms_btn");

    if (this.dom.btnSocialEventNotifications) {
      const notifLabel = document.getElementById("lbl-social-event-notifications") || this.dom.btnSocialEventNotifications.querySelector(".event-alerts-label");
      if (notifLabel) notifLabel.textContent = this.t("social_event_alerts_btn");
      this.dom.btnSocialEventNotifications.title = this.t("social_event_alerts_btn");
    }

    const openAddPostLbl = document.getElementById("lbl-open-add-post") || this.dom.openAddPostBtn?.querySelector("span");
    if (openAddPostLbl) openAddPostLbl.textContent = this.t("social_new_post_btn");
    if (this.dom.openAddPostBtn) this.dom.openAddPostBtn.title = this.t("social_new_post_btn");

    if (this.dom.socialSearchInput) {
      this.dom.socialSearchInput.placeholder = this.t("social_search_placeholder");
    }
    const footerStandardsLink = document.getElementById("link-footer-standards");
    if (footerStandardsLink) footerStandardsLink.textContent = this.t("social_standards_footer_link");

    // Update weekday headers in calendar grid
    const socialWeekdays = document.querySelectorAll("#calendar-view .calendar-weekdays .weekday");
    const weekdayKeys = ["weekday_mon", "weekday_tue", "weekday_wed", "weekday_thu", "weekday_fri", "weekday_sat", "weekday_sun"];
    socialWeekdays.forEach((wd, idx) => {
      if (weekdayKeys[idx]) wd.textContent = this.t(weekdayKeys[idx]);
    });

    const eventsWeekdays = document.querySelectorAll("#events-grid-view .calendar-weekdays .weekday");
    eventsWeekdays.forEach((wd, idx) => {
      if (weekdayKeys[idx]) wd.textContent = this.t(weekdayKeys[idx]);
    });

    // 5. Events Calendar Sub-App
    const evTitle = document.querySelector("#events-calendar-app .header-main-title");
    if (evTitle) evTitle.textContent = this.t("events_title");
    if (this.dom.eventsPrevMonthBtn) this.dom.eventsPrevMonthBtn.title = this.t("events_prev_period");
    if (this.dom.eventsNextMonthBtn) this.dom.eventsNextMonthBtn.title = this.t("events_next_period");
    if (this.dom.eventsTodayBtn) this.dom.eventsTodayBtn.textContent = this.t("events_today_btn");
    if (this.dom.btnZoomOut) this.dom.btnZoomOut.title = this.t("events_zoom_out");
    if (this.dom.btnZoomIn) this.dom.btnZoomIn.title = this.t("events_zoom_in");
    if (this.dom.btnZoomYearly) this.dom.btnZoomYearly.textContent = this.t("events_zoom_year");
    if (this.dom.btnZoomMonthly) this.dom.btnZoomMonthly.textContent = this.t("events_zoom_month");
    if (this.dom.btnZoomDaily) this.dom.btnZoomDaily.textContent = this.t("events_zoom_day");

    const openAddEventLbl = document.getElementById("lbl-open-add-event") || this.dom.openAddEventBtn?.querySelector("span");
    if (openAddEventLbl) openAddEventLbl.textContent = this.t("events_schedule_btn");
    if (this.dom.openAddEventBtn) this.dom.openAddEventBtn.title = this.t("events_schedule_btn");

    // 6. Admin Panel
    const adminH1 = document.querySelector(".admin-header-bar .brand-info h1");
    if (adminH1) adminH1.textContent = this.t("admin_title");
    const statLabels = document.querySelectorAll(".admin-top-stats .admin-stat-label");
    if (statLabels[0]) statLabels[0].textContent = this.t("admin_stat_users");
    if (statLabels[1]) statLabels[1].textContent = this.t("admin_stat_events");

    if (this.dom.quotaBannerTitle) this.dom.quotaBannerTitle.textContent = this.t("admin_quota_alert_title");
    if (this.dom.quotaBannerDesc) this.dom.quotaBannerDesc.textContent = this.t("admin_quota_alert_desc");
    if (this.dom.btnQuotaBannerCleanup) this.dom.btnQuotaBannerCleanup.textContent = this.t("admin_quota_cleanup_btn");

    const adminSec1H2 = document.querySelector(".admin-card:nth-of-type(1) .admin-card-header h2");
    if (adminSec1H2) adminSec1H2.textContent = this.t("admin_sec_users_title");
    const adminSec1Badge = document.querySelector(".admin-card:nth-of-type(1) .admin-card-header .badge-subtle");
    if (adminSec1Badge) adminSec1Badge.textContent = this.t("admin_sec_users_sub");

    const adminFnLabel = document.querySelector("label[for='new-user-fullname']");
    if (adminFnLabel) adminFnLabel.textContent = this.t("admin_fullname_label");
    if (this.dom.newUserFullname) this.dom.newUserFullname.placeholder = this.t("admin_fullname_placeholder");
    const adminUnLabel = document.querySelector("label[for='new-user-username']");
    if (adminUnLabel) adminUnLabel.textContent = this.t("admin_user_username_label");
    if (this.dom.newUserUsername) this.dom.newUserUsername.placeholder = this.t("admin_user_username_placeholder");
    const adminPwLabel = document.querySelector("label[for='new-user-password']");
    if (adminPwLabel) adminPwLabel.textContent = this.t("admin_user_pass_label");
    if (this.dom.newUserPassword) this.dom.newUserPassword.placeholder = this.t("admin_user_pass_placeholder");
    const adminRlLabel = document.querySelector("label[for='new-user-role']");
    if (adminRlLabel) adminRlLabel.textContent = this.t("admin_user_role_label");
    const adminRoleOpts = document.querySelectorAll("#new-user-role option");
    if (adminRoleOpts[0]) adminRoleOpts[0].textContent = this.t("admin_role_standard");
    if (adminRoleOpts[1]) adminRoleOpts[1].textContent = this.t("admin_role_admin");
    const adminCreateBtn = document.querySelector("#create-user-form button[type='submit']");
    if (adminCreateBtn) adminCreateBtn.textContent = this.t("admin_create_user_btn");

    const userTableThs = document.querySelectorAll(".admin-card:nth-of-type(1) .standards-table th");
    const utKeys = ["admin_th_user", "admin_th_username", "admin_th_role", "admin_th_events_count", "admin_th_created", "admin_th_actions"];
    userTableThs.forEach((th, idx) => {
      if (utKeys[idx]) th.textContent = this.t(utKeys[idx]);
    });

    const adminSec2H2 = document.querySelector(".admin-card:nth-of-type(2) .admin-card-header h2");
    if (adminSec2H2) adminSec2H2.textContent = this.t("admin_sec_audit_title");
    const adminSec2Badge = document.querySelector(".admin-card:nth-of-type(2) .admin-card-header .badge-subtle");
    if (adminSec2Badge) adminSec2Badge.textContent = this.t("admin_sec_audit_sub");

    const auditTableThs = document.querySelectorAll(".admin-card:nth-of-type(2) .standards-table th");
    const atKeys = ["admin_th_datetime", "admin_th_title", "admin_th_social_status", "admin_th_organizer", "admin_th_enroll_price", "admin_th_actions"];
    auditTableThs.forEach((th, idx) => {
      if (atKeys[idx]) th.textContent = this.t(atKeys[idx]);
    });

    const adminSec4H2 = document.querySelector("#admin-storage-section .admin-card-header h2");
    if (adminSec4H2) adminSec4H2.textContent = this.t("admin_sec_storage_title");
    if (this.dom.adminQuotaLimitBadge) this.dom.adminQuotaLimitBadge.textContent = this.t("admin_storage_cap_badge");
    if (this.dom.btnOpenStorageCleanup) this.dom.btnOpenStorageCleanup.textContent = this.t("admin_storage_cleanup_tools_btn");

    const breakdownLabels = document.querySelectorAll(".storage-breakdown-item .breakdown-label");
    if (breakdownLabels[0]) breakdownLabels[0].textContent = this.t("admin_breakdown_events");
    if (breakdownLabels[1]) breakdownLabels[1].textContent = this.t("admin_breakdown_posts");
    if (breakdownLabels[2]) breakdownLabels[2].textContent = this.t("admin_breakdown_free");

    const simToolbarSpan = document.querySelector(".storage-sim-toolbar span");
    if (simToolbarSpan) simToolbarSpan.textContent = this.t("admin_sim_toolbar");
    if (this.dom.btnSimNormal) this.dom.btnSimNormal.textContent = this.t("admin_sim_normal");
    if (this.dom.btnSimWarning) this.dom.btnSimWarning.textContent = this.t("admin_sim_warning");
    if (this.dom.btnSimCritical) this.dom.btnSimCritical.textContent = this.t("admin_sim_critical");
    if (this.dom.btnSimReset) this.dom.btnSimReset.textContent = this.t("admin_sim_reset");

    // 7. Modals / Dialogs
    // Notif Modal
    const notifTitle = document.getElementById("social-notifications-title");
    if (notifTitle) notifTitle.textContent = this.t("notif_modal_title");
    const notifDesc = document.querySelector("#social-notifications-modal .dialog-header p");
    if (notifDesc) notifDesc.textContent = this.t("notif_modal_desc");
    const notifCloseDoneBtn = document.getElementById("close-social-notifications-done-btn");
    if (notifCloseDoneBtn) notifCloseDoneBtn.textContent = this.t("cleanup_done_btn");

    // Storage Cleanup Modal
    const cleanupTitle = document.getElementById("storage-cleanup-title");
    if (cleanupTitle) cleanupTitle.textContent = this.t("cleanup_modal_title");
    const cleanupDesc = document.querySelector("#storage-cleanup-dialog .dialog-header p");
    if (cleanupDesc) cleanupDesc.textContent = this.t("cleanup_modal_desc");
    const cleanupCurCardTitle = document.querySelector(".cleanup-storage-card span");
    if (cleanupCurCardTitle) cleanupCurCardTitle.textContent = this.t("cleanup_current_usage");
    if (this.dom.btnExecuteCleanupEvents) this.dom.btnExecuteCleanupEvents.textContent = this.t("cleanup_btn_del_events");
    if (this.dom.btnExecuteStripImages) this.dom.btnExecuteStripImages.textContent = this.t("cleanup_btn_strip_images");
    if (this.dom.btnExecuteCleanupSocial) this.dom.btnExecuteCleanupSocial.textContent = this.t("cleanup_btn_purge_social");
    if (this.dom.closeStorageCleanupDoneBtn) this.dom.closeStorageCleanupDoneBtn.textContent = this.t("cleanup_done_btn");

    // Login Dialog
    const loginTitle = document.getElementById("login-dialog-title");
    if (loginTitle) loginTitle.innerHTML = `<span>${this.t("login_modal_title")}</span>`;
    const loginSub = document.getElementById("login-dialog-subtitle");
    if (loginSub) loginSub.textContent = this.t("login_modal_sub");
    const loginUnLabel = document.querySelector("label[for='login-username']");
    if (loginUnLabel) loginUnLabel.textContent = this.t("login_username_label");
    const loginPwLabel = document.querySelector("label[for='login-password']");
    if (loginPwLabel) loginPwLabel.textContent = this.t("login_password_label");
    const loginDemoSpan = document.querySelector("#login-dialog .quick-demo-logins span");
    if (loginDemoSpan) loginDemoSpan.textContent = this.t("direct_login_demo_title");
    if (this.dom.cancelLoginBtn) this.dom.cancelLoginBtn.textContent = this.t("login_cancel_btn");
    if (this.dom.loginSubmitBtn) this.dom.loginSubmitBtn.textContent = this.t("login_submit_btn");

    // Schedule Page & My Events Page
    if (this.dom.myEventsPageTitle) this.dom.myEventsPageTitle.textContent = this.t("my_events_title");
    if (this.dom.myEventsSubtitle) this.dom.myEventsSubtitle.textContent = this.t("my_events_sub");
    const myEventsCreateLbl = document.getElementById("lbl-my-events-create-new");
    if (myEventsCreateLbl) myEventsCreateLbl.textContent = this.t("my_events_create_new");
    const filterAllBtn = document.getElementById("filter-my-events-all");
    if (filterAllBtn) filterAllBtn.textContent = this.t("my_events_filter_all");
    const filterPublicBtn = document.getElementById("filter-my-events-public");
    if (filterPublicBtn) filterPublicBtn.textContent = this.t("my_events_filter_public");
    const filterRoomBtn = document.getElementById("filter-my-events-room");
    if (filterRoomBtn) {
      filterRoomBtn.textContent = this.t("my_events_filter_room");
      filterRoomBtn.style.display = this.canBookRooms() ? "inline-flex" : "none";
    }
    const filterLockedBtn = document.getElementById("filter-my-events-locked");
    if (filterLockedBtn) filterLockedBtn.textContent = this.t("my_events_filter_locked");
    if (this.dom.myEventsSearchInput) this.dom.myEventsSearchInput.placeholder = this.t("my_events_search_placeholder");
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
    const evDialogTitleLabel = document.querySelector("label[for='event-title-input']");
    if (evDialogTitleLabel) evDialogTitleLabel.textContent = this.t("dropin_title_label");
    const evDialogDateLabel = document.querySelector("label[for='event-date-input']");
    if (evDialogDateLabel) evDialogDateLabel.textContent = this.t("dropin_date_label");
    const evDialogRecurrentLabel = document.querySelector("#event-form .recurrence-box label.checkbox-label span");
    if (evDialogRecurrentLabel) evDialogRecurrentLabel.textContent = this.t("dropin_recurrent_label");
    const evDialogRecurrentRepeat = document.querySelector("label[for='event-recurrence-months']");
    if (evDialogRecurrentRepeat) evDialogRecurrentRepeat.textContent = this.t("dropin_recurrent_repeat");
    const evDialogMatrixLabel = document.querySelector("#event-free-hours-board")?.previousElementSibling?.querySelector("label");
    if (evDialogMatrixLabel) evDialogMatrixLabel.textContent = this.t("event_matrix_label");
    const evDialogMatrixHint = document.querySelector("#event-free-hours-board")?.previousElementSibling?.querySelector("span");
    if (evDialogMatrixHint) evDialogMatrixHint.textContent = this.t("event_matrix_hint");
    const evTimingLegend = document.querySelector("#event-timing-mode legend");
    if (evTimingLegend) evTimingLegend.textContent = this.t("event_timing_mode_label");
    document.querySelectorAll("input[name='event-timing-mode']").forEach(input => {
      const label = input.closest("label");
      if (label) label.lastChild.textContent = ` ${this.t(input.value === "async" ? "event_timing_async" : "event_timing_consecutive")}`;
    });
    const evDialogCreatorLabel = document.querySelector("label[for='event-creator-display']");
    if (evDialogCreatorLabel) evDialogCreatorLabel.textContent = this.t("event_scheduled_by_label");
    const evDialogHourLabel = document.querySelector("label[for='event-hour-input']");
    if (evDialogHourLabel) evDialogHourLabel.textContent = this.t("dropin_hour_label");
    const evDialogDurLabel = document.querySelector("label[for='event-duration-input']");
    if (evDialogDurLabel) evDialogDurLabel.textContent = this.t("dropin_duration_label");
    const evDialogPriceLabel = document.querySelector("label[for='event-price-input']");
    if (evDialogPriceLabel) evDialogPriceLabel.textContent = this.t("dropin_price_label");
    const evDialogEnrollLabel = document.querySelector("label[for='event-enroll-input']");
    if (evDialogEnrollLabel) evDialogEnrollLabel.textContent = this.t("dropin_enroll_label");
    const evDialogFbLabel = document.querySelector("label[for='event-fb-image-file']");
    if (evDialogFbLabel) evDialogFbLabel.textContent = this.t("dropin_fb_image_label");
    if (this.dom.btnUseFbSample) this.dom.btnUseFbSample.textContent = this.t("dropin_use_sample_btn");
    const evDialogDescLabel = document.querySelector("label[for='event-desc-input']");
    if (evDialogDescLabel) evDialogDescLabel.textContent = this.t("dropin_desc_label");
    if (this.dom.saveEventBtn) this.dom.saveEventBtn.textContent = this.t("event_save_btn");
    if (this.wizardStepsConfig) {
      this.renderWizardIndicator();
      if (this.dom.wizardPrevBtn) {
        this.dom.wizardPrevBtn.textContent = this.wizardCurrentStep === 1 ? (this.t("cancel")) : (this.t("wizard_btn_back"));
      }
      if (this.dom.wizardNextBtn) {
        this.dom.wizardNextBtn.textContent = this.t("wizard_btn_next");
      }
    }

    // Event Detail Dialog
    const evDetailTitle = document.getElementById("event-detail-title");
    if (evDetailTitle) evDetailTitle.textContent = this.t("event_detail_title");
    if (this.dom.eventDetailDaysBadge) this.dom.eventDetailDaysBadge.textContent = this.t("event_detail_single_day");
    if (this.dom.eventDetailRecurrentBadge) this.dom.eventDetailRecurrentBadge.textContent = this.t("event_detail_recurrent");
    const evDetailMetaItems = document.querySelectorAll("#event-detail-dialog .detail-meta-item span");
    if (evDetailMetaItems[0]) evDetailMetaItems[0].textContent = this.t("event_detail_meta_dt");
    if (evDetailMetaItems[1]) evDetailMetaItems[1].textContent = this.t("event_detail_meta_price");
    if (this.dom.eventDetailDeleteBtn) this.dom.eventDetailDeleteBtn.textContent = this.t("event_detail_delete_btn");
    if (this.dom.eventDetailEditBtn) this.dom.eventDetailEditBtn.textContent = this.t("event_detail_edit_btn");
    if (this.dom.closeEventDetailDoneBtn) this.dom.closeEventDetailDoneBtn.textContent = this.t("event_detail_close_btn");

    // Post Dialog
    const postPlatLabel = document.querySelector("label[for='post-platform-select']");
    if (postPlatLabel) postPlatLabel.textContent = this.t("post_platform_label");
    const postTypeLabel = document.querySelector("label[for='post-type-select']");
    if (postTypeLabel) postTypeLabel.textContent = this.t("post_type_label");
    const postSpecTitle = document.getElementById("spec-summary-title");
    if (postSpecTitle) postSpecTitle.textContent = this.t("post_spec_title");
    const postDateLabel = document.querySelector("label[for='post-date-input']");
    if (postDateLabel) postDateLabel.textContent = this.t("post_date_label");
    const postTimeLabel = document.querySelector("label[for='post-time-input']");
    if (postTimeLabel) postTimeLabel.textContent = this.t("post_time_label");
    const postTitleLabel = document.querySelector("label[for='post-title-input']");
    if (postTitleLabel) postTitleLabel.textContent = this.t("post_title_label");
    const postShareLabel = document.querySelector("label[for='post-share-link']");
    if (postShareLabel) postShareLabel.textContent = this.t("post_share_label");
    if (this.dom.btnTestShareLink) this.dom.btnTestShareLink.textContent = this.t("post_test_share_btn");
    const postDescLabel = document.querySelector("label[for='post-desc-input']");
    if (postDescLabel) postDescLabel.textContent = this.t("post_desc_label");
    const postStatusLabel = document.querySelector("label[for='post-status-select']");
    if (postStatusLabel) postStatusLabel.textContent = this.t("post_status_label");
    if (this.dom.cancelPostDialogBtn) this.dom.cancelPostDialogBtn.textContent = this.t("post_cancel_btn");
    if (this.dom.savePostBtn) this.dom.savePostBtn.textContent = this.t("post_save_btn");

    // Post Detail Dialog
    const postDetailHeading = document.getElementById("detail-dialog-title");
    if (postDetailHeading) postDetailHeading.textContent = this.t("post_detail_title");
    const postDetailMetaSpans = document.querySelectorAll("#detail-dialog .detail-meta-item span");
    if (postDetailMetaSpans[0]) postDetailMetaSpans[0].textContent = this.t("post_detail_dt");
    if (postDetailMetaSpans[1]) postDetailMetaSpans[1].textContent = this.t("post_detail_type_ratio");
    if (postDetailMetaSpans[2]) postDetailMetaSpans[2].textContent = this.t("post_detail_media_format");
    if (postDetailMetaSpans[3]) postDetailMetaSpans[3].textContent = this.t("post_detail_status");
    if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.textContent = this.t("post_detail_copy_share_btn");
    if (this.dom.btnDetailOpenShare) this.dom.btnDetailOpenShare.textContent = this.t("post_detail_open_share_btn");
    if (this.dom.detailDeleteBtn) this.dom.detailDeleteBtn.textContent = this.t("post_detail_delete_btn");
    if (this.dom.detailDuplicateBtn) this.dom.detailDuplicateBtn.textContent = this.t("post_detail_duplicate_btn");
    if (this.dom.detailEditBtn) this.dom.detailEditBtn.textContent = this.t("post_detail_edit_btn");

    // Control Panel Dialog
    const cpTitle = document.getElementById("cp-dialog-title");
    if (cpTitle) cpTitle.innerHTML = `<span>${this.t("cp_title")}</span>`;
    if (this.dom.btnCpHeaderAddPlatform) this.dom.btnCpHeaderAddPlatform.textContent = this.t("cp_add_title");
    const cpAddSummary = document.querySelector("#cp-add-platform-details summary") || document.querySelector("#control-panel-dialog details summary");
    if (cpAddSummary) cpAddSummary.textContent = this.t("cp_add_title");
    const cpNameLabel = document.querySelector("label[for='new-platform-name']");
    if (cpNameLabel) cpNameLabel.textContent = this.t("cp_platform_name");
    const cpColorLabel = document.querySelector("label[for='new-platform-color']");
    if (cpColorLabel) cpColorLabel.textContent = this.t("cp_brand_color");
    const cpDomainLabel = document.querySelector("label[for='new-platform-domain']");
    if (cpDomainLabel) cpDomainLabel.textContent = this.t("cp_domain");
    const cpDescLabel = document.querySelector("label[for='new-platform-desc']");
    if (cpDescLabel) cpDescLabel.textContent = this.t("cp_description");
    const cpAddBtn = document.querySelector("#add-platform-form button[type='submit']");
    if (cpAddBtn) cpAddBtn.textContent = this.t("cp_add_btn");
    if (this.dom.cpResetDefaultsBtn) this.dom.cpResetDefaultsBtn.textContent = this.t("cp_reset_btn");
    if (this.dom.cpExportBtn) this.dom.cpExportBtn.textContent = this.t("cp_export_btn");
    if (this.dom.cpImportBtn) this.dom.cpImportBtn.textContent = this.t("cp_import_btn");
    if (this.dom.closeCpDoneBtn) this.dom.closeCpDoneBtn.textContent = this.t("cp_done_btn");

    // Standards Matrix Dialog
    const standardsTitle = document.getElementById("standards-dialog-title");
    if (standardsTitle) standardsTitle.innerHTML = `<span>${this.t("standards_title")}</span>`;
    const standardsDesc = document.querySelector("#standards-dialog .dialog-body > p");
    if (standardsDesc) standardsDesc.textContent = this.t("standards_desc");
    const stThs = document.querySelectorAll("#standards-dialog .standards-table th");
    const stKeys = ["standards_th_platform", "standards_th_type", "standards_th_ratio", "standards_th_res", "standards_th_format", "standards_th_specs"];
    stThs.forEach((th, idx) => {
      if (stKeys[idx]) th.textContent = this.t(stKeys[idx]);
    });
    if (this.dom.closeStandardsDoneBtn) this.dom.closeStandardsDoneBtn.textContent = this.t("standards_close_btn");

    // Re-render sub-app views if requested
    if (reRenderViews) {
      if (this.activeApp === "social") {
        this.render();
      } else if (this.activeApp === "events") {
        this.renderEventsCalendar();
      } else if (this.activeApp === "admin") {
        this.renderAdminPanel();
      }
    }

    // Document title & lang attribute
    document.title = this.t("doc_title");
    document.documentElement.lang = this.currentLang;

    // Weekend watermark CSS variable
    document.documentElement.style.setProperty('--weekend-label', '"' + this.t("weekend_label") + '"');

    // Edit User Dialog
    const editUserTitle = document.querySelector("#edit-user-dialog .dialog-header h2");
    if (editUserTitle) editUserTitle.textContent = this.t("edit_user_title");
    const editUserLabels = document.querySelectorAll("#edit-user-dialog .form-label");
    if (editUserLabels[0]) editUserLabels[0].textContent = this.t("edit_user_name_label");
    if (editUserLabels[1]) editUserLabels[1].textContent = this.t("edit_user_username_label");
    if (editUserLabels[2]) editUserLabels[2].textContent = this.t("edit_user_pass_label");
    if (editUserLabels[3]) editUserLabels[3].textContent = this.t("edit_user_role_label");
    const editUserRoleOpts = document.querySelectorAll("#edit-user-role option");
    if (editUserRoleOpts[0]) editUserRoleOpts[0].textContent = this.t("edit_user_role_user");
    if (editUserRoleOpts[1]) editUserRoleOpts[1].textContent = this.t("edit_user_role_admin");
    const editUserBtns = document.querySelectorAll("#edit-user-dialog .dialog-footer button");
    if (editUserBtns[0]) editUserBtns[0].textContent = this.t("edit_user_cancel");
    if (editUserBtns[1]) editUserBtns[1].textContent = this.t("edit_user_save");
  }
};
