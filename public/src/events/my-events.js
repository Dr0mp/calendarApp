// My Events page and the event detail dialog.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const myEventsMethods = {
  updateMyEventsBadgeCount() {
    if (!this.currentUser) return;
    const ownEvents = (this.events || []).filter(e => e.creatorId === this.currentUser.id || e.creatorUsername === this.currentUser.username);
    const countStr = String(ownEvents.length);
    if (this.dom.navMyEventsCountBadge) {
      this.dom.navMyEventsCountBadge.textContent = countStr;
      this.dom.navMyEventsCountBadge.style.display = ownEvents.length > 0 ? "inline-flex" : "none";
    }
    if (this.dom.myEventsTotalBadge) {
      this.dom.myEventsTotalBadge.textContent = countStr;
    }
  },
  renderMyEventsPage() {
    if (!this.dom.myEventsListContainer || !this.currentUser) return;
    this.updateMyEventsBadgeCount();

    const filterRoomBtn = document.getElementById("filter-my-events-room");
    if (filterRoomBtn) {
      filterRoomBtn.style.display = this.canBookRooms() ? "inline-flex" : "none";
    }
    if (!this.canBookRooms() && this.myEventsActiveFilter === "room_only") {
      this.myEventsActiveFilter = "all";
      document.querySelectorAll("#my-events-filter-tabs .btn-filter-tab").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-filter") === "all");
      });
    }

    const activeFilter = this.myEventsActiveFilter || "all";
    const searchQuery = (this.dom.myEventsSearchInput?.value || "").trim().toLowerCase();

    // 1. Filter own events
    let ownEvents = (this.events || []).filter(event => {
      const isOwner = event.creatorId === this.currentUser.id || event.creatorUsername === this.currentUser.username;
      return isOwner;
    });

    // 2. Type filter
    if (activeFilter !== "all") {
      ownEvents = ownEvents.filter(event => {
        const type = event.entryType || (event.roomId && !event.spaceId ? "room_only" : "event");
        return type === activeFilter;
      });
    }

    // 3. Search query
    if (searchQuery) {
      ownEvents = ownEvents.filter(event => {
        const title = (event.title || "").toLowerCase();
        const desc = (event.description || "").toLowerCase();
        const space = (this.spaces || []).find(s => s.id === event.spaceId)?.name?.toLowerCase() || "";
        const rooms = (this.rooms || []).filter(r => (event.roomBookings || []).some(rb => rb.roomId === r.id) || event.roomId === r.id).map(r => r.name.toLowerCase()).join(" ");
        return title.includes(searchQuery) || desc.includes(searchQuery) || space.includes(searchQuery) || rooms.includes(searchQuery);
      });
    }

    // 4. Sort: Chronological (Upcoming first, then past)
    ownEvents.sort((a, b) => {
      const dateA = a.startDate || "";
      const dateB = b.startDate || "";
      const timeA = a.hour || "00:00";
      const timeB = b.hour || "00:00";
      return `${dateA} ${timeA}`.localeCompare(`${dateB} ${timeB}`);
    });

    this.dom.myEventsListContainer.innerHTML = "";

    if (ownEvents.length === 0) {
      const isFiltered = activeFilter !== "all" || searchQuery.length > 0;
      this.dom.myEventsListContainer.innerHTML = `
        <div class="my-events-empty-state">
          <div class="my-events-empty-icon">${this.icon("calendar")}</div>
          <h3 class="u-text-lg u-fw-700 u-mt-0 u-mr-0 u-mb-0 u-ml-0">${isFiltered ? this.t("my_events_no_results") : this.t("my_events_empty_title")}</h3>
          <p class="u-color-muted u-text-sm u-maxw-420 u-mt-0 u-mr-0 u-mb-0 u-ml-0">${isFiltered ? "" : this.t("my_events_empty_sub")}</p>
          ${!isFiltered ? `
            <button type="button" class="btn btn-primary u-mt-8" id="btn-empty-create-event">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
              <span>${this.t("my_events_create_new")}</span>
            </button>
          ` : ""}
        </div>
      `;
      const emptyBtn = document.getElementById("btn-empty-create-event");
      if (emptyBtn) {
        emptyBtn.addEventListener("click", () => {
          this.eventsLayoutMode = "schedule";
          this.setAppView("events");
          this.openScheduleEventPage();
        });
      }
      return;
    }

    ownEvents.forEach(event => {
      const type = event.entryType || (event.roomId && !event.spaceId ? "room_only" : "event");
      let typeLabel = this.t("event_type_event");
      let typeClass = "type-event";
      if (type === "room_only") {
        typeLabel = this.t("event_type_room_only");
        typeClass = "type-room_only";
      } else if (type === "locked") {
        typeLabel = this.t("event_type_locked");
        typeClass = "type-locked";
      }

      const dateStr = event.startDate;
      const hourStr = event.hour || "18:00";
      const durationStr = event.durationHours ? `${event.durationHours}h` : "2h";
      
      const spaceObj = (this.spaces || []).find(s => s.id === event.spaceId);
      const spaceName = spaceObj ? spaceObj.name : null;

      // Accommodation room summary
      let roomsSummary = null;
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const roomNames = event.roomBookings.map(rb => {
          const rm = (this.rooms || []).find(r => r.id === rb.roomId);
          return rm ? rm.name : "Cameră";
        });
        roomsSummary = roomNames.join(", ");
      } else if (event.roomId) {
        const rm = (this.rooms || []).find(r => r.id === event.roomId);
        roomsSummary = rm ? rm.name : "Cameră";
      }

      const card = document.createElement("div");
      card.className = "my-event-card";

      card.innerHTML = `
        <div>
          <div class="my-event-card-header">
            <span class="my-event-card-type ${typeClass}">${typeLabel}</span>
            <span class="my-event-card-date">
              <svg class="ui-icon u-w-13 u-h-13" aria-hidden="true"><use href="#icon-calendar"></use></svg>
              ${dateStr} ${type !== "room_only" ? `• ${hourStr} (${durationStr})` : ""}
            </span>
          </div>

          <h3 class="my-event-card-title">${this.escapeHtml(event.title)}</h3>

          <div class="my-event-card-meta u-mt-10">
            ${spaceName ? `
              <div class="my-event-card-meta-item">
                <span>${this.icon("map-pin")}</span>
                <strong class="u-color-primary">${this.escapeHtml(spaceName)}</strong>
              </div>
            ` : ""}
            ${roomsSummary ? `
              <div class="my-event-card-meta-item">
                <svg class="ui-icon u-w-13 u-h-13 u-color-purple-400" aria-hidden="true"><use href="#icon-bed"></use></svg>
                <span class="u-color-purple-400 u-fw-600">${this.escapeHtml(roomsSummary)}</span>
              </div>
            ` : ""}
            ${type === "event" && event.price ? `
              <div class="my-event-card-meta-item">
                <span>${this.icon("ticket")}</span>
                <span>${this.escapeHtml(this.formatEventPrice(event))}</span>
              </div>
            ` : ""}
          </div>

          ${event.description ? `
            <div class="my-event-card-desc u-mt-8">${this.escapeHtml(event.description)}</div>
          ` : ""}
        </div>

        <div class="my-event-card-footer">
          <div class="u-flex u-gap-6 u-wrap">
            <button type="button" class="btn btn-secondary btn-sm btn-my-event-edit">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-sparkle"></use></svg>
              <span>${this.t("event_detail_edit_btn")}</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-my-event-view">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>
              <span>${this.t("event_detail_title")}</span>
            </button>
          </div>
          <button type="button" class="btn btn-danger btn-sm btn-my-event-delete" title="${this.t("event_detail_delete_btn")}" aria-label="${this.t("event_detail_delete_btn")}">
            <svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      `;

      card.querySelector(".btn-my-event-edit")?.addEventListener("click", () => {
        this.openEditEventModal(event.id);
      });
      card.querySelector(".btn-my-event-view")?.addEventListener("click", () => {
        this.openEventDetailModal(event.id);
      });
      card.querySelector(".btn-my-event-delete")?.addEventListener("click", () => {
        this.currentDetailEventId = event.id;
        this.deleteCurrentDetailEvent();
      });

      this.dom.myEventsListContainer.appendChild(card);
    });
  },
  openEventDetailModal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;

    this.currentDetailEventId = eventId;
    const canModify = this.canEditEvent(event);

    const isMultiDay = event.startDate && event.endDate && event.startDate !== event.endDate;
    if (this.dom.eventDetailDaysBadge) {
      this.dom.eventDetailDaysBadge.textContent = isMultiDay ? `${this.t("event_detail_multi_day")} (${event.startDate} – ${event.endDate})` : `${this.t("event_detail_single_day")} (${event.startDate})`;
    }

    const isLocked = event.entryType === "locked";
    const isRoomOnly = event.entryType === "room_only";

    if (this.dom.eventDetailTypeBadge) {
      if (isLocked) {
        this.dom.eventDetailTypeBadge.style.display = "inline-flex";
        this.dom.eventDetailTypeBadge.innerHTML = `${this.icon("lock")} ${this.escapeHtml(this.t("entry_type_locked"))}`;
      } else if (isRoomOnly) {
        this.dom.eventDetailTypeBadge.style.display = "inline-flex";
        this.dom.eventDetailTypeBadge.innerHTML = `${this.icon("bed")} ${this.escapeHtml(this.t("entry_type_room_only"))}`;
      } else {
        this.dom.eventDetailTypeBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailSpaceBadge) {
      if (event.spaceId) {
        const space = (this.spaces || []).find(s => s.id === event.spaceId);
        this.dom.eventDetailSpaceBadge.style.display = "inline-flex";
        this.dom.eventDetailSpaceBadge.innerHTML = `${this.icon("map-pin")} ${this.escapeHtml(space ? space.name : event.spaceId)}`;
      } else {
        this.dom.eventDetailSpaceBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailRoomBadge) {
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const roomNames = event.roomBookings.map(b => {
          const rm = (this.rooms || []).find(r => r.id === b.roomId);
          return rm ? rm.name : b.roomId;
        }).join(", ");
        this.dom.eventDetailRoomBadge.style.display = "inline-flex";
        this.dom.eventDetailRoomBadge.innerHTML = `${this.icon("bed")} ${this.escapeHtml(roomNames)}`;
      } else if (event.roomId) {
        const room = (this.rooms || []).find(r => r.id === event.roomId);
        this.dom.eventDetailRoomBadge.style.display = "inline-flex";
        this.dom.eventDetailRoomBadge.innerHTML = `${this.icon("bed")} ${this.escapeHtml(room ? room.name : event.roomId)}`;
      } else {
        this.dom.eventDetailRoomBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailRecurrentBadge) {
      if (event.isRecurrent) {
        this.dom.eventDetailRecurrentBadge.style.display = "inline-flex";
        this.dom.eventDetailRecurrentBadge.textContent = this.tf("event_recurrent_badge", { index: event.recurrenceIndex || 1, total: event.recurrenceTotal || event.recurrenceMonths || 1 });
      } else {
        this.dom.eventDetailRecurrentBadge.style.display = "none";
      }
    }

    this.dom.eventDetailCreatorPill.textContent = `${this.t("event_scheduled_by_label")}: ${event.creatorName || event.creatorUsername}`;
    this.dom.eventDetailHeading.textContent = event.title;

    const dateRangeStr = isMultiDay ? `${event.startDate} – ${event.endDate}` : `${event.startDate}`;
    const durStr = `${event.durationHours || 2}h`;
    this.dom.eventDetailDatetime.textContent = `${dateRangeStr}, ${event.hour || '18:00'} (${durStr})`;

    if (this.dom.eventDetailPriceItem) {
      this.dom.eventDetailPriceItem.style.display = (isLocked || isRoomOnly) ? "none" : "flex";
    }
    if (this.dom.eventDetailPrice) {
      this.dom.eventDetailPrice.textContent = this.formatEventPrice(event);
    }

    if (this.dom.eventDetailSpaceItem && this.dom.eventDetailSpaceText) {
      if (event.spaceId) {
        const space = (this.spaces || []).find(s => s.id === event.spaceId);
        this.dom.eventDetailSpaceItem.style.display = "flex";
        this.dom.eventDetailSpaceText.textContent = space ? `${space.name}${space.capacity ? ` (${space.capacity} locuri)` : ''}` : event.spaceId;
      } else {
        this.dom.eventDetailSpaceItem.style.display = "none";
      }
    }

    if (this.dom.eventDetailRoomItem && this.dom.eventDetailRoomText) {
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const listStr = event.roomBookings.map(b => {
          const rm = (this.rooms || []).find(r => r.id === b.roomId);
          const name = rm ? rm.name : b.roomId;
          return `${name} (${b.startDate} – ${b.endDate})`;
        }).join("; ");
        this.dom.eventDetailRoomItem.style.display = "flex";
        this.dom.eventDetailRoomText.textContent = listStr;
      } else if (event.roomId) {
        const room = (this.rooms || []).find(r => r.id === event.roomId);
        this.dom.eventDetailRoomItem.style.display = "flex";
        this.dom.eventDetailRoomText.textContent = room ? `${room.name} (${room.type || 'Cazare'})` : event.roomId;
      } else {
        this.dom.eventDetailRoomItem.style.display = "none";
      }
    }

    // Privacy protection on private/locked entries
    const canViewPrivateDesc = !isLocked || (this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator' || this.currentUser.id === event.creatorId || this.currentUser.username === event.creatorUsername));
    if (!canViewPrivateDesc) {
      this.dom.eventDetailDesc.textContent = this.t("event_private_desc_hidden");
      this.dom.eventDetailDesc.style.fontStyle = "italic";
      this.dom.eventDetailDesc.style.opacity = "0.75";
    } else {
      this.dom.eventDetailDesc.textContent = event.description || this.t("event_no_notes");
      this.dom.eventDetailDesc.style.fontStyle = "normal";
      this.dom.eventDetailDesc.style.opacity = "1";
    }

    // Facebook Page Cover presentation
    if (this.dom.eventDetailFbContainer && this.dom.eventDetailFbImage) {
      if (event.facebookImage && !isLocked && !isRoomOnly) {
        this.dom.eventDetailFbImage.src = event.facebookImage;
        this.dom.eventDetailFbContainer.style.display = "block";
      } else {
        this.dom.eventDetailFbContainer.style.display = "none";
      }
    }

    // Enrolment link button
    if (this.dom.eventDetailEnrollWrap && this.dom.eventDetailEnrollBtn) {
      if (event.enrollLink && !isLocked && !isRoomOnly) {
        this.dom.eventDetailEnrollBtn.href = event.enrollLink;
        this.dom.eventDetailEnrollWrap.style.display = "block";
      } else {
        this.dom.eventDetailEnrollWrap.style.display = "none";
      }
    }

    if (canModify) {
      this.dom.eventDetailEditBtn.style.display = "inline-flex";
      this.dom.eventDetailDeleteBtn.style.display = "inline-flex";
      this.dom.eventPermissionNotice.style.display = "none";
    } else {
      this.dom.eventDetailEditBtn.style.display = "none";
      this.dom.eventDetailDeleteBtn.style.display = "none";
      this.dom.eventPermissionNotice.style.display = "flex";
      this.dom.eventPermissionNotice.innerHTML = `<span>${this.tf("event_view_only_by", { name: `<strong>${this.escapeHtml(event.creatorName || event.creatorUsername)}</strong>` })}</span>`;
    }

    this.dom.eventDetailDialog.showModal();
  },
  deleteCurrentDetailEvent() {
    const event = this.events.find(e => e.id === this.currentDetailEventId);
    if (!event) return;

    if (!this.canEditEvent(event)) {
      alert(this.t("alert_permission_denied"));
      return;
    }

    if (event.isRecurrent && event.recurrenceGroupId) {
      const related = this.events.filter(e => e.recurrenceGroupId === event.recurrenceGroupId);
      if (related.length > 1) {
        const deleteAll = confirm(
          this.t("confirm_delete_recurring_series").replace("${title}", event.title).replace("${total}", event.recurrenceTotal).replace("${count}", related.length).replace("${date}", event.startDate)
        );
        if (deleteAll) {
          this.events = this.events.filter(e => e.recurrenceGroupId !== event.recurrenceGroupId);
        } else {
          this.events = this.events.filter(e => e.id !== event.id);
        }
        this.saveEvents();
        this.updateSocialNotificationBadge();
        this.renderMyEventsPage();
        this.dom.eventDetailDialog.close();
        this.renderEventsCalendar();
        if (this.activeApp === "admin") {
          this.renderAdminPanel();
        }
        return;
      }
    }

    if (confirm(this.t("confirm_delete_event").replace("${title}", event.title))) {
      this.events = this.events.filter(e => e.id !== event.id);
      this.saveEvents();
      this.updateSocialNotificationBadge();
      this.renderMyEventsPage();
      this.dom.eventDetailDialog.close();
      this.renderEventsCalendar();
      if (this.activeApp === "admin") {
        this.renderAdminPanel();
      }
    }
  }
};
