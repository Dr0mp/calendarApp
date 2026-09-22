// Promotion queue: events waiting to be turned into social posts.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const notificationMethods = {
  // =========================================================================
  // SOCIAL CALENDAR: EVENT NOTIFICATIONS & PROMOTION POST GENERATOR
  // =========================================================================
  updateSocialNotificationBadge() {
    const pendingEvents = this.events.filter(e => !e.socialStatus || e.socialStatus === "pending");
    const promotedEvents = this.events.filter(e => e.socialStatus === "promoted");
    const count = pendingEvents.length;

    if (this.dom.socialNotificationsCount) {
      this.dom.socialNotificationsCount.textContent = count;
      if (count > 0) {
        this.dom.socialNotificationsCount.classList.add("has-pending");
      } else {
        this.dom.socialNotificationsCount.classList.remove("has-pending");
      }
    }

    if (this.dom.notifCountAll) this.dom.notifCountAll.textContent = this.events.length;
    if (this.dom.notifCountPending) this.dom.notifCountPending.textContent = pendingEvents.length;
    if (this.dom.notifCountPromoted) this.dom.notifCountPromoted.textContent = promotedEvents.length;
  },
  openSocialNotificationsModal() {
    this.updateSocialNotificationBadge();
    this.renderSocialNotifications();
    this.dom.socialNotificationsModal.showModal();
  },
  renderSocialNotifications() {
    if (!this.dom.socialNotificationsList) return;
    this.dom.socialNotificationsList.innerHTML = "";

    let list = [...this.events];
    if (this.notifFilter === "pending") {
      list = list.filter(e => !e.socialStatus || e.socialStatus === "pending");
    } else if (this.notifFilter === "promoted") {
      list = list.filter(e => e.socialStatus === "promoted");
    }

    // Sort newest / upcoming first
    list.sort((a, b) => new Date(`${b.startDate}T${b.hour || '00:00'}`) - new Date(`${a.startDate}T${a.hour || '00:00'}`));

    if (list.length === 0) {
      this.dom.socialNotificationsList.innerHTML = `
        <div class="notif-empty-state">
          <div>${this.t("notif_no_events")}</div>
          <p>${this.t("notif_no_events_detail")}</p>
        </div>
      `;
      return;
    }

    list.forEach(evt => {
      const isPromoted = evt.socialStatus === "promoted";
      const card = document.createElement("div");
      card.className = `event-notification-card ${isPromoted ? 'is-promoted' : 'is-pending'}`;
      
      const eventDate = evt.startDate;
      const eventTime = evt.hour;
      const eventLength = evt.durationHours ? `${evt.durationHours}h` : "";
      const dateParts = [eventDate, eventTime, eventLength].filter(Boolean).join(" · ");
      const creator = evt.creatorName || evt.creatorUsername || "Mentor";
      const status = isPromoted ? this.t("promo_posted") : this.t("promo_pending");

      card.innerHTML = `
        <div class="notif-card-main">
          <div class="notif-card-title-row">
            <div class="notif-title">${this.escapeHtml(evt.title)}</div>
            ${this.notifFilter === "all" ? `
          <span class="promo-status-badge ${isPromoted ? 'is-promoted' : 'is-pending'}">
            ${status}
          </span>` : ""}
          </div>
          <div class="notif-meta">
            <span>${this.escapeHtml(dateParts)}</span>
            <span>${this.escapeHtml(creator)}</span>
            ${evt.price ? `<span>${this.escapeHtml(this.formatEventPrice(evt))}</span>` : ""}
          </div>
        </div>
        <div class="notif-card-action">
          ${isPromoted
            ? `<button class="btn btn-secondary btn-sm btn-re-promote" data-id="${evt.id}">${this.t("notif_create_another")}</button>`
            : `<button class="btn btn-primary btn-sm btn-promote-event" data-id="${evt.id}">${this.t("notif_create_post")}</button>`}
        </div>
      `;

      const promoteBtn = card.querySelector(".btn-promote-event") || card.querySelector(".btn-re-promote");
      if (promoteBtn) {
        promoteBtn.addEventListener("click", () => {
          this.generateSocialPostFromEvent(evt.id);
        });
      }

      this.dom.socialNotificationsList.appendChild(card);
    });
  },
  generateSocialPostFromEvent(eventId) {
    const evt = this.events.find(e => e.id === eventId);
    if (!evt) return;

    // If notifications modal is open, close it
    if (this.dom.socialNotificationsModal && this.dom.socialNotificationsModal.open) {
      this.dom.socialNotificationsModal.close();
    }

    // Switch to social view if not currently active
    if (this.activeApp !== "social") {
      this.setAppView("social");
    }

    // Prepare campaign marketing copy
    const title = `🚀 ${this.tf("promo_upcoming", { title: evt.title })}`;
    const dateStr = evt.startDate;
    const timeStr = evt.hour || "18:00";
    const priceStr = evt.price ? this.formatEventPrice(evt) : this.t("promo_free_access");
    const enrollStr = evt.enrollLink ? `\n\n🔗 ${this.t("promo_reserve")}: ${evt.enrollLink}` : "";
    const mentorStr = evt.creatorName ? this.tf("promo_hosted_by", { name: evt.creatorName }) : "";
    
    let description = `${title}\n${mentorStr ? mentorStr + '\n' : ''}\n📅 ${this.t("promo_date")}: ${dateStr}, ${timeStr}\n🎟️ ${this.t("promo_admission")}: ${priceStr}${enrollStr}`;
    if (evt.description) {
      description += `\n\n${this.t("promo_about")}:\n${evt.description}`;
    }

    this.openAddPostModal(dateStr, {
      eventId: evt.id,
      title: title,
      description: description,
      date: dateStr,
      time: timeStr,
      mediaUrl: evt.facebookImage
    });
  }
};
