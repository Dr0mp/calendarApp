// Events calendar: navigation, zoom levels, daily/monthly/yearly rendering.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { MONTH_NAMES, SHORT_MONTH_NAMES } from "../data/i18n.js";

export const eventViewMethods = {
  // Events calendar, scheduling wizard and notifications.
  bindEventsCalendar() {
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
        document.querySelectorAll(".notif-filter-pill").forEach(p => p.classList.remove("is-active"));
        pill.classList.add("is-active");
        this.notifFilter = pill.dataset.notifFilter || "all";
        this.renderSocialNotifications();
      });
    });
  },
  // =========================================================================
  // TEAM EVENTS CALENDAR LOGIC (3-Level Zoom & Navigation)
  // =========================================================================
  changeEventsPeriod(delta) {
    if (this.eventsZoomLevel === "daily") {
      // Shift active week by 7 days
      const [y, m, d] = (this.eventsActiveDate || this.getTodayDateString()).split("-").map(Number);
      const curr = new Date(y, m - 1, d);
      curr.setDate(curr.getDate() + (delta * 7));
      const ny = curr.getFullYear();
      const nm = String(curr.getMonth() + 1).padStart(2, "0");
      const nd = String(curr.getDate()).padStart(2, "0");
      this.eventsActiveDate = `${ny}-${nm}-${nd}`;
      this.eventsCurrentYear = curr.getFullYear();
      this.eventsCurrentMonth = curr.getMonth();
    } else if (this.eventsZoomLevel === "yearly") {
      // Shift by 1 year
      this.eventsCurrentYear += delta;
    } else {
      // Monthly mode: shift by 1 month
      this.eventsCurrentMonth += delta;
      if (this.eventsCurrentMonth < 0) {
        this.eventsCurrentMonth = 11;
        this.eventsCurrentYear--;
      } else if (this.eventsCurrentMonth > 11) {
        this.eventsCurrentMonth = 0;
        this.eventsCurrentYear++;
      }
      this.eventsActiveDate = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-15`;
    }
    this.renderEventsCalendar();
  },
  jumpToEventsToday() {
    const today = new Date();
    this.eventsCurrentYear = today.getFullYear();
    this.eventsCurrentMonth = today.getMonth();
    this.eventsActiveDate = this.getTodayDateString();
    this.renderEventsCalendar();
  },
  stepZoom(delta) {
    // Zoom in (delta = +1): yearly -> monthly -> daily
    // Zoom out (delta = -1): daily -> monthly -> yearly
    const levels = ["yearly", "monthly", "daily"];
    const currentIdx = levels.indexOf(this.eventsZoomLevel);
    const newIdx = Math.max(0, Math.min(2, (currentIdx === -1 ? 1 : currentIdx) + delta));
    this.setEventsZoomLevel(levels[newIdx]);
  },
  setEventsZoomLevel(level, anchorDate = null) {
    if (!["daily", "monthly", "yearly"].includes(level)) level = "yearly";
    this.eventsZoomLevel = level;
    this.savePrefs();

    if (anchorDate) {
      this.eventsActiveDate = anchorDate;
      const [y, m] = anchorDate.split("-").map(Number);
      if (y && m) {
        this.eventsCurrentYear = y;
        this.eventsCurrentMonth = m - 1;
      }
    }

    // Toggle button active states
    if (this.dom.btnZoomDaily) this.dom.btnZoomDaily.classList.toggle("is-active", level === "daily");
    if (this.dom.btnZoomMonthly) this.dom.btnZoomMonthly.classList.toggle("is-active", level === "monthly");
    if (this.dom.btnZoomYearly) this.dom.btnZoomYearly.classList.toggle("is-active", level === "yearly");

    // Toggle view containers
    if (this.dom.eventsDailyView) this.dom.eventsDailyView.style.display = level === "daily" ? "flex" : "none";
    if (this.dom.eventsGridView) this.dom.eventsGridView.style.display = level === "monthly" ? "flex" : "none";
    if (this.dom.eventsYearlyView) this.dom.eventsYearlyView.style.display = level === "yearly" ? "block" : "none";

    this.renderEventsCalendar();
  },
  toggleOffHours() {
    this.eventsOffHoursExpanded = !this.eventsOffHoursExpanded;
    this.renderEventsCalendar();
  },
  setEventsLayoutMode(mode) {
    if (mode === "schedule") {
      this.eventsLayoutMode = "schedule";
    } else if (mode === "my-events") {
      this.eventsLayoutMode = "my-events";
    } else {
      this.eventsLayoutMode = "panel";
    }
    this.savePrefs();

    const isCalendar = this.eventsLayoutMode === "panel";
    const isSchedule = this.eventsLayoutMode === "schedule";
    const isMyEvents = this.eventsLayoutMode === "my-events";

    if (this.dom.eventsHeaderBar) {
      this.dom.eventsHeaderBar.style.display = isCalendar ? "" : "none";
    }
    if (this.dom.eventsSimpleDropinView) {
      this.dom.eventsSimpleDropinView.style.display = isCalendar ? "none" : "block";
    }
    if (this.dom.schedulePageShell) {
      this.dom.schedulePageShell.style.display = isSchedule ? "block" : "none";
    }
    if (this.dom.myEventsPageShell) {
      this.dom.myEventsPageShell.style.display = isMyEvents ? "block" : "none";
    }
    if (this.dom.eventsAdvancedPanelView) {
      this.dom.eventsAdvancedPanelView.style.display = isCalendar ? "block" : "none";
    }
    if (this.dom.eventsZoomControl) {
      this.dom.eventsZoomControl.style.display = isCalendar ? "inline-flex" : "none";
    }

    if (this.dom.navEventsBtn) {
      const isCalendarTab = this.activeApp === "events" && isCalendar;
      this.dom.navEventsBtn.classList.toggle("is-active", isCalendarTab);
      this.dom.navEventsBtn.setAttribute("aria-selected", isCalendarTab ? "true" : "false");
    }
    if (this.dom.navScheduleBtn) {
      const isScheduleTab = this.activeApp === "events" && isSchedule;
      this.dom.navScheduleBtn.classList.toggle("is-active", isScheduleTab);
      this.dom.navScheduleBtn.setAttribute("aria-selected", isScheduleTab ? "true" : "false");
    }
    if (this.dom.navMyEventsBtn) {
      const isMyEventsTab = this.activeApp === "events" && isMyEvents;
      this.dom.navMyEventsBtn.classList.toggle("is-active", isMyEventsTab);
      this.dom.navMyEventsBtn.setAttribute("aria-selected", isMyEventsTab ? "true" : "false");
    }

    // Toggle openAddEventBtn label and visual style
    if (this.dom.openAddEventBtn) {
      this.dom.openAddEventBtn.title = this.t("events_schedule_btn");
    }

    this.updateMyEventsBadgeCount();

    if (isSchedule) {
      this.mountEventForm("page");
    } else if (isMyEvents) {
      this.mountEventForm("dialog");
      this.renderMyEventsPage();
    } else {
      this.mountEventForm("dialog");
      this.setEventsZoomLevel(this.eventsZoomLevel || "yearly");
    }
  },
  renderEventsCalendar() {
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const shortMonthNames = SHORT_MONTH_NAMES[this.currentLang] || SHORT_MONTH_NAMES.ro;

    // Adapt Header and Banner titles according to active Zoom level
    if (this.eventsZoomLevel === "daily") {
      const weekDays = this.getWeekDays(this.eventsActiveDate);
      const startD = weekDays[0].dateObj;
      const endD = weekDays[6].dateObj;
      const startM = `${shortMonthNames[startD.getMonth()]} ${startD.getDate()}`;
      const endM = `${shortMonthNames[endD.getMonth()]} ${endD.getDate()}, ${endD.getFullYear()}`;
      const rangeTitle = `${startM} – ${endM}`;
      this.dom.eventsCurrentMonthLabel.textContent = rangeTitle;
    } else if (this.eventsZoomLevel === "yearly") {
      const yearTitle = `${this.t("yearly_overview_title")} ${this.eventsCurrentYear}`;
      this.dom.eventsCurrentMonthLabel.textContent = yearTitle;
    } else {
      const monthTitle = `${monthNames[this.eventsCurrentMonth]} ${this.eventsCurrentYear}`;
      this.dom.eventsCurrentMonthLabel.textContent = monthTitle;
    }

    // Render user filter bar
    this.renderEventsUserFilterBar();

    const filtered = this.getFilteredEvents();

    // Render view corresponding to active Zoom Level
    if (this.eventsZoomLevel === "daily") {
      this.renderEventsDailyTimeline(filtered);
    } else if (this.eventsZoomLevel === "yearly") {
      this.renderEventsYearlyView(filtered);
    } else {
      this.renderEventsGrid(filtered);
    }

    // Always keep my-events badge & notification badges up to date
    this.updateMyEventsBadgeCount();
    this.updateSocialNotificationBadge();
  },
  renderEventsUserFilterBar() {
    if (!this.dom.eventsUserFilterBar) return;
    this.dom.eventsUserFilterBar.innerHTML = "";

    // Calculate count per user for current time frame
    const userCounts = { all: 0 };
    this.events.forEach(evt => {
      const start = evt.startDate;
      const end = evt.endDate;
      if (!start) return;

      let isInRange = false;
      if (this.eventsZoomLevel === "yearly") {
        const [sy] = start.split("-").map(Number);
        const [ey] = (end || start).split("-").map(Number);
        isInRange = sy <= this.eventsCurrentYear && ey >= this.eventsCurrentYear;
      } else if (this.eventsZoomLevel === "daily") {
        const weekDays = this.getWeekDays(this.eventsActiveDate);
        const weekStart = weekDays[0].dateStr;
        const weekEnd = weekDays[6].dateStr;
        isInRange = start <= weekEnd && end >= weekStart;
      } else {
        const [sy, sm] = start.split("-").map(Number);
        const isStartInMonth = sy === this.eventsCurrentYear && sm === (this.eventsCurrentMonth + 1);
        isInRange = isStartInMonth;
        if (end && end !== start) {
          const [ey, em] = end.split("-").map(Number);
          if (ey === this.eventsCurrentYear && em === (this.eventsCurrentMonth + 1)) isInRange = true;
        }
      }

      if (isInRange) {
        userCounts.all++;
        const u = evt.creatorUsername;
        userCounts[u] = (userCounts[u] || 0) + 1;
      }
    });

    // "All Users" pill
    const allBtn = document.createElement("button");
    allBtn.className = `user-filter-pill ${this.eventsSelectedUser === "all" ? "is-active" : ""}`;
    allBtn.innerHTML = `
      <span>${this.t("events_filter_all_users")}</span>
      <span class="user-filter-count">${userCounts.all || 0}</span>
    `;
    allBtn.addEventListener("click", () => {
      this.eventsSelectedUser = "all";
      this.savePrefs();
      this.renderEventsCalendar();
    });
    this.dom.eventsUserFilterBar.appendChild(allBtn);

    // "My Events" pill (if user is signed in)
    if (this.currentUser) {
      const myCount = userCounts[this.currentUser.username] || 0;
      const myBtn = document.createElement("button");
      myBtn.className = `user-filter-pill ${this.eventsSelectedUser === "my" ? "is-active" : ""}`;
      myBtn.innerHTML = `
        <span>${this.t("events_filter_my_events")}</span>
        <span class="user-filter-count">${myCount}</span>
      `;
      myBtn.addEventListener("click", () => {
        this.eventsSelectedUser = "my";
        this.savePrefs();
        this.renderEventsCalendar();
      });
      this.dom.eventsUserFilterBar.appendChild(myBtn);
    }

    // Individual users pills
    this.users.forEach(user => {
      const theme = this.getEventTheme({ creatorUsername: user.username, creatorId: user.id });
      const count = userCounts[user.username] || 0;
      const isSelected = this.eventsSelectedUser === user.username;
      const uBtn = document.createElement("button");
      uBtn.className = `user-filter-pill ${isSelected ? "is-active" : ""}`;
      if (isSelected) {
        uBtn.style.borderColor = theme.accent;
        uBtn.style.boxShadow = `0 0 12px ${theme.glow}`;
      }
      uBtn.innerHTML = `
        <span class="u-inline-flex u-items-center u-gap-6">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${theme.accent}; box-shadow: 0 0 8px ${theme.accent};"></span>
          ${this.escapeHtml(user.name)}
        </span>
        <span class="user-filter-count">${count}</span>
      `;
      uBtn.addEventListener("click", () => {
        this.eventsSelectedUser = user.username;
        this.savePrefs();
        this.renderEventsCalendar();
      });
      this.dom.eventsUserFilterBar.appendChild(uBtn);
    });
  },
  // =========================================================================
  // ZOOM LEVEL 1: DAILY TIMELINE VIEW (8am - 10pm & Day Columns)
  // =========================================================================
  renderEventsDailyTimeline(filteredEvents) {
    if (!this.dom.dailyTimelineHeaderBar || !this.dom.dailyTimelineBody) return;

    const weekDays = this.getWeekDays(this.eventsActiveDate);
    const today = new Date();
    const realTodayStr = this.getTodayDateString();

    // 1. Build Header Bar (Spacer + 7 Day Column Headers)
    this.dom.dailyTimelineHeaderBar.innerHTML = `
      <button type="button" class="timeline-time-header-spacer timeline-offhours-header-btn" title="${this.eventsOffHoursExpanded ? this.t("daily_hide_offhours") : this.t("daily_show_offhours")}">${this.eventsOffHoursExpanded ? this.t("daily_hide_offhours") : this.t("daily_show_offhours")}</button>
      <div class="timeline-day-headers-row" id="timeline-day-headers-row"></div>
    `;
    const headersRow = document.getElementById("timeline-day-headers-row");
    this.dom.dailyTimelineHeaderBar.querySelector(".timeline-offhours-header-btn")?.addEventListener("click", () => this.toggleOffHours());

    weekDays.forEach(day => {
      const isToday = day.dateStr === realTodayStr;
      const isPast = this.isPastEventDate(day.dateStr);
      const headerCell = document.createElement("div");
      headerCell.className = `timeline-day-header-cell ${day.isWeekend ? 'weekend-header' : ''} ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}`;
      headerCell.innerHTML = `
        <div class="timeline-day-title-wrap">
          <span class="timeline-day-name">${day.dayName}</span>
          <span class="timeline-day-number">${day.dayNumber}</span>
        </div>
        ${isPast ? "" : `<button type="button" class="btn-timeline-add-day" title="${this.tf("event_schedule_on", { date: day.dateStr })}" data-date="${day.dateStr}">+</button>`}
      `;

      headerCell.querySelector(".btn-timeline-add-day")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openAddEventModal(day.dateStr);
      });

      headersRow.appendChild(headerCell);
    });

    // 2. Build Timeline Body (Left Time Column + Right Day Columns Grid)
    this.dom.dailyTimelineBody.innerHTML = "";

    // Time Column
    const timeCol = document.createElement("div");
    timeCol.className = "timeline-time-col";

    // 8:00 AM to 10:00 PM (14 hour marks)
    let timeHtml = "";
    if (this.eventsOffHoursExpanded) {
      for (let h = 0; h < 8; h++) {
        timeHtml += `<div class="timeline-hour-marker u-opacity-0_5">${String(h).padStart(2, "0")}:00</div>`;
      }
    }

    for (let h = 8; h <= 22; h++) {
      timeHtml += `<div class="timeline-hour-marker">${String(h).padStart(2, "0")}:00</div>`;
    }

    if (this.eventsOffHoursExpanded) {
      for (let h = 23; h <= 23; h++) {
        timeHtml += `<div class="timeline-hour-marker u-opacity-0_5">${String(h).padStart(2, "0")}:00</div>`;
      }
    }

    timeCol.innerHTML = timeHtml;
    this.dom.dailyTimelineBody.appendChild(timeCol);

    // Days Columns Container
    const daysWrap = document.createElement("div");
    daysWrap.className = "timeline-days-col-wrap";

    const baseStartHour = this.eventsOffHoursExpanded ? 0 : 8;
    const baseEndHour = this.eventsOffHoursExpanded ? 24 : 22;
    const hourHeight = 68;

    weekDays.forEach(day => {
      const isToday = day.dateStr === realTodayStr;
      const isPast = this.isPastEventDate(day.dateStr);
      const dayCol = document.createElement("div");
      dayCol.className = `timeline-day-column ${day.isWeekend ? 'weekend-col' : ''} ${isToday ? 'is-today-col' : ''} ${isPast ? 'is-past-col' : ''}`;
      dayCol.dataset.date = day.dateStr;
      if (isPast) dayCol.dataset.pastScheduleMessage = this.t("event_past_create_unavailable");

      // Render hour slots in the column
      const currentHour = today.getHours();
      for (let h = baseStartHour; h < baseEndHour; h++) {
        const slot = document.createElement("div");
        slot.className = "timeline-hour-slot";
        if (isToday && h === new Date().getHours()) slot.classList.add("is-current-hour");
        const isPastHour = isToday && h < currentHour;
        if (isPastHour) {
          slot.classList.add("is-past-hour");
          slot.setAttribute("aria-disabled", "true");
          slot.title = this.t("event_past_create_unavailable");
        }
        const hourStr = `${String(h).padStart(2, "0")}:00`;
        slot.innerHTML = (isPast || isPastHour) ? "" : `
          <button type="button" class="btn-slot-schedule" title="${this.tf("event_schedule_at", { time: hourStr })}">+ ${hourStr}</button>
        `;
        slot.querySelector(".btn-slot-schedule")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddEventModal(day.dateStr);
          setTimeout(() => {
            if (this.dom.eventHourInput) this.dom.eventHourInput.value = hourStr;
          }, 30);
        });
        dayCol.appendChild(slot);
      }

      // Filter events occurring on this specific day
      const dayEvents = filteredEvents.filter(evt => {
        const s = evt.startDate;
        const ed = evt.endDate;
        return day.dateStr >= s && day.dateStr <= ed;
      });

      // Render positioned event cards
      dayEvents.forEach(evt => {
        const separateHours = Array.isArray(evt.scheduledHours) && evt.scheduledHours.length > 1
          ? evt.scheduledHours
          : [];
        const displayHour = separateHours[0] || evt.hour || "18:00";
        const [eh, em] = displayHour.split(":").map(Number);
        const startDec = eh + ((em || 0) / 60);
        const dur = separateHours.length ? 1 : (parseFloat(evt.durationHours) || 2);
        const endDec = startDec + dur;
        const endHourInt = Math.floor(endDec);
        const endMinInt = Math.round((endDec - endHourInt) * 60);
        const endHourStr = `${String(endHourInt).padStart(2, "0")}:${String(endMinInt).padStart(2, "0")}`;

        // Compute vertical pixel position
        const topPx = (startDec - baseStartHour) * hourHeight;
        const heightPx = Math.max(32, (dur * hourHeight) - 4);

        const theme = this.getEventTheme(evt);
        const card = document.createElement("div");
        card.className = "timeline-event-card";
        if (isToday && endDec <= currentHour + (today.getMinutes() / 60)) card.classList.add("is-past-hour");
        const isLocked = evt.entryType === "locked";
        const isRoomOnly = evt.entryType === "room_only";
        if (isLocked) {
          card.classList.add("is-locked-card");
        } else if (isRoomOnly) {
          card.classList.add("is-room-only-card");
        }
        card.style.top = `${topPx}px`;
        card.style.height = `${heightPx}px`;
        card.style.borderLeft = `5px solid ${theme.accent}`;
        card.style.background = this.getEventSurface(theme);
        card.style.boxShadow = `0 4px 16px ${theme.glow}`;

        const isOwn = this.currentUser && (evt.creatorId === this.currentUser.id || evt.creatorUsername === this.currentUser.username);
        const recurrentTag = evt.isRecurrent ? `<span class="u-color-sky u-fw-600 u-text-3xs">${evt.recurrenceIndex || 1}/${evt.recurrenceTotal || 1}</span>` : "";
        const creatorTagBg = this.theme === "light" ? this.hexToRgba(theme.accent, 0.13) : theme.tagBg;
        const creatorTagColor = this.theme === "light" ? "#334155" : theme.tagColor;

        const extraMeta = this.renderEventTags(evt);

        card.innerHTML = `
          <div class="timeline-event-top">
            <span class="timeline-event-time">${displayHour} – ${endHourStr}</span>
            ${recurrentTag}
          </div>
          <div class="timeline-event-title">${isLocked ? this.icon("lock") + " " : (isRoomOnly ? this.icon("bed") + " " : "")}${this.escapeHtml(evt.title)}</div>
          <div class="timeline-event-meta u-flex u-gap-4 u-wrap u-items-center">
            <span class="user-creator-tag" style="background: ${creatorTagBg}; color: ${creatorTagColor}; font-weight: 500;">${this.escapeHtml(evt.creatorName || evt.creatorUsername)} ${isOwn ? '<svg class="ui-icon u-w-10 u-h-10 u-valign-middle u-color-emerald-400"><use href="#icon-star"></use></svg>' : ''}</span>
            ${(!isLocked && !isRoomOnly && evt.price) ? `<strong class="u-color-emerald-400 u-fw-600">${this.escapeHtml(evt.price)}</strong>` : ''}
            ${extraMeta}
          </div>
        `;

        card.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openEventDetailModal(evt.id);
        });

        dayCol.appendChild(card);

        // One async event is rendered in every selected hour while remaining a
        // single editable event record.
        separateHours.slice(1).forEach(asyncHour => {
          const [asyncH, asyncM] = asyncHour.split(":").map(Number);
          const asyncStart = asyncH + ((asyncM || 0) / 60);
          const clone = card.cloneNode(true);
          clone.style.top = `${(asyncStart - baseStartHour) * hourHeight}px`;
          clone.style.height = `${Math.max(32, hourHeight - 4)}px`;
          const cloneEnd = asyncStart + 1;
          clone.querySelector(".timeline-event-time").textContent = `${asyncHour} – ${String(Math.floor(cloneEnd)).padStart(2, "0")}:${String(Math.round((cloneEnd % 1) * 60)).padStart(2, "0")}`;
          clone.addEventListener("click", event => {
            event.stopPropagation();
            this.openEventDetailModal(evt.id);
          });
          dayCol.appendChild(clone);
        });
      });

      daysWrap.appendChild(dayCol);
    });

    this.dom.dailyTimelineBody.appendChild(daysWrap);
  },
  // =========================================================================
  // ZOOM LEVEL 2: MONTHLY GRID VIEW (With Click-to-Zoom into Day Timeline)
  // =========================================================================
  renderEventsGrid(filteredEvents) {
    this.dom.eventsDaysGrid.innerHTML = "";

    const firstDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth, 1);
    const lastDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const prevMonthLastDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth, 0).getDate();
    const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

    const today = new Date();
    const realTodayStr = this.getTodayDateString();
    const isThisRealMonth = today.getFullYear() === this.eventsCurrentYear && today.getMonth() === this.eventsCurrentMonth;
    const realTodayDate = today.getDate();

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-day-cell";

      const dayOfWeek = i % 7;
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        cell.classList.add("weekend-cell");
      }

      let dayNumber;
      let cellDateString = "";
      let isCurrentMonthCell = true;

      if (i < startDayOfWeek) {
        dayNumber = prevMonthLastDay - (startDayOfWeek - 1 - i);
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const prevMonth = this.eventsCurrentMonth === 0 ? 11 : this.eventsCurrentMonth - 1;
        const prevYear = this.eventsCurrentMonth === 0 ? this.eventsCurrentYear - 1 : this.eventsCurrentYear;
        cellDateString = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else if (i >= startDayOfWeek + daysInMonth) {
        dayNumber = i - (startDayOfWeek + daysInMonth) + 1;
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const nextMonth = this.eventsCurrentMonth === 11 ? 0 : this.eventsCurrentMonth + 1;
        const nextYear = this.eventsCurrentMonth === 11 ? this.eventsCurrentYear + 1 : this.eventsCurrentYear;
        cellDateString = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else {
        dayNumber = i - startDayOfWeek + 1;
        cellDateString = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
        if (isThisRealMonth && dayNumber === realTodayDate) {
          cell.classList.add("is-today");
        }
      }

      const isPast = this.isPastEventDate(cellDateString);
      if (isPast) cell.classList.add("is-past");
      if (isPast && isCurrentMonthCell) {
        cell.classList.add("has-past-schedule-message");
        cell.dataset.pastScheduleMessage = this.t("event_past_create_unavailable");
      }

      // Multi-day match: event spans cellDateString
      const dayEvents = filteredEvents.filter(evt => {
        const start = evt.startDate;
        const end = evt.endDate;
        return cellDateString >= start && cellDateString <= end;
      });

      // Day Header with Click-to-Zoom action
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.innerHTML = `
        <span class="day-number u-cursor-pointer" title="Click date to zoom into Day Timeline">${dayNumber}</span>
        ${isCurrentMonthCell && !isPast ? `<button class="btn-add-day" title="${this.t("event_schedule_this_date")}" data-date="${cellDateString}">+</button>` : ""}
        ${isPast && isCurrentMonthCell ? `<span class="past-schedule-message" aria-live="polite">${this.t("event_past_create_unavailable")}</span>` : ""}
      `;
      cell.appendChild(dayHeader);

      // Clicking day number or cell background zooms directly into that Day's Timeline
      cell.classList.add("is-clickable");
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".event-card-pill") || e.target.closest(".btn-add-day")) return;
        this.setEventsZoomLevel("daily", cellDateString);
      });

      const addBtn = dayHeader.querySelector(".btn-add-day");
      if (addBtn) {
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddEventModal(cellDateString);
        });
      }

      // Events container
      const eventsContainer = document.createElement("div");
      eventsContainer.className = "day-posts-container";

      dayEvents.forEach(event => {
        const theme = this.getEventTheme(event);
        const eventPill = document.createElement("div");
        eventPill.className = "event-card-pill";
        const isLocked = event.entryType === "locked";
        const isRoomOnly = event.entryType === "room_only";
        if (isLocked) {
          eventPill.classList.add("is-locked-pill");
        } else if (isRoomOnly) {
          eventPill.classList.add("is-room-only-pill");
        }
        eventPill.style.borderLeft = `5px solid ${theme.accent}`;
        eventPill.style.setProperty("--event-fill", this.getEventSurface(theme));
        eventPill.style.boxShadow = `0 2px 10px ${theme.glow}`;

        const durHours = event.durationHours ? `${event.durationHours}h` : "2h";
        const time = event.hour || "18:00";
        eventPill.setAttribute("aria-label", `${event.title}, ${time}, ${durHours}. ${this.t("event_open_details")}`);

        const tagsHtml = this.renderEventTags(event);

        eventPill.innerHTML = `
          <span class="event-card-time">${time} · ${durHours}</span>
          <div class="event-card-title">${isLocked ? this.icon("lock") + " " : (isRoomOnly ? this.icon("bed") + " " : "")}${this.escapeHtml(event.title)}</div>
          ${tagsHtml ? `<div class="u-flex u-gap-4 u-wrap u-mt-2">${tagsHtml}</div>` : ''}
        `;

        eventPill.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openEventDetailModal(event.id);
        });

        eventsContainer.appendChild(eventPill);
      });

      cell.appendChild(eventsContainer);
      this.dom.eventsDaysGrid.appendChild(cell);
    }
  },
  // =========================================================================
  // ZOOM LEVEL 3: YEARLY OVERVIEW (12 Months with Event Circle Indicators)
  // =========================================================================
  renderEventsYearlyView(filteredEvents) {
    if (!this.dom.yearlyMonthsGrid) return;
    this.dom.yearlyMonthsGrid.innerHTML = "";

    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const weekdaysMin = this.currentLang === "ro" ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];

    const today = new Date();
    const realTodayStr = this.getTodayDateString();
    const isThisRealYear = today.getFullYear() === this.eventsCurrentYear;
    const realTodayMonth = today.getMonth();
    const realTodayDate = today.getDate();

    for (let m = 0; m < 12; m++) {
      const card = document.createElement("div");
      const isPastMonth = this.eventsCurrentYear < today.getFullYear()
        || (this.eventsCurrentYear === today.getFullYear() && m < realTodayMonth);
      card.className = `yearly-month-card ${m === this.eventsCurrentMonth ? 'current-month-card' : ''} ${isPastMonth ? 'is-past-month' : ''}`;

      // Events in this month
      const monthEvents = filteredEvents.filter(e => {
        const s = e.startDate;
        const ed = e.endDate;
        if (!s) return false;
        const [sy, sm] = s.split("-").map(Number);
        const [ey, em] = (ed || s).split("-").map(Number);
        const targetMonth1 = m + 1;
        return (sy === this.eventsCurrentYear && sm === targetMonth1) || (ey === this.eventsCurrentYear && em === targetMonth1);
      });

      const countBadge = monthEvents.length > 0 
        ? `<span class="yearly-month-events-badge has-events">${monthEvents.length} ${monthEvents.length === 1 ? this.t("yearly_events_count_singular") : this.t("yearly_events_count_plural")}</span>`
        : `<span class="yearly-month-events-badge">0 ${this.t("yearly_events_count_plural")}</span>`;

      card.innerHTML = `
        <div class="yearly-month-header">
          <div class="yearly-month-title">
            <svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg> ${monthNames[m]}
          </div>
          ${countBadge}
        </div>
        <div class="yearly-mini-calendar">
          ${this.renderMiniWeekdayRow(weekdaysMin)}
        </div>
      `;

      const miniCal = card.querySelector(".yearly-mini-calendar");

      const firstDay = new Date(this.eventsCurrentYear, m, 1);
      const daysInMonth = new Date(this.eventsCurrentYear, m + 1, 0).getDate();
      let startDayOfWeek = firstDay.getDay() - 1;
      if (startDayOfWeek < 0) startDayOfWeek = 6;

      // Empty lead-in days
      for (let pad = 0; pad < startDayOfWeek; pad++) {
        const padCell = document.createElement("div");
        padCell.className = "yearly-mini-day other-month";
        miniCal.appendChild(padCell);
      }

      // Days of this month
      for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement("div");
        dayCell.className = "yearly-mini-day";
        dayCell.textContent = d;

        const dateStr = `${this.eventsCurrentYear}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

        if (dateStr < realTodayStr) {
          dayCell.classList.add("is-past");
        }

        if (isThisRealYear && m === realTodayMonth && d === realTodayDate) {
          dayCell.classList.add("is-today");
        }

        // Find events on this day
        const dayEvts = filteredEvents.filter(e => {
          const s = e.startDate;
          const ed = e.endDate;
          return dateStr >= s && dateStr <= ed;
        });

        if (dayEvts.length > 0) {
          dayCell.classList.add("has-event-circle");
          const evtTitles = dayEvts.map(e => `• ${e.title} (${e.hour || '18:00'})`).join("\n");
          dayCell.title = `${dateStr}\n${evtTitles}\n(${this.t("yearly_click_to_zoom")} ${monthNames[m]})`;
          
          dayCell.addEventListener("click", (e) => {
            e.stopPropagation();
            this.eventsCurrentMonth = m;
            this.eventsActiveDate = dateStr;
            this.setEventsZoomLevel("monthly");
          });
        }

        miniCal.appendChild(dayCell);
      }

      // Clicking anywhere on the month card zooms into that month
      card.addEventListener("click", () => {
        this.eventsCurrentMonth = m;
        this.eventsActiveDate = `${this.eventsCurrentYear}-${String(m + 1).padStart(2, "0")}-15`;
        this.setEventsZoomLevel("monthly");
      });

      this.dom.yearlyMonthsGrid.appendChild(card);
    }
  }
};
