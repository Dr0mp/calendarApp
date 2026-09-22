// Social calendar: platform filter, month/year/feed views.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { MONTH_NAMES } from "../data/i18n.js";

export const socialCalendarMethods = {
  // Social calendar toolbar, filters, post dialogs and control panel.
  bindSocialCalendar() {
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
        this.dom.mediaDropZone.classList.add("is-dragover");
      });
      this.dom.mediaDropZone.addEventListener("dragleave", () => {
        this.dom.mediaDropZone.classList.remove("is-dragover");
      });
      this.dom.mediaDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.dom.mediaDropZone.classList.remove("is-dragover");
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
          this.notify(this.t("alert_share_link_required"), "danger");
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
  },
  // Helpers
  getPlatform(id) {
    return this.platforms.find(p => p.id === id);
  },
  getPlatformIcon(platform) {
    if (!platform) return "assets/icons/default.png";
    if (platform.iconUrl) return platform.iconUrl;
    if (platform.domain) return `https://www.google.com/s2/favicons?domain=${platform.domain}&sz=64`;
    return `assets/icons/${platform.id}.png`;
  },
  getPostType(platformId, postTypeId) {
    const platform = this.getPlatform(platformId);
    if (!platform) return null;
    return platform.postTypes.find(pt => pt.id === postTypeId) || platform.postTypes[0];
  },
  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  },
  setViewMode(mode) {
    this.viewMode = ["calendar", "year", "feed"].includes(mode) ? mode : "year";
    this.syncSocialViewMode();
    this.savePrefs();
    this.render();
  },
  syncSocialViewMode() {
    const mode = ["calendar", "year", "feed"].includes(this.viewMode) ? this.viewMode : "year";
    this.viewMode = mode;
    this.dom.viewYearBtn?.classList.toggle("is-active", mode === "year");
    this.dom.viewMonthBtn.classList.toggle("is-active", mode === "calendar");
    this.dom.viewFeedBtn.classList.toggle("is-active", mode === "feed");
    this.dom.calendarView.style.display = mode === "calendar" ? "flex" : "none";
    this.dom.feedView.style.display = mode === "feed" ? "flex" : "none";
    if (this.dom.socialYearView) this.dom.socialYearView.style.display = mode === "year" ? "block" : "none";
  },
  // Filter posts based on month, year, platform, and "Show Only What We Have"
  getFilteredPosts() {
    return this.posts.filter(post => {
      if (!post.date) return false;
      const [year, month] = post.date.split("-").map(Number);
      const isCurrentMonth = year === this.currentYear && month === (this.currentMonth + 1);
      if (!isCurrentMonth) return false;

      // Platform enabled check: hide posts for disabled platforms
      const platform = this.getPlatform(post.platformId);
      if (platform && platform.enabled === false) return false;

      if (this.selectedPlatformId !== "all" && post.platformId !== this.selectedPlatformId) {
        return false;
      }

      // Search query filter (matches title, copy/caption, format/type, or platform name)
      if (this.socialSearchQuery) {
        const q = this.socialSearchQuery;
        const postTitle = (post.title || "").toLowerCase();
        const postCopy = (post.copy || post.caption || post.content || "").toLowerCase();
        const postType = (post.postType || "").toLowerCase();
        const platName = (platform ? platform.name : "").toLowerCase();
        const matchesQuery = postTitle.includes(q) || postCopy.includes(q) || postType.includes(q) || platName.includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  },
  // Main Render Routine
  render() {
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;

    const currentMonthTitle = `${monthNames[this.currentMonth]} ${this.currentYear}`;
    this.dom.currentMonthLabel.textContent = currentMonthTitle;
    this.dom.bannerMonthName.textContent = currentMonthTitle;

    // Render Platform Filter Bar (resets selectedPlatformId to 'all' if active platform was disabled)
    this.renderPlatformFilterBar();

    // Render Status Banner stats
    const filteredPosts = this.getFilteredPosts();
    const activePlatform = this.getPlatform(this.selectedPlatformId);
    const activePlatformName = (this.selectedPlatformId === "all" || !activePlatform || activePlatform.enabled === false)
      ? this.t("social_all_platforms")
      : activePlatform.name;
    this.dom.bannerActivePlatform.textContent = activePlatformName;
    this.dom.bannerPostCount.textContent = filteredPosts.length;

    // Render Active View
    if (this.viewMode === "calendar") {
      this.renderCalendarGrid(filteredPosts);
    } else if (this.viewMode === "feed") {
      this.renderFeedView(filteredPosts);
    } else {
      this.renderSocialYearView();
    }

    // Refresh Social Notification Badge
    this.updateSocialNotificationBadge();
  },
  // Platform Filter Bar with Live Counters & "Show only what we have"
  renderPlatformFilterBar() {
    if (!this.dom.platformFilterBar) return;
    this.dom.platformFilterBar.innerHTML = "";

    // If currently selected platform is disabled, reset to "all"
    if (this.selectedPlatformId !== "all") {
      const currentSelected = this.getPlatform(this.selectedPlatformId);
      if (!currentSelected || currentSelected.enabled === false) {
        this.selectedPlatformId = "all";
        this.savePrefs();
      }
    }

    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);

    // Count posts in current month per platform (only for enabled platforms)
    const platformPostCounts = {};
    let totalMonthPosts = 0;

    enabledPlatforms.forEach(p => { platformPostCounts[p.id] = 0; });

    this.posts.forEach(post => {
      if (!post.date) return;
      const [year, month] = post.date.split("-").map(Number);
      if (year === this.currentYear && month === (this.currentMonth + 1)) {
        if (platformPostCounts[post.platformId] !== undefined) {
          totalMonthPosts++;
          platformPostCounts[post.platformId]++;
        }
      }
    });

    // "All Platforms" Tab
    const allTab = document.createElement("button");
    allTab.type = "button";
    allTab.className = `btn-filter-tab ${this.selectedPlatformId === "all" ? "is-active" : ""}`;
    allTab.innerHTML = `
      <span>${this.t("social_all_platforms")}</span>
      <span class="filter-tab-badge">${totalMonthPosts}</span>
    `;
    allTab.addEventListener("click", () => {
      this.selectedPlatformId = "all";
      this.savePrefs();
      this.render();
    });
    this.dom.platformFilterBar.appendChild(allTab);

    // Platform Filter Tabs (Enabled platforms only)
    enabledPlatforms.forEach(platform => {
      const count = platformPostCounts[platform.id] || 0;

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `btn-filter-tab ${this.selectedPlatformId === platform.id ? "is-active" : ""}`;
      tab.dataset.platform = platform.id;
      const iconSrc = this.getPlatformIcon(platform);
      tab.innerHTML = `
        <img class="platform-favicon" src="${iconSrc}" alt="${platform.name}" data-fallback="dot">
        <span class="platform-dot" style="background: ${platform.color}; display: none;"></span>
        <span>${platform.name}</span>
        <span class="filter-tab-badge">${count}</span>
      `;
      tab.addEventListener("click", () => {
        this.selectedPlatformId = platform.id;
        this.savePrefs();
        this.render();
      });
      this.dom.platformFilterBar.appendChild(tab);
    });
  },
  // Calendar Grid Renderer
  renderCalendarGrid(filteredPosts) {
    this.dom.calendarDaysGrid.innerHTML = "";

    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday start: 0 = Mon, 6 = Sun
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    // Previous month overflow days
    const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

    const today = new Date();
    const isThisCurrentRealMonth = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth;
    const realTodayDate = today.getDate();

    // Group posts by date
    const postsByDate = {};
    filteredPosts.forEach(post => {
      if (!postsByDate[post.date]) postsByDate[post.date] = [];
      postsByDate[post.date].push(post);
    });

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-day-cell";

      let dayNumber;
      let cellDateString = "";
      let isCurrentMonthCell = true;

      if (i < startDayOfWeek) {
        // Prev month day
        dayNumber = prevMonthLastDay - (startDayOfWeek - 1 - i);
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const prevMonth = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
        const prevYear = this.currentMonth === 0 ? this.currentYear - 1 : this.currentYear;
        cellDateString = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else if (i >= startDayOfWeek + daysInMonth) {
        // Next month day
        dayNumber = i - (startDayOfWeek + daysInMonth) + 1;
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const nextMonth = this.currentMonth === 11 ? 0 : this.currentMonth + 1;
        const nextYear = this.currentMonth === 11 ? this.currentYear + 1 : this.currentYear;
        cellDateString = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else {
        // Current month day
        dayNumber = i - startDayOfWeek + 1;
        cellDateString = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
        if (isThisCurrentRealMonth && dayNumber === realTodayDate) {
          cell.classList.add("is-today");
        }
      }

      const isPast = this.isPastEventDate(cellDateString);
      if (isPast) cell.classList.add("is-past");
      if (isPast && isCurrentMonthCell) {
        cell.classList.add("has-past-schedule-message");
        cell.dataset.pastScheduleMessage = this.t("post_past_create_unavailable");
      }

      const dayPosts = postsByDate[cellDateString] || [];

      // Day Header
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.innerHTML = `
        <span class="day-number">${dayNumber}</span>
        ${isCurrentMonthCell && !isPast ? `<button class="btn-add-day" title="${this.t("post_schedule_on_date")}" data-date="${cellDateString}">+</button>` : ""}
        ${isPast && isCurrentMonthCell ? `<span class="past-schedule-message" aria-live="polite">${this.t("post_past_create_unavailable")}</span>` : ""}
      `;

      cell.appendChild(dayHeader);

      // Add Post click on cell header '+'
      const addBtn = dayHeader.querySelector(".btn-add-day");
      if (addBtn) {
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddPostModal(cellDateString);
        });
      }

      // Posts Container for this day
      const postsContainer = document.createElement("div");
      postsContainer.className = "day-posts-container";

      dayPosts.forEach(post => {
        const platform = this.getPlatform(post.platformId);
        const iconSrc = this.getPlatformIcon(platform);
        const postCard = document.createElement("div");
        postCard.className = "post-card-pill";
        postCard.style.borderLeftColor = platform ? platform.color : "var(--primary)";

        const mediaIcon = post.mediaType === "video" ? this.t("media_video") : (post.mediaCount > 1 ? this.tf("media_gallery", { count: post.mediaCount }) : this.t("media_photo"));

        postCard.innerHTML = `
          <div class="post-card-pill-header">
            <span class="post-card-platform-badge" style="color: ${platform ? platform.color : 'inherit'}">
              <img class="platform-favicon-sm" src="${iconSrc}" alt="" data-fallback="hide">
              ${platform ? platform.name : post.platformId}
            </span>
            <span class="post-card-time">${post.time || "12:00"}</span>
          </div>
          <div class="post-card-title">${this.escapeHtml(post.title || post.description || this.t("post_untitled"))}</div>
          <div class="post-card-footer">
            <span class="media-tag">${mediaIcon}</span>
            ${post.shareLink ? `<button type="button" class="share-pill-btn btn-quick-copy-share" data-link="${this.escapeHtml(post.shareLink)}" title="${this.t("copy_link_title")}: ${this.escapeHtml(post.shareLink)}">${this.t("post_detail_copy_share_btn")}</button>` : `<span class="aspect-tag">${post.aspectRatio || "9:16"}</span>`}
          </div>
        `;

        postCard.addEventListener("click", () => {
          this.openPostDetailModal(post.id);
        });

        postsContainer.appendChild(postCard);
      });

      cell.appendChild(postsContainer);
      this.dom.calendarDaysGrid.appendChild(cell);
    }
  },
  renderSocialYearView() {
    if (!this.dom.socialYearMonthsGrid) return;
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const weekdaysMin = this.currentLang === "ro" ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];
    const todayStr = this.getTodayDateString();
    const today = new Date();
    this.dom.socialYearMonthsGrid.innerHTML = "";

    for (let month = 0; month < 12; month++) {
      const monthPosts = this.posts.filter(post => {
        if (!post.date) return false;
        const [year, postMonth] = post.date.split("-").map(Number);
        const platform = this.getPlatform(post.platformId);
        return year === this.currentYear
          && postMonth === month + 1
          && platform?.enabled !== false
          && (this.selectedPlatformId === "all" || post.platformId === this.selectedPlatformId);
      });
      const card = document.createElement("div");
      const isPastMonth = this.currentYear < today.getFullYear()
        || (this.currentYear === today.getFullYear() && month < today.getMonth());
      card.className = `yearly-month-card ${month === this.currentMonth ? "current-month-card" : ""} ${isPastMonth ? "is-past-month" : ""}`;
      const countBadge = monthPosts.length > 0
        ? `<span class="yearly-month-events-badge has-events">${monthPosts.length} ${this.t(monthPosts.length === 1 ? "social_year_posts_singular" : "social_year_posts_plural")}</span>`
        : `<span class="yearly-month-events-badge">0 ${this.t("social_year_posts_plural")}</span>`;
      card.innerHTML = `
        <div class="yearly-month-header">
          <div class="yearly-month-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg> ${monthNames[month]}</div>
          ${countBadge}
        </div>
        <div class="yearly-mini-calendar">
          ${this.renderMiniWeekdayRow(weekdaysMin)}
        </div>
      `;

      const miniCal = card.querySelector(".yearly-mini-calendar");
      const firstDay = new Date(this.currentYear, month, 1);
      const daysInMonth = new Date(this.currentYear, month + 1, 0).getDate();
      let startDayOfWeek = firstDay.getDay() - 1;
      if (startDayOfWeek < 0) startDayOfWeek = 6;

      for (let pad = 0; pad < startDayOfWeek; pad++) {
        const padCell = document.createElement("div");
        padCell.className = "yearly-mini-day other-month";
        miniCal.appendChild(padCell);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const datePosts = monthPosts.filter(post => post.date === dateStr);
        const dayCell = document.createElement("div");
        dayCell.className = "yearly-mini-day";
        dayCell.textContent = day;
        dayCell.tabIndex = 0;
        dayCell.setAttribute("role", "button");
        dayCell.setAttribute("aria-label", `${dateStr}${datePosts.length ? `, ${this.tn("count_posts", datePosts.length)}` : ""}`);

        if (dateStr < todayStr) dayCell.classList.add("is-past");
        if (dateStr === todayStr) dayCell.classList.add("is-today");
        if (datePosts.length) {
          dayCell.classList.add("has-event-circle");
          dayCell.title = datePosts.map(post => `• ${post.title} (${post.time || "09:00"})`).join("\n");
        }
        const openMonth = event => {
          event.stopPropagation();
          this.currentMonth = month;
          this.setViewMode("calendar");
        };
        dayCell.addEventListener("click", openMonth);
        dayCell.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") openMonth(event);
        });
        miniCal.appendChild(dayCell);
      }

      card.addEventListener("click", () => {
        this.currentMonth = month;
        this.setViewMode("calendar");
      });
      this.dom.socialYearMonthsGrid.appendChild(card);
    }
  },
  // Chronological Feed List View (Show only scheduled items cleanly)
  renderFeedView(filteredPosts) {
    this.dom.feedView.innerHTML = "";

    if (filteredPosts.length === 0) {
      this.dom.feedView.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" aria-hidden="true"></div>
          <h3>${this.t("feed_empty_title")}</h3>
          <p>${this.t("feed_empty_desc")}</p>
          <button class="btn btn-primary btn-sm" id="empty-add-btn">+ ${this.t("post_dialog_new_title")}</button>
        </div>
      `;
      const btn = document.getElementById("empty-add-btn");
      if (btn) btn.addEventListener("click", () => this.openAddPostModal());
      return;
    }

    // Sort chronologically by date and time
    const sorted = [...filteredPosts].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || "00:00"}`);
      const dateB = new Date(`${b.date}T${b.time || "00:00"}`);
      return dateA - dateB;
    });

    // Group by date
    const grouped = {};
    sorted.forEach(post => {
      if (!grouped[post.date]) grouped[post.date] = [];
      grouped[post.date].push(post);
    });

    Object.keys(grouped).forEach(dateStr => {
      const datePosts = grouped[dateStr];
      const dateObj = new Date(dateStr + "T00:00:00");
      const dateFormatted = dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

      const dayGroup = document.createElement("div");
      dayGroup.className = "feed-day-group";

      dayGroup.innerHTML = `
        <div class="feed-day-header">
          <div class="feed-day-title">
            <span class="day-date-tag">${dateFormatted}</span>
            <span class="u-text-2xs u-fw-500 u-color-muted">(${datePosts.length} ${datePosts.length === 1 ? 'post' : 'posts'})</span>
          </div>
          <button class="btn btn-secondary btn-sm btn-feed-add" data-date="${dateStr}">+ Add Post</button>
        </div>
        <div class="feed-posts-grid"></div>
      `;

      dayGroup.querySelector(".btn-feed-add").addEventListener("click", () => {
        this.openAddPostModal(dateStr);
      });

      const grid = dayGroup.querySelector(".feed-posts-grid");

      datePosts.forEach(post => {
        const platform = this.getPlatform(post.platformId);
        const postType = this.getPostType(post.platformId, post.postTypeId);

        const card = document.createElement("div");
        card.className = "feed-post-card";

        const mediaIcon = post.mediaType === "video" ? this.t("media_video") : (post.mediaCount > 1 ? this.tf("media_gallery", { count: post.mediaCount }) : this.t("media_photo"));

        const iconSrc = this.getPlatformIcon(platform);
        const fallbackImg = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";

        card.innerHTML = `
          <div class="feed-post-media-preview">
            <img src="${post.mediaUrl || fallbackImg}" alt="" loading="lazy">
            <span class="feed-media-badge">${mediaIcon}</span>
            <span class="feed-aspect-badge">${post.aspectRatio || "9:16"}</span>
          </div>
          <div class="feed-post-content">
            <div class="feed-post-platform-row">
              <span class="feed-platform-tag" style="color: ${platform ? platform.color : 'inherit'}">
                <img class="platform-favicon" src="${iconSrc}" alt="" data-fallback="hide">
                ${platform ? platform.name : post.platformId}
              </span>
              <span class="u-text-2xs u-color-muted">${post.time || "12:00"}</span>
            </div>
            <h4 class="feed-post-title">${this.escapeHtml(post.title || this.t("post_untitled"))}</h4>
            ${post.description ? `<p class="feed-post-desc">${this.escapeHtml(post.description)}</p>` : ""}
            <div class="feed-post-footer">
              <span>${this.t("post_standard_label")}: <strong>${postType ? postType.recommendedWidth + "x" + postType.recommendedHeight : "—"}</strong></span>
              <span style="text-transform: capitalize; color: ${post.status === 'published' ? '#10b981' : '#60a5fa'}; font-weight: 600;">
                ● ${this.t(`post_status_${post.status || "scheduled"}`)}
              </span>
            </div>
            ${post.shareLink ? `
              <div class="feed-share-row">
                <span class="u-text-2xs u-color-sky u-fw-700 u-inline-flex u-items-center u-gap-5">
                  ${this.t("post_share_link_label")}: <span class="u-color-primary u-font-mono u-text-2xs u-maxw-260 u-overflow-hidden u-truncate-ellipsis u-nowrap">${this.escapeHtml(post.shareLink)}</span>
                </span>
                <div class="u-inline-flex u-gap-6">
                  <button type="button" class="btn btn-secondary btn-sm btn-feed-copy-share u-text-2xs u-pt-3 u-pr-8 u-pb-3 u-pl-8 u-fw-700" data-link="${this.escapeHtml(post.shareLink)}">${this.t("post_detail_copy_share_btn")}</button>
                  <a href="${post.shareLink.startsWith('http') ? this.escapeHtml(post.shareLink) : '#'}" target="_blank" class="btn btn-primary btn-sm btn-feed-open-share u-text-2xs u-pt-3 u-pr-8 u-pb-3 u-pl-8 u-decoration-none u-fw-700" data-link="${this.escapeHtml(post.shareLink)}">${this.t("post_open_share_btn")} <svg class="ui-icon u-w-11 u-h-11 u-valign-middle"><use href="#icon-external-link"></use></svg></a>
                </div>
              </div>
            ` : ""}
          </div>
        `;

        card.addEventListener("click", () => {
          this.openPostDetailModal(post.id);
        });

        grid.appendChild(card);
      });

      this.dom.feedView.appendChild(dayGroup);
    });
  }
};
