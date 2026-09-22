// Event listener wiring.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const bindMethods = {
  bindEvents() {
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

      // Modal Login 1-Click Demo accounts (Isolated Read-Only Previews)
      const modalDemoChip = e.target.closest(".btn-demo-chip:not(.direct-demo-chip)");
      if (modalDemoChip) {
        e.preventDefault();
        const DEMO_ACCOUNTS = {
          demo: "demo123",
          demo_admin: "demo123"
        };
        const u = modalDemoChip.dataset.user;
        if (this.dom.loginUsername) this.dom.loginUsername.value = u;
        if (this.dom.loginPassword) this.dom.loginPassword.value = DEMO_ACCOUNTS[u] || "";
        if (this.dom.loginForm) this.dom.loginForm.requestSubmit();
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

    if (this.dom.closeLoginDialogBtn) {
      this.dom.closeLoginDialogBtn.addEventListener("click", () => this.dom.loginDialog?.close());
    }
    if (this.dom.cancelLoginBtn) {
      this.dom.cancelLoginBtn.addEventListener("click", () => this.dom.loginDialog?.close());
    }
    if (this.dom.loginForm) {
      this.dom.loginForm.addEventListener("submit", (e) => this.handleLoginSubmit(e));
    }

    // =========================================================================
    // 3. SOCIAL MEDIA CALENDAR HANDLERS
    // =========================================================================
    this.dom.prevMonthBtn?.addEventListener("click", () => this.changeMonth(-1));
    this.dom.nextMonthBtn?.addEventListener("click", () => this.changeMonth(1));
    this.dom.todayBtn?.addEventListener("click", () => {
      const today = new Date();
      this.currentYear = today.getFullYear();
      this.currentMonth = today.getMonth();
      this.render();
    });

    this.dom.viewMonthBtn?.addEventListener("click", () => this.setViewMode("calendar"));
    this.dom.viewYearBtn?.addEventListener("click", () => this.setViewMode("year"));
    this.dom.viewFeedBtn?.addEventListener("click", () => this.setViewMode("feed"));

    this.dom.socialSearchInput?.addEventListener("input", (e) => {
      this.socialSearchQuery = (e.target.value || "").trim().toLowerCase();
      this.render();
    });

    this.dom.openAddPostBtn?.addEventListener("click", () => this.openAddPostModal());
    this.dom.openControlPanelBtn?.addEventListener("click", () => this.openControlPanelModal());

    this.dom.closePostDialogBtn?.addEventListener("click", () => this.dom.postDialog?.close());
    this.dom.cancelPostDialogBtn?.addEventListener("click", () => this.dom.postDialog?.close());
    this.dom.postPlatformSelect?.addEventListener("change", () => this.onPlatformSelectChanged());
    this.dom.postTypeSelect?.addEventListener("change", () => this.updateLiveSpecHelper());
    this.dom.postDescInput?.addEventListener("input", () => this.updateCaptionCounter());
    this.dom.postForm?.addEventListener("submit", (e) => this.handlePostFormSubmit(e));

    this.dom.mediaDropZone?.addEventListener("click", () => this.dom.mediaFileInput?.click());
    this.dom.mediaFileInput?.addEventListener("change", (e) => this.handleFileSelect(e));
    this.dom.applyUrlBtn?.addEventListener("click", () => this.handleUrlApply());

    if (this.dom.mediaDropZone) {
      this.dom.mediaDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        this.dom.mediaDropZone.style.borderColor = "var(--primary)";
      });
      this.dom.mediaDropZone.addEventListener("dragleave", () => {
        this.dom.mediaDropZone.style.borderColor = "";
      });
      this.dom.mediaDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.dom.mediaDropZone.style.borderColor = "";
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.processUploadedFiles(e.dataTransfer.files);
        }
      });
    }

    this.dom.closeDetailDialogBtn?.addEventListener("click", () => this.dom.detailDialog?.close());
    this.dom.detailDeleteBtn?.addEventListener("click", () => this.deleteCurrentDetailPost());
    this.dom.detailDuplicateBtn?.addEventListener("click", () => this.duplicateCurrentDetailPost());
    this.dom.detailEditBtn?.addEventListener("click", () => {
      const postId = this.currentDetailPostId;
      this.dom.detailDialog?.close();
      this.openEditPostModal(postId);
    });

    if (this.dom.btnTestShareLink) {
      this.dom.btnTestShareLink.addEventListener("click", () => {
        const val = this.dom.postShareLink ? this.dom.postShareLink.value.trim() : "";
        if (!val) {
          alert(this.t("alert_share_link_required"));
          return;
        }
        this.openShareLink(val);
      });
    }

    if (this.dom.btnDetailCopyShare) {
      this.dom.btnDetailCopyShare.addEventListener("click", () => {
        const post = this.posts.find(p => p.id === this.currentDetailPostId);
        if (post && post.shareLink) {
          this.copyToClipboard(post.shareLink, this.dom.btnDetailCopyShare);
        }
      });
    }

    if (this.dom.btnCpHeaderAddPlatform) {
      this.dom.btnCpHeaderAddPlatform.addEventListener("click", () => {
        const details = this.dom.cpAddPlatformDetails || document.getElementById("cp-add-platform-details");
        if (details) {
          details.open = !details.open;
          if (details.open) {
            const input = document.getElementById("new-platform-name");
            if (input) input.focus();
            details.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      });
    }
    this.dom.closeCpDialogBtn?.addEventListener("click", () => this.dom.controlPanelDialog?.close());
    this.dom.closeCpDoneBtn?.addEventListener("click", () => this.dom.controlPanelDialog?.close());
    this.dom.addPlatformForm?.addEventListener("submit", (e) => this.handleAddPlatform(e));
    this.dom.cpResetDefaultsBtn?.addEventListener("click", () => this.resetAllDefaults());
    this.dom.cpExportBtn?.addEventListener("click", () => this.exportData());
    this.dom.cpImportBtn?.addEventListener("click", () => this.dom.cpImportFileInput?.click());
    this.dom.cpImportFileInput?.addEventListener("change", (e) => this.importData(e));

    this.dom.closeStandardsDialogBtn?.addEventListener("click", () => this.dom.standardsDialog?.close());
    this.dom.closeStandardsDoneBtn?.addEventListener("click", () => this.dom.standardsDialog?.close());

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
          this.dom.myEventsFilterTabs.querySelectorAll(".btn-filter-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
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

    // =========================================================================
    // 5. USER EDIT & STORAGE CLEANUP DIALOGS
    // =========================================================================
    this.dom.closeEditUserBtn?.addEventListener("click", () => this.dom.editUserDialog?.close());
    this.dom.cancelEditUserBtn?.addEventListener("click", () => this.dom.editUserDialog?.close());
    this.dom.editUserForm?.addEventListener("submit", (e) => this.handleEditUserSubmit(e));

    this.dom.btnQuotaBannerCleanup?.addEventListener("click", () => this.openStorageCleanupModal());
    this.dom.btnOpenStorageCleanup?.addEventListener("click", () => this.openStorageCleanupModal());
    this.dom.closeStorageCleanupBtn?.addEventListener("click", () => this.dom.storageCleanupDialog?.close());
    this.dom.closeStorageCleanupDoneBtn?.addEventListener("click", () => this.dom.storageCleanupDialog?.close());
    this.dom.cleanupEventAgeSelect?.addEventListener("change", () => this.updateCleanupModalPreviews());
    this.dom.btnExecuteCleanupEvents?.addEventListener("click", () => this.executeCleanupPastEvents());
    this.dom.btnExecuteStripImages?.addEventListener("click", () => this.executeStripPastImages());
    this.dom.btnExecuteCleanupSocial?.addEventListener("click", () => this.executeCleanupSocialMedia());

    this.dom.btnSimNormal?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.15);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimWarning?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.84);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimCritical?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.94);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimReset?.addEventListener("click", () => {
      this.saveSimulatedStorage(null);
      this.updateStorageQuotaDisplay();
    });

    // =========================================================================
    // 6. TEAM EVENTS CALENDAR & DROP-IN SCHEDULER
    // =========================================================================
    this.dom.eventsPrevMonthBtn?.addEventListener("click", () => this.changeEventsPeriod(-1));
    this.dom.eventsNextMonthBtn?.addEventListener("click", () => this.changeEventsPeriod(1));
    this.dom.eventsTodayBtn?.addEventListener("click", () => this.jumpToEventsToday());

    this.dom.btnZoomOut?.addEventListener("click", () => this.stepZoom(-1));
    this.dom.btnZoomIn?.addEventListener("click", () => this.stepZoom(1));
    this.dom.btnZoomDaily?.addEventListener("click", () => this.setEventsZoomLevel("daily"));
    this.dom.btnZoomMonthly?.addEventListener("click", () => this.setEventsZoomLevel("monthly"));
    this.dom.btnZoomYearly?.addEventListener("click", () => this.setEventsZoomLevel("yearly"));
    this.dom.openAddEventBtn?.addEventListener("click", () => this.openAddEventModal());

    // Entry Type Switcher buttons
    this.dom.btnEntryTypeEvent?.addEventListener("click", () => this.setEventEntryType("event"));
    this.dom.btnEntryTypeLocked?.addEventListener("click", () => this.setEventEntryType("locked"));
    this.dom.btnEntryTypeRoom?.addEventListener("click", () => this.setEventEntryType("room_only"));

    // Accommodation / Sleeping Room Booking Category listeners
    this.dom.eventNeedsRoom?.addEventListener("change", (e) => this.handleToggleNeedsRoom(e.target.checked));
    this.dom.btnAddRoomBooking?.addEventListener("click", () => this.handleAddRoomBookingRow());

    this.dom.closeEventDialogBtn?.addEventListener("click", () => this.closeEventForm());
    this.dom.wizardPrevBtn?.addEventListener("click", () => this.prevWizardStep());
    this.dom.wizardNextBtn?.addEventListener("click", () => this.nextWizardStep());
    this.dom.eventForm?.addEventListener("submit", (e) => this.handleEventFormSubmit(e));
    this.dom.eventTimingModeInputs?.forEach(input => input.addEventListener("change", event => {
      this.setEventTimingMode(event.target.value);
    }));

    if (this.dom.eventDateInput) {
      this.dom.eventDateInput.addEventListener("change", (e) => {
        const val = e.target.value;
        this.updateFreeHoursBoard(val);
        this.checkEventDateConflict(val, val, this.dom.eventEditId?.value);
        this.findSmartSuggestions(val, this.dom.eventHourInput?.value, this.dom.eventDurationInput?.value, this.dom.eventEditId?.value);
      });
    }

    this.dom.eventHourInput?.addEventListener("change", () => {
      const d = this.dom.eventDateInput?.value;
      this.checkEventDateConflict(d, d, this.dom.eventEditId?.value);
      this.findSmartSuggestions(d, this.dom.eventHourInput.value, this.dom.eventDurationInput?.value, this.dom.eventEditId?.value);
    });

    this.dom.eventDurationInput?.addEventListener("input", () => {
      this.updateFreeHoursBoard(this.dom.eventDateInput?.value);
      this.checkEventDateConflict(this.dom.eventDateInput?.value, this.dom.eventDateInput?.value, this.dom.eventEditId?.value);
      this.findSmartSuggestions(this.dom.eventDateInput?.value, this.dom.eventHourInput?.value, this.dom.eventDurationInput.value, this.dom.eventEditId?.value);
    });

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.addEventListener("change", (e) => {
        if (this.dom.eventRecurrenceOptions) {
          this.dom.eventRecurrenceOptions.style.display = e.target.checked ? "block" : "none";
        }
        this.updateRecurrencePreviewHint("modal");
      });
    }
    this.dom.eventRecurrenceMonths?.addEventListener("change", () => this.updateRecurrencePreviewHint("modal"));

    if (this.dom.eventFbImageFile) {
      this.dom.eventFbImageFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => this.validateFacebookImage(evt.target.result);
          reader.readAsDataURL(file);
        }
      });
    }

    if (this.dom.eventFbImageUrl) {
      this.dom.eventFbImageUrl.addEventListener("input", () => {
        const url = this.dom.eventFbImageUrl.value.trim();
        if (url) {
          this.validateFacebookImage(url);
        } else if (!this.dom.eventFbImageData?.value) {
          this.resetFacebookValidation();
        }
      });
    }

    this.dom.btnUseFbSample?.addEventListener("click", () => {
      const sample16by9 = "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&h=675&q=80";
      if (this.dom.eventFbImageUrl) this.dom.eventFbImageUrl.value = sample16by9;
      this.validateFacebookImage(sample16by9);
    });

    this.dom.closeEventDetailBtn?.addEventListener("click", () => this.dom.eventDetailDialog?.close());
    this.dom.closeEventDetailDoneBtn?.addEventListener("click", () => this.dom.eventDetailDialog?.close());
    this.dom.eventDetailDeleteBtn?.addEventListener("click", () => this.deleteCurrentDetailEvent());
    this.dom.eventDetailEditBtn?.addEventListener("click", () => {
      const id = this.currentDetailEventId;
      this.dom.eventDetailDialog?.close();
      this.openEditEventModal(id);
    });

    this.dom.createUserForm?.addEventListener("submit", (e) => this.handleCreateUser(e));
    this.dom.createSpaceForm?.addEventListener("submit", (e) => this.handleCreateSpace(e));
    this.dom.createRoomForm?.addEventListener("submit", (e) => this.handleCreateRoom(e));

    this.dom.adminCatTabs?.forEach(tab => {
      tab.addEventListener("click", () => {
        const cat = tab.dataset.adminCat || "all";
        this.setAdminCategory(cat);
      });
    });

    this.dom.btnSocialEventNotifications?.addEventListener("click", () => this.openSocialNotificationsModal());
    this.dom.closeSocialNotificationsBtn?.addEventListener("click", () => this.dom.socialNotificationsModal?.close());
    this.dom.closeSocialNotificationsDoneBtn?.addEventListener("click", () => this.dom.socialNotificationsModal?.close());

    document.querySelectorAll(".notif-filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".notif-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.notifFilter = pill.dataset.notifFilter || "all";
        this.renderSocialNotifications();
      });
    });
  }
};
