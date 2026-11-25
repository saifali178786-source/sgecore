(() => {
  "use strict";

  const supabaseClient = window.sgecoreSupabase ||
    (typeof sgecoreSupabase !== "undefined" ? sgecoreSupabase : null);

  if (!supabaseClient) {
    console.error("SDE Support Notifications: Supabase client not found.");
    return;
  }

  const style = document.createElement("style");
  style.textContent = `
    .sde-notification-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      z-index: 10000;
    }

    .sde-notification-bell {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border: 1px solid rgba(217,180,93,.55);
      border-radius: 9px;
      background: #0c192a;
      color: #f4d995;
      cursor: pointer;
      font-size: 20px;
    }

    .sde-notification-bell:hover {
      background: #162940;
    }

    .sde-notification-count {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 20px;
      background: #d94d4d;
      color: white;
      font-size: 10px;
      font-weight: 800;
      line-height: 17px;
      text-align: center;
      display: none;
    }

    .sde-notification-panel {
      position: absolute;
      top: calc(100% + 12px);
      right: 0;
      width: min(360px, calc(100vw - 30px));
      max-height: 440px;
      overflow-y: auto;
      background: #0c192a;
      border: 1px solid rgba(217,180,93,.35);
      border-radius: 12px;
      box-shadow: 0 15px 45px rgba(0,0,0,.45);
      color: #f5f7fb;
      display: none;
    }

    .sde-notification-panel.sde-open {
      display: block;
    }

    .sde-notification-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px;
      border-bottom: 1px solid rgba(255,255,255,.09);
      gap: 10px;
    }

    .sde-notification-heading strong {
      color: #f4d995;
      font-size: 14px;
    }

    .sde-notification-heading button {
      background: transparent;
      border: 0;
      color: #d9b45d;
      cursor: pointer;
      font-size: 11px;
    }

    .sde-sound-toggle {
      white-space: nowrap;
      margin-left: auto;
    }

    .sde-notification-item {
      display: block;
      width: 100%;
      padding: 13px 15px;
      border: 0;
      border-bottom: 1px solid rgba(255,255,255,.07);
      background: transparent;
      color: #f5f7fb;
      text-align: left;
      cursor: pointer;
    }

    .sde-notification-item:hover {
      background: #14263b;
    }

    .sde-notification-item.sde-unread {
      background: rgba(217,180,93,.07);
      border-left: 3px solid #d9b45d;
    }

    .sde-notification-item strong {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
    }

    .sde-notification-item p {
      margin: 0 0 6px;
      color: #bdc8d6;
      font-size: 12px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .sde-notification-item small {
      color: #8494a9;
      font-size: 10px;
    }

    .sde-notification-empty {
      padding: 25px 15px;
      color: #9eacbd;
      text-align: center;
      font-size: 13px;
    }

    @media (max-width: 600px) {
      .sde-notification-panel {
        position: fixed;
        top: 75px;
        right: 12px;
        width: calc(100vw - 24px);
      }
    }
  `;
  document.head.appendChild(style);

  const header =
    document.querySelector(".dashboard-header .header-actions") ||
    document.querySelector("#appScreen .header-right");

  if (!header) {
    console.error("SDE Support Notifications: Dashboard header not found.");
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "sde-notification-wrap";

  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "sde-notification-bell";
  bell.setAttribute("aria-label", "Support notifications");
  bell.setAttribute("aria-expanded", "false");
  bell.innerHTML = `
    <span aria-hidden="true">♧</span>
    <span class="sde-notification-count"></span>
  `;

  const countBadge = bell.querySelector(".sde-notification-count");

  const panel = document.createElement("div");
  panel.className = "sde-notification-panel";

  panel.innerHTML = `
    <div class="sde-notification-heading">
      <strong>Support Notifications</strong>
      <button type="button" class="sde-sound-toggle">Sound: Off</button>
      <button type="button" class="sde-mark-all">Mark all read</button>
    </div>
    <div class="sde-notification-list">
      <div class="sde-notification-empty">Loading notifications...</div>
    </div>
  `;

  wrap.append(bell, panel);

  const accountButton = header.querySelector(
    "#logout-button, #logoutButton"
  );

  if (accountButton) {
    header.insertBefore(wrap, accountButton);
  } else {
    header.appendChild(wrap);
  }

  const list = panel.querySelector(".sde-notification-list");
  const markAllButton = panel.querySelector(".sde-mark-all");

  let currentUserId = null;
  let refreshTimer = null;
  let refreshInProgress = false;
  let knownNotificationIds = null;
  let audioContext = null;

  const soundButton = panel.querySelector(".sde-sound-toggle");
  const soundStorageKey = "sde_support_notification_sound";
  let soundEnabled = localStorage.getItem(soundStorageKey) === "true";

  function updateSoundButton() {
    soundButton.textContent = soundEnabled ? "Sound: On" : "Sound: Off";
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
  }

  async function playNotificationSound() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!audioContext) audioContext = new AudioContextClass();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const now = audioContext.currentTime;

      [880, 1174].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + index * 0.17;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(start);
        oscillator.stop(start + 0.34);
      });
    } catch (error) {
      console.warn("SDE notification sound unavailable:", error);
    }
  }

  soundButton.addEventListener("click", async () => {
    if (soundEnabled) {
      soundEnabled = false;
      localStorage.setItem(soundStorageKey, "false");
      updateSoundButton();
      return;
    }

    soundEnabled = true;
    localStorage.setItem(soundStorageKey, "true");
    updateSoundButton();

    // Play a short test chime from this user interaction.
    await playNotificationSound();
  });

  updateSoundButton();

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function showCount(count) {
    if (count > 0) {
      countBadge.textContent = count > 99 ? "99+" : String(count);
      countBadge.style.display = "block";
    } else {
      countBadge.style.display = "none";
    }
  }

  function renderNotifications(rows) {
    list.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "sde-notification-empty";
      empty.textContent = "No support notifications yet.";
      list.appendChild(empty);
      return;
    }

    rows.forEach((notification) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "sde-notification-item" +
        (notification.is_read ? "" : " sde-unread");

      const title = document.createElement("strong");
      title.textContent = notification.title || "Support notification";

      const body = document.createElement("p");
      body.textContent = notification.body || "";

      const date = document.createElement("small");
      date.textContent = formatDate(notification.created_at);

      item.append(title, body, date);

      item.addEventListener("click", async () => {
        if (!notification.is_read) {
          const { error } = await supabaseClient
            .from("support_notifications")
            .update({ is_read: true })
            .eq("id", notification.id)
            .eq("recipient_id", currentUserId);

          if (error) {
            console.error("Unable to mark notification as read:", error);
            return;
          }
        }

        await loadNotifications();
      });

      list.appendChild(item);
    });
  }

  async function loadNotifications() {
    if (!currentUserId || refreshInProgress) return;

    refreshInProgress = true;

    try {
      const { data, error } = await supabaseClient
        .from("support_notifications")
        .select("id,title,body,is_read,created_at,ticket_id")
        .eq("recipient_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      const rows = data || [];

      if (knownNotificationIds === null) {
        // First load establishes a baseline without playing a ringtone.
        knownNotificationIds = new Set(rows.map((item) => item.id));
      } else {
        const newNotifications = rows.filter(
          (item) => !knownNotificationIds.has(item.id)
        );

        if (newNotifications.length > 0 && soundEnabled) {
          playNotificationSound();
        }

        rows.forEach((item) => knownNotificationIds.add(item.id));
      }

      showCount(rows.filter((item) => !item.is_read).length);
      renderNotifications(rows);
    } catch (error) {
      console.error("SDE notification loading error:", error);
      list.textContent = "Unable to load notifications.";
    } finally {
      refreshInProgress = false;
    }
  }

  async function markAllRead() {
    if (!currentUserId) return;

    const { error } = await supabaseClient
      .from("support_notifications")
      .update({ is_read: true })
      .eq("recipient_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      console.error("Unable to mark notifications as read:", error);
      return;
    }

    await loadNotifications();
  }

  function stopPolling() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function setUser(session) {
    const nextUserId = session?.user?.id || null;

    if (nextUserId === currentUserId) return;

    currentUserId = nextUserId;
    stopPolling();
    knownNotificationIds = null;
    showCount(0);

    if (!currentUserId) {
      list.textContent = "Sign in to view notifications.";
      return;
    }

    loadNotifications();
    refreshTimer = setInterval(loadNotifications, 15000);
  }

  bell.addEventListener("click", async () => {
    const isOpen = panel.classList.toggle("sde-open");
    bell.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) await loadNotifications();
  });

  markAllButton.addEventListener("click", markAllRead);

  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) {
      panel.classList.remove("sde-open");
      bell.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("focus", loadNotifications);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => setUser(session), 0);
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Unable to check notification session:", error);
      return;
    }
    setUser(data.session);
  });
})();

