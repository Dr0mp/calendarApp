// Create/edit/view social posts, media and share links.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const postEditorMethods = {
  // Post Creator / Editor Dialog Handling
  openAddPostModal(preselectedDate = null, prefillData = null) {
    const requestedDate = prefillData?.date || preselectedDate;
    if (requestedDate && this.isPastEventDate(requestedDate)) {
      this.notify(this.t("post_past_create_unavailable"), "warning");
      return;
    }
    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);
    if (enabledPlatforms.length === 0) {
      this.notify(this.t("alert_platforms_disabled"), "info");
      return;
    }

    this.dom.postEditId.value = "";
    this.dom.postDialogActionText.textContent = this.t(prefillData ? "post_dialog_promote_title" : "post_dialog_new_title");
    this.dom.postForm.reset();

    // Track if this post is linked to an event promotion
    this.eventPendingPromotionId = prefillData && prefillData.eventId ? prefillData.eventId : null;

    // Populate Platform Dropdown
    this.populatePlatformSelect();

    // If prefill requests a specific platform or default to facebook, apply it
    if (prefillData && prefillData.platformId) {
      this.dom.postPlatformSelect.value = prefillData.platformId;
    } else if (prefillData && this.getPlatform("facebook") && this.getPlatform("facebook").enabled !== false) {
      this.dom.postPlatformSelect.value = "facebook";
    } else if (this.selectedPlatformId !== "all") {
      const currentSelected = this.getPlatform(this.selectedPlatformId);
      if (currentSelected && currentSelected.enabled !== false) {
        this.dom.postPlatformSelect.value = this.selectedPlatformId;
      }
    }

    this.onPlatformSelectChanged();

    // Date & Time
    if (prefillData && prefillData.date) {
      this.dom.postDateInput.value = prefillData.date;
      this.dom.postTimeInput.value = prefillData.time || "12:00";
    } else if (preselectedDate) {
      this.dom.postDateInput.value = preselectedDate;
    } else {
      const preferredDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, "0")}-15`;
      const defaultDate = this.isPastEventDate(preferredDate) ? this.getTodayDateString() : preferredDate;
      this.dom.postDateInput.value = defaultDate;
    }

    // Prefill Title, Description & Media
    if (prefillData) {
      if (prefillData.title) this.dom.postTitleInput.value = prefillData.title;
      if (prefillData.description) this.dom.postDescInput.value = prefillData.description;
      if (prefillData.status) this.dom.postStatusSelect.value = prefillData.status;

      if (prefillData.mediaUrl) {
        this.setPostMedia({
          type: "photo",
          url: prefillData.mediaUrl,
          name: "event-cover-16x9.jpg",
          aspectRatio: "16:9",
          count: 1
        });
      } else {
        this.clearPostMedia();
      }
    } else {
      this.clearPostMedia();
    }

    if (this.dom.postShareLink) {
      this.dom.postShareLink.value = (prefillData && prefillData.shareLink) ? prefillData.shareLink : "";
    }

    this.updateLiveSpecHelper();
    this.updateCaptionCounter();
    this.dom.postDialog.showModal();
  },
  clearPostMedia() {
    this.currentPostMedia = null;
    this.dom.previewImg.style.display = "none";
    this.dom.previewImg.src = "";
    this.dom.previewVideo.style.display = "none";
    this.dom.previewVideo.src = "";
    this.dom.previewMediaName.textContent = this.t("post_no_media");
    this.dom.previewAspectPill.textContent = this.t("post_awaiting_upload");
  },
  openEditPostModal(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    this.dom.postEditId.value = post.id;
    this.dom.postDialogActionText.textContent = this.t("post_dialog_edit_title");
    this.populatePlatformSelect(post.platformId);

    this.dom.postPlatformSelect.value = post.platformId;
    this.onPlatformSelectChanged();

    this.dom.postTypeSelect.value = post.postTypeId;
    this.updateLiveSpecHelper();

    this.dom.postDateInput.value = post.date;
    this.dom.postTimeInput.value = post.time || "12:00";
    this.dom.postTitleInput.value = post.title || "";
    this.dom.postDescInput.value = post.description || "";
    this.dom.postStatusSelect.value = post.status || "scheduled";
    if (this.dom.postShareLink) {
      this.dom.postShareLink.value = post.shareLink || "";
    }

    // Media
    this.setPostMedia({
      type: post.mediaType,
      url: post.mediaUrl,
      name: (post.mediaNames && post.mediaNames[0]) || "media-file",
      aspectRatio: post.aspectRatio || "9:16",
      count: post.mediaCount || 1
    });

    this.updateCaptionCounter();
    this.dom.postDialog.showModal();
  },
  populatePlatformSelect(includePlatformId = null) {
    this.dom.postPlatformSelect.innerHTML = "";
    const platformsToShow = this.platforms.filter(p => p.enabled !== false || p.id === includePlatformId);
    platformsToShow.forEach(platform => {
      const opt = document.createElement("option");
      opt.value = platform.id;
      opt.textContent = platform.name + (platform.enabled === false ? ` (${this.t("cp_status_disabled")})` : "");
      this.dom.postPlatformSelect.appendChild(opt);
    });
  },
  onPlatformSelectChanged() {
    const platformId = this.dom.postPlatformSelect.value;
    const platform = this.getPlatform(platformId);
    this.dom.postTypeSelect.innerHTML = "";

    if (platform && platform.postTypes) {
      platform.postTypes.forEach(pt => {
        const opt = document.createElement("option");
        opt.value = pt.id;
        opt.textContent = `${pt.name} (${pt.recommendedWidth}×${pt.recommendedHeight} - ${pt.aspectRatio})`;
        this.dom.postTypeSelect.appendChild(opt);
      });
    }

    this.updateLiveSpecHelper();
    this.updateCaptionCounter();
  },
  updateLiveSpecHelper() {
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);

    if (!postType) {
      this.dom.liveSpecHelper.innerHTML = `<span class="u-color-muted">${this.t("spec_select_type")}</span>`;
      return;
    }

    // Update collapsible summary headers
    if (this.dom.specSummaryTitle) {
      this.dom.specSummaryTitle.textContent = this.tf("spec_requirements_for", { name: postType.name });
    }
    if (this.dom.specSummaryBadge) {
      this.dom.specSummaryBadge.textContent = `${postType.aspectRatio} • ${postType.recommendedWidth}×${postType.recommendedHeight} px`;
    }

    this.dom.liveSpecHelper.innerHTML = `
      <div class="spec-helper-title">
        <span>${this.tf("spec_requirements_for", { name: postType.name })}</span>
      </div>
      <div class="spec-helper-grid">
        <div class="spec-helper-item">
          <strong>${postType.aspectRatio}</strong>
          <span>${this.t("spec_aspect_ratio")}</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.recommendedWidth} × ${postType.recommendedHeight} px</strong>
          <span>${this.t("spec_resolution")}</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.format}</strong>
          <span>${this.t("spec_format")}</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.maxDuration || "N/A"}</strong>
          <span>${this.t("spec_duration")}</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.maxFileSize || "Standard"}</strong>
          <span>${this.t("spec_file_size")}</span>
        </div>
        <div class="spec-helper-item">
          <strong>${this.tf("spec_chars", { count: postType.captionLimit || 2200 })}</strong>
          <span>${this.t("spec_caption_limit")}</span>
        </div>
      </div>
      <div class="spec-safe-zone">
        <strong>${this.t("spec_safe_zone")}:</strong> ${postType.safeZone || this.t("spec_safe_zone_default")}
      </div>
    `;

    // Update aspect tag in preview if waiting
    if (this.dom.previewAspectPill) {
      this.dom.previewAspectPill.textContent = `${this.t("post_standard_label")}: ${postType.aspectRatio}`;
    }
  },
  updateCaptionCounter() {
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);
    const limit = postType?.captionLimit || 2200;
    const currentLength = this.dom.postDescInput.value.length;

    const over = currentLength > limit;
    this.dom.captionCounter.textContent = `${currentLength} / ${this.tf("spec_chars", { count: limit })}${over ? ` (${this.t("caption_over_limit")})` : ""}`;
    this.dom.captionCounter.classList.toggle("is-over-limit", over);
  },
  setPostMedia(media) {
    this.currentPostMedia = {
      type: media.type || "photo",
      url: media.url,
      name: media.name || "media-file",
      aspectRatio: media.aspectRatio || media.ratio || "9:16",
      count: media.count || 1
    };

    if (this.currentPostMedia.type === "video") {
      this.dom.previewImg.style.display = "none";
      this.dom.previewVideo.style.display = "block";
      this.dom.previewVideo.src = this.currentPostMedia.url;
    } else {
      this.dom.previewVideo.style.display = "none";
      this.dom.previewImg.style.display = "block";
      this.dom.previewImg.src = this.currentPostMedia.url;
    }

    this.dom.previewMediaName.textContent = `${this.currentPostMedia.name} (${this.currentPostMedia.type === 'video' ? 'Video' : (this.currentPostMedia.count > 1 ? this.currentPostMedia.count + ' photos' : 'Single Photo')})`;
  },
  handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      this.processUploadedFiles(files);
    }
  },
  processUploadedFiles(files) {
    const firstFile = files[0];
    const isVideo = firstFile.type.startsWith("video/");
    const reader = new FileReader();

    reader.onload = (event) => {
      this.setPostMedia({
        type: isVideo ? "video" : (files.length > 1 ? "photos" : "photo"),
        url: event.target.result,
        name: firstFile.name,
        aspectRatio: isVideo ? "9:16" : (files.length > 1 ? "4:5" : "1:1"),
        count: files.length
      });
    };

    reader.readAsDataURL(firstFile);
  },
  handleUrlApply() {
    const url = this.dom.mediaUrlInput.value.trim();
    if (!url) return;
    const isVideo = url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".webm");
    this.setPostMedia({
      type: isVideo ? "video" : "photo",
      url: url,
      name: url.substring(url.lastIndexOf("/") + 1) || "linked-media",
      aspectRatio: isVideo ? "9:16" : "4:5",
      count: 1
    });
    this.dom.mediaUrlInput.value = "";
  },
  handlePostFormSubmit(e) {
    e.preventDefault();

    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_save_post"), "warning");
      return;
    }

    // If media not set yet, check if URL input has text
    if (!this.currentPostMedia) {
      const urlText = this.dom.mediaUrlInput.value.trim();
      if (urlText) {
        this.handleUrlApply();
      } else {
        this.notify(this.t("alert_media_required"), "danger");
        return;
      }
    }

    const editId = this.dom.postEditId.value;
    if (!editId && this.isPastEventDate(this.dom.postDateInput.value)) {
      this.notify(this.t("post_past_create_unavailable"), "warning");
      return;
    }
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);

    const postData = {
      id: editId || `post-${Date.now()}`,
      platformId: platformId,
      postTypeId: postTypeId,
      date: this.dom.postDateInput.value,
      time: this.dom.postTimeInput.value || "12:00",
      title: this.dom.postTitleInput.value.trim(),
      description: this.dom.postDescInput.value.trim(),
      status: this.dom.postStatusSelect.value,
      mediaType: this.currentPostMedia.type,
      mediaUrl: this.currentPostMedia.url,
      mediaCount: this.currentPostMedia.count,
      mediaNames: [this.currentPostMedia.name],
      aspectRatio: postType ? postType.aspectRatio : (this.currentPostMedia.aspectRatio || "9:16"),
      shareLink: this.dom.postShareLink ? this.dom.postShareLink.value.trim() : ""
    };

    if (editId) {
      const index = this.posts.findIndex(p => p.id === editId);
      if (index !== -1) {
        this.posts[index] = postData;
      }
    } else {
      this.posts.push(postData);

      // Link event if this post was created via event promotion notification
      if (this.eventPendingPromotionId) {
        const evt = this.events.find(e => e.id === this.eventPendingPromotionId);
        if (evt) {
          evt.socialStatus = "promoted";
          evt.promotedPostId = postData.id;
          evt.promotedAt = new Date().toISOString();
          this.saveEvents();
        }
        this.eventPendingPromotionId = null;
      }
    }

    this.savePosts();
    this.updateSocialNotificationBadge();
    this.dom.postDialog.close();
    this.render();
  },
  openShareLink(urlOrPath) {
    if (!urlOrPath) return;
    const clean = urlOrPath.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      window.open(clean, "_blank", "noopener,noreferrer");
    } else {
      // Local or network share path (e.g. \\server\share or f:\...)
      this.copyToClipboard(clean);
      this.notify((this.t("alert_share_path_detail")).replace("${path}", clean), "info");
    }
  },
  // Post Detail Modal
  openPostDetailModal(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    this.currentDetailPostId = postId;
    const platform = this.getPlatform(post.platformId);
    const postType = this.getPostType(post.platformId, post.postTypeId);

    // Media renderer
    if (post.mediaType === "video") {
      this.dom.detailMediaBox.innerHTML = `
        <video class="u-maxw-100pct u-maxh-420" src="${post.mediaUrl}" controls></video>
      `;
    } else {
      this.dom.detailMediaBox.innerHTML = `
        <img class="u-maxw-100pct u-maxh-420 u-object-contain" src="${post.mediaUrl}" alt="Post Media">
      `;
    }

    // Platform badge
    const iconSrc = this.getPlatformIcon(platform);
    this.dom.detailPlatformBadge.style.background = platform ? platform.color : "var(--primary)";
        this.dom.detailPlatformBadge.innerHTML = `
      <img class="platform-favicon u-brighten" src="${iconSrc}" alt="" data-fallback="hide">
      <span>${platform ? platform.name : post.platformId}</span>
    `;

    this.dom.detailTitle.textContent = post.title || this.t("post_untitled");
    this.dom.detailDateTime.textContent = `${post.date}, ${post.time || "12:00"}`;
    this.dom.detailPostType.textContent = `${postType ? postType.name : this.t("post_generic")} (${post.aspectRatio || '9:16'})`;
    
    const mediaCountStr = post.mediaCount > 1 ? ` (${this.tf("media_slides", { count: post.mediaCount })})` : "";
    this.dom.detailMediaFormat.textContent = `${this.t(post.mediaType === "video" ? "media_video" : "media_photo")}${mediaCountStr}`;
    
    this.dom.detailStatus.textContent = this.t(`post_status_${post.status || "scheduled"}`).toUpperCase();
    this.dom.detailStatus.classList.toggle("is-published", post.status === "published");

    // Asset & File Share Section
    if (this.dom.detailShareBox) {
      if (post.shareLink) {
        this.dom.detailShareBox.style.display = "block";
        this.dom.detailShareBox.classList.remove("is-empty");
        this.dom.detailShareLinkText.textContent = post.shareLink;
        this.dom.detailShareLinkText.href = post.shareLink.startsWith("http") ? post.shareLink : "#";
        this.dom.detailShareLinkText.onclick = (e) => {
          if (!post.shareLink.startsWith("http")) {
            e.preventDefault();
            this.openShareLink(post.shareLink);
          }
        };
        if (this.dom.btnDetailOpenShare) {
          this.dom.btnDetailOpenShare.style.display = "inline-flex";
          this.dom.btnDetailOpenShare.onclick = (e) => {
            e.preventDefault();
            this.openShareLink(post.shareLink);
          };
        }
        if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.style.display = "inline-flex";
        if (this.dom.detailShareStatusBadge) this.dom.detailShareStatusBadge.textContent = this.t("post_share_linked");
      } else {
        this.dom.detailShareBox.style.display = "block";
        this.dom.detailShareBox.classList.add("is-empty");
        this.dom.detailShareLinkText.textContent = this.t("post_share_none_hint");
        this.dom.detailShareLinkText.removeAttribute("href");
        this.dom.detailShareLinkText.onclick = null;
        if (this.dom.btnDetailOpenShare) this.dom.btnDetailOpenShare.style.display = "none";
        if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.style.display = "none";
        if (this.dom.detailShareStatusBadge) this.dom.detailShareStatusBadge.textContent = this.t("post_share_none");
      }
    }

    this.dom.detailDescBox.textContent = post.description || this.t("post_no_caption");

    this.dom.detailDialog.showModal();
  },
  async deleteCurrentDetailPost() {
    if (!this.currentDetailPostId) return;
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_delete"), "warning");
      return;
    }
    if (await this.confirmDialog(this.t("confirm_delete_post"))) {
      this.posts = this.posts.filter(p => p.id !== this.currentDetailPostId);
      this.savePosts();
      this.dom.detailDialog.close();
      this.render();
    }
  },
  duplicateCurrentDetailPost() {
    const post = this.posts.find(p => p.id === this.currentDetailPostId);
    if (!post) return;
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_save_post"), "warning");
      return;
    }

    const duplicated = {
      ...post,
      id: `post-${Date.now()}`,
      title: `${post.title} (${this.t("post_copy_suffix")})`,
      status: "draft"
    };

    this.posts.push(duplicated);
    this.savePosts();
    this.dom.detailDialog.close();
    this.render();
    this.notify(this.t("alert_post_duplicated"), "info");
  }
};
