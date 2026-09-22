// Platform control panel, standards matrix, import/export.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { DEFAULT_PLATFORMS, INITIAL_POSTS } from "../data/seed-data.js";
import { STORAGE_PLATFORMS_KEY, STORAGE_POSTS_KEY } from "../constants.js";

export const controlPanelMethods = {
  // Control Panel Handling
  openControlPanelModal() {
    this.renderControlPanelPlatformsList();
    this.dom.controlPanelDialog.showModal();
  },
  renderControlPanelPlatformsList() {
    this.dom.cpPlatformsList.innerHTML = "";

    this.platforms.forEach((platform, pIdx) => {
      const card = document.createElement("div");
      const isEnabled = platform.enabled !== false;
      card.className = `cp-platform-card ${isEnabled ? "" : "is-disabled"}`;

      const iconSrc = this.getPlatformIcon(platform);
      card.innerHTML = `
        <div class="cp-platform-header">
          <div class="cp-platform-title">
            <img class="platform-favicon-lg" src="${iconSrc}" alt="" data-fallback="hide">
            <span>${platform.name}</span>
          </div>
          <div class="u-flex u-items-center u-gap-10 u-wrap">
            <label class="cp-platform-toggle-label" title="${this.t("cp_toggle_title")}">
              <span class="cp-platform-status-text">${isEnabled ? this.t("cp_status_active") : this.t("cp_status_disabled")}</span>
              <div class="toggle-switch">
                <input type="checkbox" class="cp-platform-enable-toggle" data-pid="${platform.id}" ${isEnabled ? "checked" : ""}>
                <span class="slider"></span>
              </div>
            </label>
            <button class="btn btn-secondary btn-sm cp-add-pt-btn" data-pid="${platform.id}">+ ${this.t("cp_add_post_type")}</button>
            ${this.platforms.length > 1 ? `<button class="btn btn-danger btn-sm cp-delete-platform-btn" data-pid="${platform.id}">${this.t("cp_remove")}</button>` : ""}
          </div>
        </div>
        <p class="u-text-2xs u-color-muted u-mb-8">${platform.description || this.t("cp_default_description")}</p>
        <div class="cp-posttypes-container" id="cp-pt-container-${platform.id}"></div>
      `;

      // Slider toggle for enable / disable
      const toggleCheckbox = card.querySelector(".cp-platform-enable-toggle");
      const statusText = card.querySelector(".cp-platform-status-text");
      toggleCheckbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        platform.enabled = checked;
        statusText.textContent = checked ? this.t("cp_status_active") : this.t("cp_status_disabled");
        card.classList.toggle("is-disabled", !checked);
        this.savePlatforms();
        this.render();
      });

      const ptContainer = card.querySelector(`#cp-pt-container-${platform.id}`);

      platform.postTypes.forEach((pt, ptIdx) => {
        const ptItem = document.createElement("div");
        ptItem.className = "cp-posttype-item";

        ptItem.innerHTML = `
          <div>
            <label class="u-text-3xs u-color-muted u-block">${this.t("cp_type_name")}</label>
            <input type="text" class="cp-input-sm cp-edit-pt-name" value="${this.escapeHtml(pt.name)}">
          </div>
          <div>
            <label class="u-text-3xs u-color-muted u-block">${this.t("cp_aspect_ratio")}</label>
            <input type="text" class="cp-input-sm cp-edit-pt-ratio" value="${this.escapeHtml(pt.aspectRatio)}">
          </div>
          <div>
            <label class="u-text-3xs u-color-muted u-block">${this.t("cp_width")}</label>
            <input type="number" class="cp-input-sm cp-edit-pt-width" value="${pt.recommendedWidth}">
          </div>
          <div>
            <label class="u-text-3xs u-color-muted u-block">${this.t("cp_height")}</label>
            <input type="number" class="cp-input-sm cp-edit-pt-height" value="${pt.recommendedHeight}">
          </div>
          <div>
            <label class="u-text-3xs u-color-muted u-block">${this.t("cp_action")}</label>
            <button type="button" class="btn btn-danger btn-sm cp-delete-pt-btn" title="${this.t("cp_delete_post_type")}">&times;</button>
          </div>
        `;

        // Live input bindings to update state
        ptItem.querySelector(".cp-edit-pt-name").addEventListener("change", (e) => {
          pt.name = e.target.value.trim();
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-ratio").addEventListener("change", (e) => {
          pt.aspectRatio = e.target.value.trim();
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-width").addEventListener("change", (e) => {
          pt.recommendedWidth = parseInt(e.target.value, 10) || 1080;
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-height").addEventListener("change", (e) => {
          pt.recommendedHeight = parseInt(e.target.value, 10) || 1920;
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-delete-pt-btn").addEventListener("click", () => {
          if (platform.postTypes.length <= 1) {
            this.notify(this.t("alert_posttype_required"), "danger");
            return;
          }
          platform.postTypes.splice(ptIdx, 1);
          this.savePlatforms();
          this.renderControlPanelPlatformsList();
        });

        ptContainer.appendChild(ptItem);
      });

      // Add post type button
      card.querySelector(".cp-add-pt-btn").addEventListener("click", async () => {
        const typeName = await this.promptDialog(this.t("cp_new_post_type_prompt"));
        if (typeName) {
          platform.postTypes.push({
            id: `${platform.id}-custom-${Date.now()}`,
            name: typeName.trim(),
            mediaType: "photo",
            aspectRatio: "1:1",
            recommendedWidth: 1080,
            recommendedHeight: 1080,
            format: "JPG / PNG / MP4",
            maxDuration: "Standard",
            maxFileSize: "25 MB",
            safeZone: "Centered content",
            captionLimit: 2200
          });
          this.savePlatforms();
          this.renderControlPanelPlatformsList();
        }
      });

      // Remove platform
      const deletePlatformBtn = card.querySelector(".cp-delete-platform-btn");
      if (deletePlatformBtn) {
        deletePlatformBtn.addEventListener("click", async () => {
          if (await this.confirmDialog(this.t("confirm_remove_platform").replace("${name}", platform.name))) {
            this.platforms = this.platforms.filter(p => p.id !== platform.id);
            this.savePlatforms();
            this.renderControlPanelPlatformsList();
            this.render();
          }
        });
      }

      this.dom.cpPlatformsList.appendChild(card);
    });
  },
  handleAddPlatform(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_save"), "warning");
      return;
    }
    const name = this.dom.newPlatformName.value.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + `-${Date.now().toString().slice(-4)}`;
    const color = this.dom.newPlatformColor.value || "#3b82f6";
    const domain = this.dom.newPlatformDomain ? this.dom.newPlatformDomain.value.trim() : "";
    const iconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
    const desc = this.dom.newPlatformDesc.value.trim() || `${name} content`;

    const newPlatform = {
      id: id,
      name: name,
      domain: domain,
      iconUrl: iconUrl,
      enabled: true,
      color: color,
      accentColor: color,
      icon: "custom",
      description: desc,
      postTypes: [
        {
          id: `${id}-standard`,
          name: "Standard Post (1:1 / 4:5)",
          mediaType: "photo",
          aspectRatio: "4:5",
          recommendedWidth: 1080,
          recommendedHeight: 1350,
          format: "JPG / PNG / MP4",
          maxDuration: "Standard",
          maxFileSize: "30 MB",
          safeZone: "Full screen safe zone",
          captionLimit: 2200
        },
        {
          id: `${id}-video`,
          name: "Vertical Video (9:16)",
          mediaType: "video",
          aspectRatio: "9:16",
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          format: "MP4 / MOV",
          maxDuration: "60s",
          maxFileSize: "250 MB",
          safeZone: "9:16 mobile view",
          captionLimit: 2200
        }
      ]
    };

    this.platforms.push(newPlatform);
    this.savePlatforms();
    this.dom.addPlatformForm.reset();
    this.renderControlPanelPlatformsList();
    this.render();
    this.notify((this.t("alert_platform_added")).replace("${name}", name), "success");
  },
  async resetAllDefaults() {
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_save"), "warning");
      return;
    }
    if (await this.confirmDialog(this.t("confirm_reset_platforms"))) {
      localStorage.removeItem(STORAGE_PLATFORMS_KEY);
      localStorage.removeItem(STORAGE_POSTS_KEY);
      this.platforms = JSON.parse(JSON.stringify(DEFAULT_PLATFORMS));
      this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
      this.savePlatforms();
      this.savePosts();
      this.renderControlPanelPlatformsList();
      this.render();
      this.notify(this.t("alert_reset_complete"), "success");
    }
  },
  exportData() {
    const backup = {
      version: "2026.1",
      exportedAt: new Date().toISOString(),
      platforms: this.platforms,
      posts: this.posts
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social-calendar-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  importData(e) {
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_save"), "warning");
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.platforms && Array.isArray(data.platforms)) {
          this.platforms = data.platforms.map(p => {
            if (p.enabled === undefined) p.enabled = true;
            return p;
          });
          this.savePlatforms();
        }
        if (data.posts && Array.isArray(data.posts)) {
          this.posts = data.posts;
          this.savePosts();
        }
        this.renderControlPanelPlatformsList();
        this.render();
        this.notify(this.t("alert_import_success"), "success");
      } catch (err) {
        this.notify(this.t("alert_import_fail"), "danger");
      }
    };
    reader.readAsText(file);
  },
  // 2026 Aggregated Standards Matrix Modal
  openStandardsModal() {
    this.dom.standardsTableBody.innerHTML = "";

    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);
    if (enabledPlatforms.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="u-text-center u-color-muted u-pt-24 u-pr-24 u-pb-24 u-pl-24" colspan="6">${this.t("standards_no_platforms")}</td>`;
      this.dom.standardsTableBody.appendChild(tr);
      this.dom.standardsDialog.showModal();
      return;
    }

    enabledPlatforms.forEach(platform => {
      const iconSrc = this.getPlatformIcon(platform);
      platform.postTypes.forEach(pt => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <span class="platform-pill-badge" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: ${platform.color};">
              <img class="platform-favicon" src="${iconSrc}" alt="" data-fallback="hide">
              ${platform.name}
            </span>
          </td>
          <td><strong>${pt.name}</strong></td>
          <td><span class="standards-badge-ratio">${pt.aspectRatio}</span></td>
          <td><code class="u-color-primary u-font-mono">${pt.recommendedWidth} × ${pt.recommendedHeight} px</code></td>
          <td class="u-color-secondary u-text-2xs">${pt.format}</td>
          <td class="u-color-muted u-text-2xs">${pt.safeZone || "Centered"}</td>
        `;
        this.dom.standardsTableBody.appendChild(tr);
      });
    });

    this.dom.standardsDialog.showModal();
  }
};
