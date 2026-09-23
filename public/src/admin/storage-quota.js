// Admin: storage usage, quota alerts and cleanup.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const storageQuotaMethods = {
  // Real usage comes from the server (events + posts, including their media files) against the cap.
  calculateStorageUsage() {
    const stats = this.storageStats || {};
    const eventsBytes = stats.eventsBytes || 0;
    const postsBytes = stats.postsBytes || 0;
    const realUsedBytes = stats.usedBytes || 0;
    const quotaBytes = stats.capBytes || 8 * 1024 ** 3;

    let usedBytes = realUsedBytes;
    if (this.simulatedStorageRatio !== null && !isNaN(this.simulatedStorageRatio)) {
      usedBytes = Math.round(quotaBytes * this.simulatedStorageRatio);
    }

    const percentUsed = Math.min(100, Math.max(0, (usedBytes / quotaBytes) * 100));
    const isWarning = percentUsed >= 80 && percentUsed < 90;
    const isCritical = percentUsed >= 90;

    return {
      realUsedBytes,
      usedBytes,
      quotaBytes,
      percentUsed,
      isWarning,
      isCritical,
      eventsBytes,
      postsBytes,
      freeBytes: Math.max(0, quotaBytes - usedBytes),
      isSimulated: this.simulatedStorageRatio !== null
    };
  },
  // Bytes of an uploaded media file on this server (0 for external links).
  mediaBytes(url) {
    return (url && this.storageStats?.files?.[url]) || 0;
  },
  updateStorageQuotaDisplay() {
    const stats = this.calculateStorageUsage();

    // Top nav bar warning badge
    if (this.dom.navAdminQuotaBadge) {
      if (stats.isCritical) {
        this.dom.navAdminQuotaBadge.style.display = "inline-flex";
        this.dom.navAdminQuotaBadge.textContent = "!";
        this.dom.navAdminQuotaBadge.title = `${this.t("notif_level_critical")}: ${stats.percentUsed.toFixed(1)}% / ${this.formatBytes(stats.quotaBytes)}`;
      } else if (stats.isWarning) {
        this.dom.navAdminQuotaBadge.style.display = "inline-flex";
        this.dom.navAdminQuotaBadge.textContent = "!";
        this.dom.navAdminQuotaBadge.title = `${this.t("notif_level_warning")}: ${stats.percentUsed.toFixed(1)}% / ${this.formatBytes(stats.quotaBytes)}`;
      } else {
        this.dom.navAdminQuotaBadge.style.display = "none";
      }
    }

    // Admin announcement banner
    if (this.dom.adminQuotaAlertBanner) {
      if (stats.isCritical || stats.isWarning) {
        this.dom.adminQuotaAlertBanner.style.display = "flex";
        this.dom.adminQuotaAlertBanner.className = `admin-quota-banner ${stats.isCritical ? 'danger' : 'warning'}`;
        if (this.dom.quotaBannerIcon) {
          this.dom.quotaBannerIcon.textContent = "!";
        }
        if (this.dom.quotaBannerTitle) {
          this.dom.quotaBannerTitle.textContent = this.t("admin_quota_alert_title") + ` (${stats.percentUsed.toFixed(1)}%)`;
        }
        if (this.dom.quotaBannerDesc) {
          this.dom.quotaBannerDesc.textContent = this.tf("admin_quota_alert_desc", { cap: this.formatBytes(stats.quotaBytes) });
        }
      } else {
        this.dom.adminQuotaAlertBanner.style.display = "none";
      }
    }

    // Admin Panel Section 4
    if (this.dom.adminStorageUsedText) {
      this.dom.adminStorageUsedText.textContent = this.formatBytes(stats.usedBytes);
    }
    if (this.dom.adminStorageTotalText) {
      this.dom.adminStorageTotalText.textContent = `${this.tf("admin_storage_used_sub", { cap: this.formatBytes(stats.quotaBytes) })}${stats.isSimulated ? ' [Sim]' : ''}`;
    }
    if (this.dom.adminQuotaLimitBadge) {
      this.dom.adminQuotaLimitBadge.textContent = this.tf("admin_storage_cap_badge", { cap: this.formatBytes(stats.quotaBytes) });
    }
    if (this.dom.adminStoragePctBadge) {
      this.dom.adminStoragePctBadge.textContent = `${stats.percentUsed.toFixed(1)}%`;
      this.dom.adminStoragePctBadge.className = `storage-pct-badge ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }
    if (this.dom.adminStorageMeterFill) {
      this.dom.adminStorageMeterFill.style.width = `${stats.percentUsed}%`;
      this.dom.adminStorageMeterFill.className = `storage-meter-fill ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }
    if (this.dom.storageEventsSize) {
      this.dom.storageEventsSize.textContent = this.formatBytes(stats.eventsBytes);
    }
    if (this.dom.storageEventsCount) {
      this.dom.storageEventsCount.textContent = `(${this.tn("count_events", this.events.length)})`;
    }
    if (this.dom.storagePostsSize) {
      this.dom.storagePostsSize.textContent = this.formatBytes(stats.postsBytes);
    }
    if (this.dom.storagePostsCount) {
      this.dom.storagePostsCount.textContent = `(${this.tn("count_posts", this.posts.length)})`;
    }
    if (this.dom.storageFreeSize) {
      this.dom.storageFreeSize.textContent = this.formatBytes(stats.freeBytes);
    }
    if (this.dom.storageStatusSub) {
      this.dom.storageStatusSub.textContent = stats.isCritical ? this.t("notif_level_critical") : (stats.isWarning ? this.t("notif_level_warning") : this.t("admin_status_healthy"));
      this.dom.storageStatusSub.dataset.tone = stats.isCritical ? "danger" : (stats.isWarning ? "warning" : "success");
    }
  },
  getPastEvents(daysThreshold = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.events.filter(e => {
      const eventDateStr = e.endDate;
      if (!eventDateStr) return false;
      const [y, m, d] = eventDateStr.split("-").map(Number);
      const eventDate = new Date(y, m - 1, d);

      if (daysThreshold === null) {
        return eventDate < today;
      }
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysThreshold);
      cutoff.setHours(0, 0, 0, 0);
      return eventDate < cutoff;
    });
  },
  openStorageCleanupModal() {
    this.updateCleanupModalPreviews();
    if (this.dom.storageCleanupDialog) {
      this.dom.storageCleanupDialog.showModal();
    }
  },
  updateCleanupModalPreviews() {
    const stats = this.calculateStorageUsage();
    if (this.dom.cleanupModalUsageLabel) {
      this.dom.cleanupModalUsageLabel.textContent = `${this.formatBytes(stats.usedBytes)} / ${this.formatBytes(stats.quotaBytes)} (${stats.percentUsed.toFixed(1)}%)`;
    }
    if (this.dom.cleanupModalMeterFill) {
      this.dom.cleanupModalMeterFill.style.width = `${stats.percentUsed}%`;
      this.dom.cleanupModalMeterFill.className = `storage-meter-fill ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }

    // Filter preview for Past Events
    const filterVal = this.dom.cleanupEventAgeSelect ? this.dom.cleanupEventAgeSelect.value : "all-past";
    const days = filterVal === "all-past" ? null : parseInt(filterVal, 10);
    const pastEvents = this.getPastEvents(days);

    let estimatedBytes = 0;
    pastEvents.forEach(e => {
      estimatedBytes += JSON.stringify(e).length + this.mediaBytes(e.facebookImage);
    });

    if (this.dom.cleanupPreviewEvents) {
      this.dom.cleanupPreviewEvents.textContent = this.tf("cleanup_preview_events", { count: pastEvents.length, size: this.formatBytes(estimatedBytes) });
    }

    // Strip images preview
    const pastEventsWithImage = this.getPastEvents(null).filter(e => !!e.facebookImage);
    let stripBytes = 0;
    pastEventsWithImage.forEach(e => {
      stripBytes += this.mediaBytes(e.facebookImage);
    });

    if (this.dom.cleanupStripPreview) {
      this.dom.cleanupStripPreview.textContent = this.tf("cleanup_preview_strip", { count: pastEventsWithImage.length, size: this.formatBytes(stripBytes) });
    }

    // Social media purge preview
    const todayStr = new Date().toISOString().slice(0, 10);
    const oldPublishedPosts = this.posts.filter(p => p.status === "published" && p.date < todayStr && p.mediaUrl);
    if (this.dom.cleanupSocialPreview) {
      this.dom.cleanupSocialPreview.textContent = this.tf("cleanup_preview_social", { count: oldPublishedPosts.length });
    }
  },
  async executeCleanupPastEvents() {
    const filterVal = this.dom.cleanupEventAgeSelect ? this.dom.cleanupEventAgeSelect.value : "all-past";
    const days = filterVal === "all-past" ? null : parseInt(filterVal, 10);
    const toDelete = this.getPastEvents(days);

    if (toDelete.length === 0) {
      this.notify(this.t("alert_no_past_events"), "warning");
      return;
    }

    const desc = filterVal === "all-past" ? this.t("cleanup_desc_all_past") : this.tf("cleanup_desc_older_than", { days });
    if (!await this.confirmDialog(this.t("confirm_cleanup_delete").replace("${count}", toDelete.length).replace("${desc}", desc))) {
      return;
    }

    const idsToDelete = new Set(toDelete.map(e => e.id));
    this.events = this.events.filter(e => !idsToDelete.has(e.id));
    this.saveEvents();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.renderAdminPanel();
    this.renderEventsCalendar();
    this.updateSocialNotificationBadge();

    this.notify(this.t("alert_events_deleted").replace("${count}", toDelete.length), "success");
  },
  async executeStripPastImages() {
    const pastEventsWithImage = this.getPastEvents(null).filter(e => !!e.facebookImage);
    if (pastEventsWithImage.length === 0) {
      this.notify(this.t("alert_no_images_strip"), "warning");
      return;
    }

    if (!await this.confirmDialog(this.t("confirm_cleanup_strip").replace("${count}", pastEventsWithImage.length))) {
      return;
    }

    pastEventsWithImage.forEach(e => {
      e.facebookImage = null;
    });
    this.saveEvents();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.renderAdminPanel();
    this.renderEventsCalendar();

    this.notify(this.t("alert_images_stripped").replace("${count}", pastEventsWithImage.length), "success");
  },
  async executeCleanupSocialMedia() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const oldPublishedPosts = this.posts.filter(p => p.status === "published" && p.date < todayStr && p.mediaUrl);
    if (oldPublishedPosts.length === 0) {
      this.notify(this.t("alert_no_media_purge"), "warning");
      return;
    }

    if (!await this.confirmDialog(this.t("confirm_cleanup_purge").replace("${count}", oldPublishedPosts.length))) {
      return;
    }

    oldPublishedPosts.forEach(p => {
      p.mediaUrl = null;
    });
    this.savePosts();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.render();

    this.notify(this.t("alert_media_purged").replace("${count}", oldPublishedPosts.length), "success");
  }
};
