// Scheduling wizard steps, entry types and room bookings.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const wizardMethods = {
  /* ========================================================================= */
  /* Event Scheduling Adaptive Wizard Controller                              */
  /* ========================================================================= */
  updateWizardConfig() {
    const canBook = this.canBookRooms();
    let type = this.eventEntryType || "event";
    if (type === "room_only" && !canBook) {
      type = "event";
      this.eventEntryType = "event";
    }

    if (type === "locked") {
      this.wizardStepsConfig = [
        { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_locked_basics" },
        { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_locked_timing" }
      ];
    } else if (type === "room_only") {
      this.wizardStepsConfig = [
        { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_room_details" },
        { id: "step2", paneId: "wizard-step-pane-4", labelKey: "wizard_step_room_notes" }
      ];
    } else {
      // Public Event
      if (canBook) {
        this.wizardStepsConfig = [
          { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_basics" },
          { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_timing" },
          { id: "step3", paneId: "wizard-step-pane-3", labelKey: "wizard_step_accommodation" },
          { id: "step4", paneId: "wizard-step-pane-4", labelKey: "wizard_step_publishing" }
        ];
      } else {
        // Exclude Cazare step 3 completely for standard users without booking permissions
        this.wizardStepsConfig = [
          { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_basics" },
          { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_timing" },
          { id: "step4", paneId: "wizard-step-pane-4", labelKey: "wizard_step_publishing" }
        ];
      }
    }

    // Dynamic placement of Accommodation room block
    if (this.dom.eventRoomCategoryBlock) {
      if (!canBook) {
        this.dom.eventRoomCategoryBlock.style.display = "none";
      } else if (type === "event") {
        if (this.dom.wizardStep3Host && this.dom.eventRoomCategoryBlock.parentElement !== this.dom.wizardStep3Host) {
          this.dom.wizardStep3Host.appendChild(this.dom.eventRoomCategoryBlock);
        }
      } else {
        const step1Grid = document.querySelector("#wizard-step-pane-1 .form-grid");
        if (step1Grid && this.dom.eventRoomCategoryBlock.parentElement !== step1Grid) {
          step1Grid.appendChild(this.dom.eventRoomCategoryBlock);
        }
      }
    }

    this.renderWizardIndicator();
  },
  renderWizardIndicator() {
    if (!this.dom.wizardStepsIndicator) return;
    this.dom.wizardStepsIndicator.innerHTML = "";

    const totalSteps = this.wizardStepsConfig ? this.wizardStepsConfig.length : 1;
    this.wizardStepsConfig.forEach((step, idx) => {
      const stepNum = idx + 1;
      const stepItem = document.createElement("div");
      stepItem.className = `wizard-step-item ${stepNum === this.wizardCurrentStep ? "is-active" : ""} ${stepNum < this.wizardCurrentStep ? "is-completed" : ""}`;
      stepItem.setAttribute("data-step", String(stepNum));

      const badge = document.createElement("span");
      badge.className = "wizard-step-badge";
      if (stepNum < this.wizardCurrentStep) badge.innerHTML = this.icon("check"); else badge.textContent = String(stepNum);

      const label = document.createElement("span");
      label.className = "wizard-step-label";
      label.textContent = this.t(step.labelKey);

      stepItem.appendChild(badge);
      stepItem.appendChild(label);

      if (stepNum < this.wizardCurrentStep) {
        stepItem.classList.add("is-clickable");
        stepItem.addEventListener("click", () => {
          this.setWizardStep(stepNum);
        });
      }

      this.dom.wizardStepsIndicator.appendChild(stepItem);

      if (idx < totalSteps - 1) {
        const connector = document.createElement("span");
        connector.className = `wizard-step-connector ${stepNum < this.wizardCurrentStep ? "is-completed" : ""}`;
        this.dom.wizardStepsIndicator.appendChild(connector);
      }
    });
  },
  setWizardStep(stepNum = 1) {
    if (!this.wizardStepsConfig || this.wizardStepsConfig.length === 0) {
      this.updateWizardConfig();
    }
    const maxSteps = this.wizardStepsConfig.length;
    const targetStep = Math.max(1, Math.min(stepNum, maxSteps));
    this.wizardCurrentStep = targetStep;

    // Hide all step panes
    document.querySelectorAll(".wizard-step-pane").forEach(pane => {
      pane.classList.remove("is-active");
    });

    // Show active step pane
    const activeConfig = this.wizardStepsConfig[targetStep - 1];
    if (activeConfig) {
      const activePane = document.getElementById(activeConfig.paneId);
      if (activePane) {
        activePane.classList.add("is-active");
      }
    }

    this.renderWizardIndicator();

    // Update buttons
    const isFirstStep = targetStep === 1;
    const isLastStep = targetStep === maxSteps;

    if (this.dom.wizardPrevBtn) {
      if (isFirstStep) {
        this.dom.wizardPrevBtn.textContent = this.t("cancel");
      } else {
        this.dom.wizardPrevBtn.textContent = this.t("wizard_btn_back");
      }
    }

    if (this.dom.wizardNextBtn && this.dom.saveEventBtn) {
      if (isLastStep) {
        this.dom.wizardNextBtn.style.display = "none";
        this.dom.saveEventBtn.style.display = "inline-flex";
        const entryType = this.eventEntryType || "event";
        if (entryType === "locked") {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_locked");
        } else if (entryType === "room_only") {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_room");
        } else {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_event");
        }
      } else {
        this.dom.wizardNextBtn.style.display = "inline-flex";
        this.dom.wizardNextBtn.textContent = this.t("wizard_btn_next");
        this.dom.saveEventBtn.style.display = "none";
      }
    }
  },
  validateCurrentWizardStep() {
    const currentConfig = this.wizardStepsConfig?.[this.wizardCurrentStep - 1];
    if (!currentConfig) return true;

    const paneId = currentConfig.paneId;
    const type = this.eventEntryType || "event";

    if (paneId === "wizard-step-pane-1") {
      const title = this.dom.eventTitleInput?.value.trim();
      if (!title) {
        this.notify(this.t("wizard_val_title_req"), "danger");
        this.dom.eventTitleInput?.focus();
        return false;
      }
      if (type === "event") {
        const space = this.dom.eventSpaceSelect?.value;
        if (!space) {
          this.notify(this.t("wizard_val_space_req"), "danger");
          this.dom.eventSpaceSelect?.focus();
          return false;
        }
      } else if (type === "room_only") {
        if (!this.validateRoomBookings()) return false;
      }
    } else if (paneId === "wizard-step-pane-2") {
      const date = this.dom.eventDateInput?.value;
      if (!date) {
        this.notify(this.t("wizard_val_date_req"), "danger");
        this.dom.eventDateInput?.focus();
        return false;
      }
      if (!this.dom.eventEditId?.value && this.isPastEventDate(date)) {
        this.notify(this.t("event_past_readonly"), "warning");
        return false;
      }
    } else if (paneId === "wizard-step-pane-3") {
      if (this.dom.eventNeedsRoom?.checked && !this.validateRoomBookings()) return false;
    }

    return true;
  },
  // Every booking needs a room and a check-in/check-out in the right order.
  validateRoomBookings() {
    const bookings = this.currentRoomBookings || [];
    if (bookings.length === 0 || bookings.some(b => !b.roomId || !b.startDate || !b.endDate)) {
      this.notify(this.t("wizard_val_room_req"), "danger");
      return false;
    }
    if (bookings.some(b => b.endDate < b.startDate)) {
      this.notify(this.t("alert_room_dates_invalid"), "danger");
      return false;
    }
    return true;
  },
  nextWizardStep() {
    if (!this.validateCurrentWizardStep()) return;
    if (this.wizardCurrentStep < (this.wizardStepsConfig?.length || 1)) {
      this.setWizardStep(this.wizardCurrentStep + 1);
    }
  },
  prevWizardStep() {
    if (this.wizardCurrentStep > 1) {
      this.setWizardStep(this.wizardCurrentStep - 1);
    } else {
      this.closeEventForm();
    }
  },
  setEventEntryType(type = "event") {
    if (type === "room_only") {
      const isAllowed = this.canBookRooms();
      if (!isAllowed) {
        this.notify(this.t("event_room_user_blocked_msg"), "info");
        return;
      }
    }

    this.eventEntryType = type;
    if (this.dom.eventEntryTypeInput) {
      this.dom.eventEntryTypeInput.value = type;
    }
    if (this.dom.btnEntryTypeEvent) {
      this.dom.btnEntryTypeEvent.classList.toggle("is-active", type === "event");
    }
    if (this.dom.btnEntryTypeLocked) {
      this.dom.btnEntryTypeLocked.classList.toggle("is-active", type === "locked");
    }
    if (this.dom.btnEntryTypeRoom) {
      this.dom.btnEntryTypeRoom.style.display = this.canBookRooms() ? "inline-flex" : "none";
      this.dom.btnEntryTypeRoom.classList.toggle("is-active", type === "room_only");
    }

    const isLocked = type === "locked";
    const isRoomOnly = type === "room_only";
    const isPublicEvent = type === "event";

    // 1. Dynamic Labels
    if (this.dom.lblEventTitle) {
      if (isRoomOnly) {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title_room");
      } else if (isLocked) {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title_locked");
      } else {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title");
      }
    }
    if (this.dom.lblEventDesc) {
      if (isRoomOnly) {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc_room");
      } else if (isLocked) {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc_locked");
      } else {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc");
      }
    }

    // 2. Info Notices
    if (this.dom.eventLockedInfoNotice) {
      this.dom.eventLockedInfoNotice.style.display = isLocked ? "block" : "none";
    }
    if (this.dom.eventRoomOnlyNotice) {
      this.dom.eventRoomOnlyNotice.style.display = isRoomOnly ? "block" : "none";
    }

    // 3. Sleeping Rooms Category:
    // - Public event: optional (show checkbox header if user can book rooms, otherwise hidden)
    // - Locked: HIDDEN (blocare interval does not need cazare)
    // - Room only: ALWAYS SHOWN & EXPANDED (hide checkbox header, show booking panel directly)
    if (this.dom.eventRoomCategoryBlock) {
      if (!this.canBookRooms() || isLocked) {
        this.dom.eventRoomCategoryBlock.style.display = "none";
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
      } else if (isRoomOnly) {
        this.dom.eventRoomCategoryBlock.style.display = "block";
        if (this.dom.eventRoomCategoryHeader) this.dom.eventRoomCategoryHeader.style.display = "none";
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = true;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "block";
        this.handleToggleNeedsRoom(true);
      } else {
        // Public event
        this.dom.eventRoomCategoryBlock.style.display = "block";
        if (this.dom.eventRoomCategoryHeader) this.dom.eventRoomCategoryHeader.style.display = "block";
        const hasRooms = Boolean(this.currentRoomBookings && this.currentRoomBookings.length > 0);
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = hasRooms;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = hasRooms ? "block" : "none";
      }
    }

    // 4. Event Venue / Space Selection (Required for Public, Optional/Visible for Locked, Hidden for Room Only)
    if (this.dom.eventSpaceGroup) {
      this.dom.eventSpaceGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventSpaceSelect) {
      this.dom.eventSpaceSelect.required = isPublicEvent;
    }

    // 5. Event Date, Hours & Timing Matrix (Visible for Public & Locked, Hidden for Room Only because dates are defined per room row)
    if (this.dom.eventDateGroup) {
      this.dom.eventDateGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventDateInput) {
      this.dom.eventDateInput.required = !isRoomOnly;
    }
    if (this.dom.eventHourGroup) {
      this.dom.eventHourGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventDurationGroup) {
      this.dom.eventDurationGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventTimingGroup) {
      this.dom.eventTimingGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventRecurrenceGroup) {
      this.dom.eventRecurrenceGroup.style.display = isRoomOnly ? "none" : "block";
    }

    // 6. Promotional & Marketing fields (Only for Public Events)
    if (this.dom.eventPricingGroup) {
      this.dom.eventPricingGroup.style.display = isPublicEvent ? "block" : "none";
    }
    if (this.dom.eventEnrollGroup) {
      this.dom.eventEnrollGroup.style.display = isPublicEvent ? "block" : "none";
    }
    if (this.dom.eventFbCoverGroup) {
      this.dom.eventFbCoverGroup.style.display = isPublicEvent ? "block" : "none";
    }

    if (isLocked || isRoomOnly) {
      this.isFbImageValid = true;
    }

    // Update wizard structure and jump to step 1
    this.updateWizardConfig();
    this.setWizardStep(1);
  },
  populateSpaceSelect(selectedId = "") {
    if (!this.dom.eventSpaceSelect) return;
    this.dom.eventSpaceSelect.innerHTML = `<option value="">${this.t("event_space_none")}</option>`;
    (this.spaces || []).forEach(sp => {
      if (sp.enabled === false) return;
      const opt = document.createElement("option");
      opt.value = sp.id;
      opt.textContent = `${sp.name}${sp.capacity ? ` (${sp.capacity} locuri)` : ""}`;
      this.dom.eventSpaceSelect.appendChild(opt);
    });
    this.dom.eventSpaceSelect.value = selectedId || "";
  },
  handleToggleNeedsRoom(checked) {
    const isAllowed = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
    if (checked && !isAllowed) {
      this.notify(this.t("event_room_user_blocked_msg"), "info");
      if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
      return;
    }
    if (this.dom.eventRoomBookingPanel) {
      this.dom.eventRoomBookingPanel.style.display = checked ? "block" : "none";
    }
    if (this.dom.eventRoomCategoryBlock) {
      this.dom.eventRoomCategoryBlock.classList.toggle("is-active", checked);
    }
    if (checked && (!this.currentRoomBookings || this.currentRoomBookings.length === 0)) {
      const defDate = this.dom.eventDateInput?.value || new Date().toISOString().slice(0, 10);
      const firstRoomId = (this.rooms && this.rooms.find(r => r.enabled !== false))?.id || "";
      this.currentRoomBookings = [{ roomId: firstRoomId, startDate: defDate, endDate: defDate }];
      this.renderRoomBookingRows();
    }
  },
  renderRoomBookingRows() {
    if (!this.dom.eventRoomBookingsList) return;
    this.dom.eventRoomBookingsList.innerHTML = "";
    const availableRooms = (this.rooms || []).filter(r => r.enabled !== false);

    (this.currentRoomBookings || []).forEach((booking, idx) => {
      const row = document.createElement("div");
      row.className = "room-booking-row";
      row.innerHTML = `
        <div class="room-booking-field">
          <label>${this.t("event_room_label")}</label>
          <select class="form-select room-select" data-index="${idx}">
            <option value="">${this.t("event_room_select_placeholder")}</option>
            ${availableRooms.map(rm => `<option value="${rm.id}" ${rm.id === booking.roomId ? 'selected' : ''}>${this.escapeHtml(rm.name)} (${rm.type || 'Standard'}, ${rm.capacity || 2} locuri)</option>`).join("")}
          </select>
        </div>
        <div class="room-booking-field">
          <label>${this.t("event_room_checkin")}</label>
          <input type="date" class="form-input room-start-date" data-index="${idx}" value="${booking.startDate || ''}">
        </div>
        <div class="room-booking-field">
          <label>${this.t("event_room_checkout")}</label>
          <input type="date" class="form-input room-end-date" data-index="${idx}" value="${booking.endDate || booking.startDate || ''}">
        </div>
        <button type="button" class="btn-remove-room-booking" data-index="${idx}" title="${this.t("event_room_remove")}">
          <svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
        </button>
      `;

      row.querySelector(".room-select").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].roomId = e.target.value;
      });
      row.querySelector(".room-start-date").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].startDate = e.target.value;
        if (!this.currentRoomBookings[idx].endDate || this.currentRoomBookings[idx].endDate < e.target.value) {
          this.currentRoomBookings[idx].endDate = e.target.value;
          row.querySelector(".room-end-date").value = e.target.value;
        }
      });
      row.querySelector(".room-end-date").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].endDate = e.target.value;
      });
      row.querySelector(".btn-remove-room-booking").addEventListener("click", () => {
        this.handleRemoveRoomBookingRow(idx);
      });

      this.dom.eventRoomBookingsList.appendChild(row);
    });
  },
  handleAddRoomBookingRow(roomId = "", startDate = "", endDate = "") {
    const isAllowed = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
    if (!isAllowed) {
      this.notify(this.t("event_room_user_blocked_msg"), "info");
      return;
    }
    if (!this.currentRoomBookings) this.currentRoomBookings = [];
    const defDate = startDate || this.dom.eventDateInput?.value || new Date().toISOString().slice(0, 10);
    const defRoom = roomId || (this.rooms && this.rooms.find(r => r.enabled !== false))?.id || "";
    this.currentRoomBookings.push({
      roomId: defRoom,
      startDate: defDate,
      endDate: endDate || defDate
    });
    this.renderRoomBookingRows();
  },
  handleRemoveRoomBookingRow(idx) {
    if (!this.currentRoomBookings) return;
    this.currentRoomBookings.splice(idx, 1);
    if (this.currentRoomBookings.length === 0) {
      if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
      if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
      if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.remove("is-active");
    }
    this.renderRoomBookingRows();
  },
  checkRoomConflict(roomId, startDate, endDate, excludeEventId = null) {
    if (!roomId) return null;
    const targetStart = startDate;
    const targetEnd = endDate || startDate;

    return (this.events || []).find(e => {
      if (e.id === excludeEventId) return false;

      // Check multi-room bookings array if present
      if (Array.isArray(e.roomBookings) && e.roomBookings.length > 0) {
        const hasBookingConflict = e.roomBookings.some(rb => {
          if (rb.roomId !== roomId) return false;
          const rbStart = rb.startDate;
          const rbEnd = rb.endDate || rb.startDate;
          return targetStart <= rbEnd && targetEnd >= rbStart;
        });
        if (hasBookingConflict) return true;
      }

      // Check single roomId fallback
      if (e.roomId === roomId) {
        const eStart = e.startDate;
        const eEnd = e.endDate;
        return targetStart <= eEnd && targetEnd >= eStart;
      }

      return false;
    }) || null;
  }
};
