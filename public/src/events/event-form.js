// Event form: open/edit/submit, free-hours board, conflicts, suggestions, cover image.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const eventFormMethods = {
  // =========================================================================
  // RECURRENT EVENTS LOGIC
  // =========================================================================
  computeRecurrenceDates(startDateStr, monthsCount) {
    if (!startDateStr || monthsCount <= 1) return [startDateStr];
    const [y, m, d] = startDateStr.split("-").map(Number);
    const dates = [];

    for (let i = 0; i < monthsCount; i++) {
      const targetMonthIndex = (m - 1) + i;
      const targetYear = y + Math.floor(targetMonthIndex / 12);
      const targetMonth = (targetMonthIndex % 12);

      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const targetDay = Math.min(d, daysInTargetMonth);

      const formattedMonth = String(targetMonth + 1).padStart(2, "0");
      const formattedDay = String(targetDay).padStart(2, "0");
      dates.push(`${targetYear}-${formattedMonth}-${formattedDay}`);
    }
    return dates;
  },
  updateRecurrencePreviewHint() {
    const isChecked = this.dom.eventIsRecurrent && this.dom.eventIsRecurrent.checked;
    const hintEl = this.dom.eventRecurrencePreviewHint;
    const dateVal = this.dom.eventDateInput ? this.dom.eventDateInput.value : "";
    const monthsVal = this.dom.eventRecurrenceMonths ? parseInt(this.dom.eventRecurrenceMonths.value, 10) : 3;

    if (!hintEl) return;
    if (!isChecked || !dateVal) {
      hintEl.textContent = `Schedules monthly on the same day for ${monthsVal} months`;
      return;
    }

    const dates = this.computeRecurrenceDates(dateVal, monthsVal);
    const dateNames = dates.map(dt => {
      const [y, m, d] = dt.split("-").map(Number);
      const dtObj = new Date(y, m - 1, d);
      return dtObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });

    const previewStr = dateNames.length <= 4 
      ? dateNames.join(", ") 
      : `${dateNames.slice(0, 3).join(", ")} ... ${dateNames[dateNames.length - 1]}`;

    hintEl.textContent = `${monthsVal} monthly sessions: ${previewStr}`;
  },
  setEventTimingMode(mode) {
    this.eventTimingMode = mode === "async" ? "async" : "consecutive";
    if (this.eventTimingMode === "consecutive") this.eventAsyncHours = [];
    this.dom.eventTimingModeInputs.forEach(input => { input.checked = input.value === this.eventTimingMode; });
    if (this.dom.eventDurationInput) this.dom.eventDurationInput.readOnly = this.eventTimingMode === "async";
    if (this.dom.eventHoursBoardHint) {
      this.dom.eventHoursBoardHint.textContent = this.eventTimingMode === "async"
        ? this.t("event_timing_async_hint")
        : this.t("event_timing_consecutive_hint");
    }
    this.updateFreeHoursBoard(this.dom.eventDateInput?.value);
  },
  updateFreeHoursBoard(dateStr) {
    if (!this.dom.eventFreeHoursBoard) return;
    this.dom.eventFreeHoursBoard.innerHTML = "";
    if (!dateStr) return;

    const excludeId = this.dom.eventEditId ? this.dom.eventEditId.value : null;

    // Find all events that overlap dateStr
    const dayEvents = this.events.filter(e => {
      if (excludeId && e.id === excludeId) return false;
      const start = e.startDate || e.date;
      const end = e.endDate || e.startDate || e.date;
      return dateStr >= start && dateStr <= end;
    });

    // Compute busy ranges. Separate-hour events reserve one hour at each selected time.
    const busyRanges = dayEvents.flatMap(e => {
      if (Array.isArray(e.scheduledHours) && e.scheduledHours.length > 1) {
        return e.scheduledHours.map(timeStr => {
          const [h, m] = timeStr.split(":").map(Number);
          const start = h + ((m || 0) / 60);
          return { start, end: start + 1, title: e.title };
        });
      }
      const timeStr = e.hour || e.time || "10:00";
      const [h, m] = timeStr.split(":").map(Number);
      const startHour = h + ((m || 0) / 60);
      const dur = parseFloat(e.durationHours) || 2;
      return { start: startHour, end: startHour + dur, title: e.title };
    });

    // 08:00 to 20:00 schedule slots
    for (let h = 8; h <= 20; h++) {
      const slotStr = `${String(h).padStart(2, "0")}:00`;
      const slotEnd = h + 1;
      const now = new Date();
      const isPastHour = dateStr === this.getTodayDateString() && h < now.getHours();

      const overlapping = busyRanges.find(r => Math.max(h, r.start) < Math.min(slotEnd, r.end));

      const chip = document.createElement("div");
      if (isPastHour) {
        chip.className = "hour-slot-chip past";
        chip.setAttribute("aria-disabled", "true");
        chip.title = this.t("event_past_create_unavailable");
        chip.innerHTML = `<span>${slotStr}</span><span class="slot-status">${this.t("event_slot_past")}</span>`;
      } else if (overlapping) {
        chip.className = "hour-slot-chip busy";
        chip.title = `Occupied by: ${overlapping.title}`;
        chip.innerHTML = `
          <span>${slotStr}</span>
          <span class="slot-status">${this.t("event_slot_busy")}</span>
        `;
      } else {
        chip.className = "hour-slot-chip free";
        chip.title = `Free slot. Click to set start hour to ${slotStr}`;
        chip.innerHTML = `
          <span>${slotStr}</span>
          <span class="slot-status">${this.t("event_slot_free")}</span>
        `;
        chip.addEventListener("click", () => {
          if (this.eventTimingMode === "async") {
            const selected = new Set(this.eventAsyncHours);
            if (selected.has(slotStr)) selected.delete(slotStr);
            else selected.add(slotStr);
            this.eventAsyncHours = [...selected].sort();
            if (this.eventAsyncHours.length) this.dom.eventHourInput.value = this.eventAsyncHours[0];
            this.dom.eventDurationInput.value = this.eventAsyncHours.length || 1;
          } else {
            this.eventAsyncHours = [];
            this.dom.eventHourInput.value = slotStr;
          }
          this.updateFreeHoursBoard(dateStr);
          this.checkEventDateConflict(this.dom.eventDateInput.value, this.dom.eventDateInput.value, this.dom.eventEditId.value);
        });
        const [selectedHour, selectedMinute] = (this.dom.eventHourInput?.value || "00:00").split(":").map(Number);
        const selectedStart = selectedHour + ((selectedMinute || 0) / 60);
        const selected = this.eventTimingMode === "async"
          ? this.eventAsyncHours.includes(slotStr)
          : h >= selectedStart && h < selectedStart + (parseFloat(this.dom.eventDurationInput?.value) || 2);
        chip.classList.toggle("is-selected", selected);
      }
      this.dom.eventFreeHoursBoard.appendChild(chip);
    }
  },
  setEventFormMode() {
    this.eventFormMode = "schedule";
    if (this.dom.eventForm) {
      this.dom.eventForm.classList.add("mode-schedule");
    }
  },
  findSmartSuggestions(startDate, startHour, durationHours, excludeEventId = null) {
    if (!this.dom.eventSmartSuggestionBox || !this.dom.smartSuggestionsList) return;
    this.dom.smartSuggestionsList.innerHTML = "";
    if (!startDate) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    const dur = parseFloat(durationHours) || 2;
    const [h, m] = (startHour || "18:00").split(":").map(Number);
    const reqStart = h + ((m || 0) / 60);
    const reqEnd = reqStart + dur;

    // Check for events that overlap startDate
    const dayEvents = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const s = e.startDate || e.date;
      const ed = e.endDate || e.startDate || e.date;
      return startDate >= s && startDate <= ed;
    });

    const directConflict = dayEvents.find(e => {
      const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
      const eStart = eh + ((em || 0) / 60);
      const eDur = parseFloat(e.durationHours) || 2;
      const eEnd = eStart + eDur;
      return Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd);
    });

    if (!directConflict && dayEvents.length === 0) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    const suggestions = [];

    // SUGGESTION 1: Alternative free hour on the same day (between 08:00 and 20:00)
    for (let slotH = 8; slotH <= (20 - dur); slotH++) {
      const slotEnd = slotH + dur;
      const overlaps = dayEvents.some(e => {
        const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
        const eStart = eh + ((em || 0) / 60);
        const eDur = parseFloat(e.durationHours) || 2;
        const eEnd = eStart + eDur;
        return Math.max(slotH, eStart) < Math.min(slotEnd, eEnd);
      });
      if (!overlaps && Math.abs(slotH - reqStart) >= 0.5) {
        const slotStr = `${String(slotH).padStart(2, "0")}:00`;
        suggestions.push({
          type: "hour",
          label: "Free Hour Today",
          text: `Free slot today at ${slotStr} (${dur}h duration)`,
          newHour: slotStr,
          newDate: startDate
        });
        break;
      }
    }

    // SUGGESTION 2: Next completely free day (within next 30 days)
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const currDateObj = new Date(sy, sm - 1, sd);
    for (let d = 1; d <= 30; d++) {
      const nextDateObj = new Date(currDateObj.getFullYear(), currDateObj.getMonth(), currDateObj.getDate() + d);
      const nextYear = nextDateObj.getFullYear();
      const nextMonth = String(nextDateObj.getMonth() + 1).padStart(2, "0");
      const nextDay = String(nextDateObj.getDate()).padStart(2, "0");
      const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

      const hasAnyEvent = this.events.some(e => {
        if (excludeEventId && e.id === excludeEventId) return false;
        const s = e.startDate || e.date;
        const ed = e.endDate || e.startDate || e.date;
        return nextDateStr >= s && nextDateStr <= ed;
      });

      if (!hasAnyEvent) {
        const dayName = nextDateObj.toLocaleDateString(undefined, { weekday: "short" });
        const monthName = nextDateObj.toLocaleDateString(undefined, { month: "short" });
        const dayNum = nextDateObj.getDate();
        const prefix = d === 1 ? "Tomorrow" : `${dayName}, ${monthName} ${dayNum}`;
        suggestions.push({
          type: "next-day",
          label: "Next Free Day",
          text: `${prefix} (${nextDateStr}) is completely free`,
          newHour: startHour || "18:00",
          newDate: nextDateStr
        });
        break;
      }
    }

    // SUGGESTION 3: Same day next week (+7 days)
    const nextWeekObj = new Date(currDateObj.getFullYear(), currDateObj.getMonth(), currDateObj.getDate() + 7);
    const nwYear = nextWeekObj.getFullYear();
    const nwMonth = String(nextWeekObj.getMonth() + 1).padStart(2, "0");
    const nwDay = String(nextWeekObj.getDate()).padStart(2, "0");
    const nextWeekStr = `${nwYear}-${nwMonth}-${nwDay}`;

    const nextWeekEvents = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const s = e.startDate || e.date;
      const ed = e.endDate || e.startDate || e.date;
      return nextWeekStr >= s && nextWeekStr <= ed;
    });

    const hasConflictNextWeek = nextWeekEvents.some(e => {
      const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
      const eStart = eh + ((em || 0) / 60);
      const eDur = parseFloat(e.durationHours) || 2;
      const eEnd = eStart + eDur;
      return Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd);
    });

    if (!hasConflictNextWeek) {
      const dayName = nextWeekObj.toLocaleDateString(undefined, { weekday: "long" });
      const monthName = nextWeekObj.toLocaleDateString(undefined, { month: "short" });
      const dayNum = nextWeekObj.getDate();
      suggestions.push({
        type: "next-week",
        label: "Same Day Next Week",
        text: `Next ${dayName}, ${monthName} ${dayNum} (${nextWeekStr}) at ${startHour || "18:00"}`,
        newHour: startHour || "18:00",
        newDate: nextWeekStr
      });
    }

    if (suggestions.length === 0 && !directConflict) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    this.dom.eventSmartSuggestionBox.style.display = "block";
    if (directConflict) {
      this.dom.smartConflictDetails.innerHTML = `Conflict with <strong>"${this.escapeHtml(directConflict.title)}"</strong> booked at ${directConflict.hour || directConflict.time || "18:00"} (${directConflict.durationHours || 2}h). Choose an alternative below:`;
    } else {
      this.dom.smartConflictDetails.innerHTML = `Date has scheduled events. You may keep this or select an open recommendation below:`;
    }

    suggestions.forEach(s => {
      const card = document.createElement("div");
      card.className = "suggestion-card";
      card.innerHTML = `
        <div class="suggestion-info">
          <span class="suggestion-label label-${s.type}">${s.label}</span>
          <span>${this.escapeHtml(s.text)}</span>
        </div>
        <button type="button" class="btn-apply-suggestion">Reschedule</button>
      `;
      const applyBtn = card.querySelector(".btn-apply-suggestion");
      applyBtn.addEventListener("click", () => {
        this.applySmartSuggestion(s.newDate, s.newHour);
      });
      this.dom.smartSuggestionsList.appendChild(card);
    });
  },
  applySmartSuggestion(newDate, newHour) {
    if (newDate) {
      this.dom.eventDateInput.value = newDate;
    }
    if (newHour) {
      this.dom.eventHourInput.value = newHour;
    }
    this.updateFreeHoursBoard(newDate);
    this.checkEventDateConflict(newDate, newDate, this.dom.eventEditId.value);
    this.findSmartSuggestions(newDate, newHour, this.dom.eventDurationInput.value, this.dom.eventEditId.value);

    // Provide immediate visual confirmation
    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();
    const notice = document.createElement("div");
    notice.className = "suggestion-applied-notice";
    notice.innerHTML = `<span><svg class="ui-icon" style="width:12px;height:12px;vertical-align:middle"><use href="#icon-check"></use></svg> Rescheduled to <strong>${newDate} at ${newHour}</strong>. Slot is available!</span>`;
    this.dom.eventSmartSuggestionBox.insertAdjacentElement("beforebegin", notice);
    setTimeout(() => notice.remove(), 4000);
  },
  checkEventDateConflict(startDate, endDate = null, excludeEventId = null) {
    if (!startDate || !this.dom.eventDateWarning) return;
    const end = endDate || startDate;

    const selectedAsyncHours = this.eventTimingMode === "async" ? this.eventAsyncHours : [];
    const conflicts = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const eStart = e.startDate || e.date;
      const eEnd = e.endDate || e.startDate || e.date;
      if (!(eStart <= end && eEnd >= startDate)) return false;
      if (!selectedAsyncHours.length || startDate !== end) return true;
      if (Array.isArray(e.scheduledHours) && e.scheduledHours.length > 1) {
        return selectedAsyncHours.some(selectedHour => e.scheduledHours.includes(selectedHour));
      }
      const [eventHour, eventMinute] = (e.hour || e.time || "18:00").split(":").map(Number);
      const eventStart = eventHour + ((eventMinute || 0) / 60);
      const eventEnd = eventStart + (parseFloat(e.durationHours) || 2);
      return selectedAsyncHours.some(selectedHour => {
        const [hour, minute] = selectedHour.split(":").map(Number);
        const selectedStart = hour + ((minute || 0) / 60);
        return selectedStart < eventEnd && selectedStart + 1 > eventStart;
      });
    });

    if (conflicts.length > 0) {
      this.dom.eventDateWarning.style.display = "flex";
      const list = conflicts.map(c => {
        const isMulti = c.startDate && c.endDate && c.startDate !== c.endDate;
        const span = isMulti ? `(${c.startDate} to ${c.endDate})` : `(${c.hour || c.time || '18:00'}, ${c.durationHours || 2}h)`;
        return `"${this.escapeHtml(c.title)}" ${span}`;
      }).join(", ");
      this.dom.eventDateWarningMsg.innerHTML = `Date Conflict Notice: <strong>${conflicts.length}</strong> active event(s) in this period: ${list}.`;
    } else {
      this.dom.eventDateWarning.style.display = "none";
    }
  },
  resetFacebookValidation() {
    this.isFbImageValid = false;
    if (this.dom.eventFbValidationStatus) {
      this.dom.eventFbValidationStatus.style.display = "none";
      this.dom.eventFbValidationStatus.className = "fb-dimension-status";
    }
    if (this.dom.eventFbPreviewBox) {
      this.dom.eventFbPreviewBox.style.display = "none";
    }
    if (this.dom.saveEventBtn) {
      this.dom.saveEventBtn.disabled = false;
    }
  },
  validateFacebookImage(src) {
    if (!src || !src.trim()) {
      this.resetFacebookValidation();
      return;
    }

    if (this.dom.eventFbValidationStatus) {
      this.dom.eventFbValidationStatus.style.display = "flex";
      this.dom.eventFbValidationStatus.className = "fb-dimension-status";
      this.dom.fbStatusIcon.innerHTML = '<svg class="ui-icon" style="width:14px;height:14px"><use href="#icon-clock"></use></svg>';
      this.dom.fbStatusText.textContent = "Analyzing image dimensions & Facebook 16:9 proportional standard...";
    }

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = w / h;

      // Facebook Page Cover standard: 16:9 ratio (~1.7778).
      const is16by9 = ratio >= 1.70 && ratio <= 1.85;

      if (is16by9) {
        this.isFbImageValid = true;
        if (this.dom.eventFbValidationStatus) {
          this.dom.eventFbValidationStatus.className = "fb-dimension-status valid";
          this.dom.fbStatusIcon.textContent = "Valid";
          this.dom.fbStatusText.innerHTML = `Valid Facebook Standard (16:9): <strong>${w} × ${h} px</strong> (Ratio: ${ratio.toFixed(2)}:1)`;
        }
        if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = src;
        if (this.dom.eventFbPreviewImg) this.dom.eventFbPreviewImg.src = src;
        if (this.dom.fbPreviewDimsBadge) this.dom.fbPreviewDimsBadge.textContent = `${w} × ${h} (16:9)`;
        if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "block";
        if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = false;
      } else {
        this.isFbImageValid = false;
        let shapeDesc = "non-proportional";
        if (Math.abs(ratio - 1) < 0.1) shapeDesc = "Square (1:1)";
        else if (ratio < 1) shapeDesc = "Vertical / Portrait (9:16)";
        else if (ratio > 2.0) shapeDesc = "Ultra-wide banner";
        else shapeDesc = `Aspect ratio ${ratio.toFixed(2)}:1`;

        if (this.dom.eventFbValidationStatus) {
          this.dom.eventFbValidationStatus.className = "fb-dimension-status invalid";
          this.dom.fbStatusIcon.textContent = "Invalid";
          this.dom.fbStatusText.innerHTML = `<strong>Rejected (Non-proportional):</strong> Facebook Page Cover standard strictly requires a <strong>16:9 landscape aspect ratio</strong> (e.g. 1920×1080 or 1200×675). Detected: <strong>${w} × ${h} px</strong> (${shapeDesc}).`;
        }
        if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = "";
        if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "none";
        if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = true;
      }
    };

    img.onerror = () => {
      this.isFbImageValid = false;
      if (this.dom.eventFbValidationStatus) {
        this.dom.eventFbValidationStatus.className = "fb-dimension-status invalid";
        this.dom.fbStatusIcon.textContent = "Invalid";
        this.dom.fbStatusText.textContent = "Unable to load image. Please verify file integrity or URL format.";
      }
      if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = "";
      if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "none";
      if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = true;
    };

    img.src = src;
  },
  mountEventForm(location = "dialog") {
    const target = location === "page" ? this.dom.schedulePageFormHost : this.dom.eventDialog;
    if (!target || !this.dom.eventForm || !this.dom.eventDialogFooter) return;
    if (this.dom.eventForm.parentElement !== target || this.dom.eventDialogFooter.parentElement !== target) {
      target.appendChild(this.dom.eventForm);
      target.appendChild(this.dom.eventDialogFooter);
    }

    if (this.dom.saveEventBtn) this.dom.saveEventBtn.style.display = "inline-flex";
  },
  closeEventForm() {
    if (this.eventsLayoutMode === "schedule") {
      this.eventsLayoutMode = "panel";
      this.setEventsLayoutMode("panel");
      return;
    }
    this.dom.eventDialog.close();
  },
  openScheduleEventPage() {
    if (!this.currentUser) {
      this.setAppView("login");
      return;
    }
    this.eventsLayoutMode = "schedule";
    this.setAppView("events");
    this.openAddEventModal(null, true);
  },
  openAddEventModal(preselectedDate = null, asPage = false) {
    if (!this.currentUser) {
      this.setAppView("login");
      return;
    }

    if (this.isPastEventDate(preselectedDate)) {
      alert(this.t("event_past_readonly"));
      return;
    }

    this.mountEventForm(asPage ? "page" : "dialog");

    this.dom.eventEditId.value = "";
    this.dom.eventDialogActionText.textContent = this.t("event_dialog_create_title");
    this.dom.eventForm.reset();
    this.dom.eventCreatorDisplay.value = `${this.currentUser.name} (@${this.currentUser.username})`;

    const targetDate = preselectedDate || `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-15`;
    this.dom.eventDateInput.value = targetDate;
    this.dom.eventHourInput.value = "18:00";
    this.dom.eventDurationInput.value = "2";
    this.eventAsyncHours = [];
    this.setEventTimingMode("consecutive");
    this.setEventEntryType("event");
    this.populateSpaceSelect("");
    
    // Reset Accommodation multi-room state
    this.currentRoomBookings = [];
    if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
    if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
    if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.remove("is-active");

    this.dom.eventPriceInput.value = "Free";
    if (this.dom.eventPriceCurrency) this.dom.eventPriceCurrency.value = "RON";
    this.dom.eventEnrollInput.value = "";
    this.dom.eventDescInput.value = "";
    this.dom.eventFbImageFile.value = "";
    this.dom.eventFbImageUrl.value = "";
    this.dom.eventFbImageData.value = "";

    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.checked = false;
      this.dom.eventIsRecurrent.disabled = false;
    }
    if (this.dom.eventRecurrenceOptions) {
      this.dom.eventRecurrenceOptions.style.display = "none";
    }
    if (this.dom.eventRecurrenceMonths) {
      this.dom.eventRecurrenceMonths.value = "3";
      this.dom.eventRecurrenceMonths.disabled = false;
    }
    this.updateRecurrencePreviewHint("modal");

    this.setEventFormMode();
    this.resetFacebookValidation();
    this.updateFreeHoursBoard(targetDate);
    this.checkEventDateConflict(targetDate, targetDate);
    this.findSmartSuggestions(targetDate, "18:00", 2);
    if (!asPage) this.dom.eventDialog.showModal();
  },
  openEditEventModal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;

    if (!this.canEditEvent(event)) {
      alert(this.t("event_permission_denied"));
      return;
    }

    this.dom.eventEditId.value = event.id;
    this.dom.eventDialogActionText.textContent = this.t("event_dialog_edit_title");
    this.dom.eventTitleInput.value = event.title;
    this.dom.eventCreatorDisplay.value = `${event.creatorName || event.creatorUsername} (Creator)`;
    this.dom.eventDateInput.value = event.startDate || event.date;
    this.dom.eventHourInput.value = event.hour || event.time || "18:00";
    this.dom.eventDurationInput.value = event.durationHours || 2;
    this.eventAsyncHours = Array.isArray(event.scheduledHours) ? [...event.scheduledHours] : [];
    this.setEventTimingMode(this.eventAsyncHours.length > 1 ? "async" : "consecutive");
    this.setEventEntryType(event.entryType || "event");
    this.populateSpaceSelect(event.spaceId || "");

    // Load Accommodation multi-room state
    if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
      this.currentRoomBookings = event.roomBookings.map(rb => ({ ...rb }));
    } else if (event.roomId) {
      this.currentRoomBookings = [{
        roomId: event.roomId,
        startDate: event.startDate || event.date,
        endDate: event.endDate || event.startDate || event.date
      }];
    } else {
      this.currentRoomBookings = [];
    }
    const hasRooms = this.currentRoomBookings.length > 0;
    if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = hasRooms;
    if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = hasRooms ? "block" : "none";
    if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.toggle("is-active", hasRooms);
    this.renderRoomBookingRows();

    this.dom.eventPriceInput.value = event.price || "";
    if (this.dom.eventPriceCurrency) this.dom.eventPriceCurrency.value = event.currency || "RON";
    this.dom.eventEnrollInput.value = event.enrollLink || "";
    this.dom.eventDescInput.value = event.description || "";
    this.dom.eventFbImageFile.value = "";
    this.dom.eventFbImageUrl.value = event.facebookImage || "";
    this.dom.eventFbImageData.value = event.facebookImage || "";

    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.checked = !!event.isRecurrent;
      this.dom.eventIsRecurrent.disabled = false;
    }
    if (this.dom.eventRecurrenceOptions) {
      this.dom.eventRecurrenceOptions.style.display = event.isRecurrent ? "block" : "none";
    }
    if (this.dom.eventRecurrenceMonths) {
      this.dom.eventRecurrenceMonths.value = String(event.recurrenceTotal || event.recurrenceMonths || 3);
      this.dom.eventRecurrenceMonths.disabled = false;
    }
    if (event.isRecurrent) {
      this.updateRecurrencePreviewHint("modal");
    }

    this.setEventFormMode();

    if (event.facebookImage) {
      this.validateFacebookImage(event.facebookImage);
    } else {
      this.resetFacebookValidation();
    }

    this.updateFreeHoursBoard(event.startDate || event.date);
    this.checkEventDateConflict(event.startDate || event.date, event.startDate || event.date, event.id);
    this.findSmartSuggestions(event.startDate || event.date, event.hour || event.time || "18:00", event.durationHours || 2, event.id);
    this.dom.eventDialog.showModal();
  },
  handleEventFormSubmit(e) {
    e.preventDefault();
    if (!this.currentUser) {
      this.openLoginDialog("events");
      return;
    }

    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save_event"));
      return;
    }

    const editId = this.dom.eventEditId.value;
    const title = this.dom.eventTitleInput.value.trim();
    const entryType = this.dom.eventEntryTypeInput?.value || this.eventEntryType || "event";
    const isRoomOnly = entryType === "room_only";
    const isLocked = entryType === "locked";

    // For room_only, default date from room bookings check-in
    const startDate = this.dom.eventDateInput.value || this.currentRoomBookings?.[0]?.startDate || new Date().toISOString().slice(0, 10);
    const endDate = isRoomOnly ? (this.currentRoomBookings?.[0]?.endDate || startDate) : startDate;
    const hour = this.dom.eventHourInput.value || "18:00";
    const durationHours = parseFloat(this.dom.eventDurationInput.value) || 2;
    const spaceId = isRoomOnly ? null : (this.dom.eventSpaceSelect?.value || null);
    const price = this.dom.eventPriceInput.value.trim();
    const currency = this.dom.eventPriceCurrency?.value || "RON";
    const enrollLink = this.dom.eventEnrollInput.value.trim();
    const description = this.dom.eventDescInput.value.trim();
    const facebookImage = this.dom.eventFbImageData.value || this.dom.eventFbImageUrl.value.trim();

    if (!title || (!isRoomOnly && !startDate)) {
      alert(this.t("event_required_title_date"));
      return;
    }

    if (!editId && this.isPastEventDate(startDate)) {
      alert(this.t("event_past_readonly"));
      return;
    }

    // Role check and validation for accommodation sleeping rooms
    const needsRoom = (this.dom.eventNeedsRoom && this.dom.eventNeedsRoom.checked) || isRoomOnly;
    let roomBookings = [];
    let roomId = null;

    if (needsRoom) {
      const isAllowedToBookRooms = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
      if (!isAllowedToBookRooms) {
        alert(this.t("event_room_user_blocked_msg"));
        return;
      }

      if (!this.currentRoomBookings || this.currentRoomBookings.length === 0) {
        alert(isRoomOnly ? (this.t("alert_room_required_room_only")) : (this.t("alert_room_required_event")));
        return;
      }

      for (const booking of this.currentRoomBookings) {
        if (!booking.roomId) {
          alert(this.t("alert_room_select_all"));
          return;
        }
        if (!booking.startDate || !booking.endDate) {
          alert(this.t("alert_room_dates_required"));
          return;
        }
        if (booking.endDate < booking.startDate) {
          alert(this.t("alert_room_dates_invalid"));
          return;
        }

        const roomConflict = this.checkRoomConflict(booking.roomId, booking.startDate, booking.endDate, editId);
        if (roomConflict) {
          const rm = (this.rooms || []).find(r => r.id === booking.roomId);
          alert(this.t("alert_room_conflict").replace("${room}", rm?.name || booking.roomId).replace("${event}", roomConflict.title));
          return;
        }
      }

      roomBookings = this.currentRoomBookings.map(b => ({ ...b }));
      roomId = roomBookings[0]?.roomId || null;
    }

    // Only validate FB cover image and Space for regular events (bypass for locked hours & room_only)
    if (entryType === "event") {
      if (!spaceId) {
        alert(this.t("event_space_required"));
        this.dom.eventSpaceSelect?.focus();
        return;
      }
      if (!facebookImage || !this.isFbImageValid) {
        alert(this.t("event_image_required"));
        return;
      }
    }

    const isRecurrent = this.dom.eventIsRecurrent && this.dom.eventIsRecurrent.checked;
    const recurrenceMonths = this.dom.eventRecurrenceMonths ? parseInt(this.dom.eventRecurrenceMonths.value, 10) || 3 : 3;
    const scheduledHours = this.eventTimingMode === "async" ? [...this.eventAsyncHours] : [];
    if (this.eventTimingMode === "async" && scheduledHours.length < 2) {
      alert(this.t("event_timing_async_minimum"));
      return;
    }

    const defaultSocialStatus = (isLocked || isRoomOnly) ? "none" : "pending";

    if (editId) {
      const idx = this.events.findIndex(ev => ev.id === editId);
      if (idx !== -1) {
        const existingEvent = this.events[idx];
        if (!this.canEditEvent(existingEvent)) {
          alert(this.t("alert_permission_denied"));
          return;
        }

        const relatedSeries = existingEvent.isRecurrent && existingEvent.recurrenceGroupId
          ? this.events.filter(ev => ev.recurrenceGroupId === existingEvent.recurrenceGroupId)
          : [];
        const updateEntireSeries = relatedSeries.length > 1 && confirm(
          this.t("event_series_update_prompt").replace("{count}", String(relatedSeries.length))
        );

        if (updateEntireSeries) {
          const seriesDates = isRecurrent && recurrenceMonths > 1
            ? this.computeRecurrenceDates(startDate, recurrenceMonths)
            : [startDate];
          const recurrenceGroupId = isRecurrent && seriesDates.length > 1
            ? existingEvent.recurrenceGroupId
            : null;

          this.events = this.events.filter(ev => ev.recurrenceGroupId !== existingEvent.recurrenceGroupId);
          seriesDates.forEach((recDate, recIdx) => {
            this.events.push({
              ...existingEvent,
              id: recIdx === 0 ? existingEvent.id : `evt-${Date.now()}-series-${recIdx + 1}`,
              title,
              startDate: recDate,
              endDate: recDate,
              date: recDate,
              time: hour,
              hour,
              durationHours,
              entryType,
              spaceId,
              roomId,
              roomBookings,
              price: (isLocked || isRoomOnly) ? "" : price,
              currency,
              enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
              facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
              description,
              scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
              isRecurrent: isRecurrent && seriesDates.length > 1,
              recurrenceGroupId,
              recurrenceMonths: recurrenceGroupId ? recurrenceMonths : undefined,
              recurrenceIndex: recurrenceGroupId ? recIdx + 1 : undefined,
              recurrenceTotal: recurrenceGroupId ? seriesDates.length : undefined,
              socialStatus: (isLocked || isRoomOnly) ? "none" : (existingEvent.socialStatus || "pending")
            });
          });
        } else {
          const shouldCreateSeries = isRecurrent && !existingEvent.isRecurrent && recurrenceMonths > 1;
          const isSingleSeriesEdit = isRecurrent && existingEvent.isRecurrent && !updateEntireSeries;
          const recurrenceGroupId = shouldCreateSeries ? `rec-grp-${Date.now()}` : existingEvent.recurrenceGroupId;
          const recurrenceDates = shouldCreateSeries ? this.computeRecurrenceDates(startDate, recurrenceMonths) : [startDate];

          const updatedEvent = {
            ...existingEvent,
            title,
            startDate: recurrenceDates[0],
            endDate: recurrenceDates[0],
            date: recurrenceDates[0],
            time: hour,
            hour,
            durationHours,
            entryType,
            spaceId,
            roomId,
            roomBookings,
            price: (isLocked || isRoomOnly) ? "" : price,
            currency,
            enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
            facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
            description,
            scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
            color: existingEvent.color || this.getEventTheme(existingEvent).accent,
            isRecurrent,
            recurrenceGroupId: isRecurrent ? recurrenceGroupId : null,
            recurrenceMonths: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceMonths || recurrenceMonths) : recurrenceMonths) : undefined,
            recurrenceIndex: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceIndex || 1) : 1) : undefined,
            recurrenceTotal: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceTotal || recurrenceMonths) : recurrenceDates.length) : undefined,
            socialStatus: (isLocked || isRoomOnly) ? "none" : (existingEvent.socialStatus || "pending")
          };
          this.events[idx] = updatedEvent;

          if (shouldCreateSeries) {
            recurrenceDates.slice(1).forEach((recDate, recIdx) => {
              this.events.push({
                ...updatedEvent,
                id: `evt-${Date.now()}-rec-${recIdx + 2}`,
                startDate: recDate,
                endDate: recDate,
                date: recDate,
                recurrenceIndex: recIdx + 2,
                createdAt: new Date().toISOString()
              });
            });
          }
        }
      }
    } else if (isRecurrent && recurrenceMonths > 1) {
      const recurrenceGroupId = `rec-grp-${Date.now()}`;
      const recDates = this.computeRecurrenceDates(startDate, recurrenceMonths);

      const eventTheme = this.getEventTheme({ creatorUsername: this.currentUser.username, creatorId: this.currentUser.id });
      recDates.forEach((recDateStr, idx) => {
        const newEvent = {
          id: `evt-${Date.now()}-${idx + 1}`,
          creatorId: this.currentUser.id,
          creatorUsername: this.currentUser.username,
          creatorName: this.currentUser.name,
          title,
          startDate: recDateStr,
          endDate: recDateStr,
          date: recDateStr,
          time: hour,
          hour,
          durationHours,
          entryType,
          spaceId,
          roomId,
          roomBookings,
          price: (isLocked || isRoomOnly) ? "" : price,
          currency,
          enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
          facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
          description,
          scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
          color: eventTheme.accent,
          socialStatus: defaultSocialStatus,
          promotedPostId: null,
          isRecurrent: true,
          recurrenceGroupId,
          recurrenceMonths,
          recurrenceIndex: idx + 1,
          recurrenceTotal: recDates.length,
          createdAt: new Date().toISOString()
        };
        this.events.push(newEvent);
      });
    } else {
      const eventTheme = this.getEventTheme({ creatorUsername: this.currentUser.username, creatorId: this.currentUser.id });
      const newEvent = {
        id: `evt-${Date.now()}`,
        creatorId: this.currentUser.id,
        creatorUsername: this.currentUser.username,
        creatorName: this.currentUser.name,
        title,
        startDate,
        endDate: startDate,
        date: startDate,
        time: hour,
        hour,
        durationHours,
        entryType,
        spaceId,
        roomId,
        roomBookings,
        price: (isLocked || isRoomOnly) ? "" : price,
        currency,
        enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
        facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
        description,
        scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
        color: eventTheme.accent,
        socialStatus: defaultSocialStatus,
        promotedPostId: null,
        isRecurrent: false,
        createdAt: new Date().toISOString()
      };
      this.events.push(newEvent);
    }

    this.saveEvents();
    this.updateSocialNotificationBadge();
    this.renderMyEventsPage();
    this.closeEventForm();
    this.renderEventsCalendar();
    if (this.activeApp === "admin") {
      this.renderAdminPanel();
    }
  }
};
