/* SDE CORE - CUSTOMER SUPPORT WITH FILE ATTACHMENTS */
(function () {
  "use strict";

  const client = typeof sgecoreSupabase !== "undefined" ? sgecoreSupabase : null;
  if (!client) {
    console.error("SDE Support: Supabase client was not found.");
    return;
  }

  const BUCKET = "support-attachments";
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  const $ = id => document.getElementById(id);
  const widget = $("sge-support-widget");
  const toggle = $("sge-support-toggle");
  const panel = $("sge-support-panel");
  const closeButton = $("sge-chat-close");
  const messagesBox = $("sge-chat-messages");
  const input = $("sge-chat-input");
  const sendButton = $("sge-chat-send");
  const statusBox = $("sge-chat-status");
  const closedNotice = $("sge-chat-closed");
  const heading = $("sge-chat-heading");

  if (!widget || !toggle || !panel || !messagesBox || !input || !sendButton) {
    console.error("SDE Support: Chat elements are missing.");
    return;
  }

  const composer = input.closest(".sge-chat-composer");
  if (!composer) {
    console.error("SDE Support: Chat composer was not found.");
    return;
  }

  let currentUser = null;
  let activeTicket = null;
  let sending = false;
  let pollHandle = null;
  let supportEnabled = false;

  // Add the attachment controls without changing the page layout HTML.
  const attachLabel = document.createElement("label");
  attachLabel.textContent = "＋";
  attachLabel.title = "Attach an image, screenshot, or PDF";
  attachLabel.setAttribute("aria-label", "Attach a file");
  attachLabel.style.cssText =
    "display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;" +
    "border:1px solid #806b3c;border-radius:10px;background:#17283b;" +
    "color:#e5c878;font-size:25px;font-weight:700;cursor:pointer;";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
  fileInput.style.display = "none";
  attachLabel.appendChild(fileInput);

  const filePreview = document.createElement("div");
  filePreview.style.cssText =
    "display:none;padding:7px 12px;color:#e5c878;background:#0b1727;" +
    "font-size:12px;overflow-wrap:anywhere;";

  composer.insertBefore(attachLabel, input);
  composer.parentNode.insertBefore(filePreview, composer);

  function status(message, isError) {
    if (!statusBox) return;
    statusBox.textContent = message || "";
    statusBox.classList.toggle("error", Boolean(isError));
  }

  function showMessage(text, role, attachmentPath) {
    const wrapper = document.createElement("div");
    wrapper.className = "sge-chat-message " + (role === "admin" ? "theirs" : "mine");

    if (text) {
      const bubble = document.createElement("div");
      bubble.className = "sge-chat-bubble";
      bubble.textContent = text;
      wrapper.appendChild(bubble);
    }

    if (attachmentPath) {
      const attachmentBox = document.createElement("div");
      attachmentBox.style.cssText =
        "margin-top:7px;padding:8px;background:#14263b;border-radius:9px;";

      const loading = document.createElement("div");
      loading.textContent = "Loading attachment...";
      loading.style.cssText = "font-size:12px;color:#d8bd7d;";
      attachmentBox.appendChild(loading);
      wrapper.appendChild(attachmentBox);

      client.storage.from(BUCKET).createSignedUrl(attachmentPath, 300)
        .then(({ data, error }) => {
          attachmentBox.replaceChildren();

          if (error || !data?.signedUrl) {
            loading.textContent = "Attachment is currently unavailable.";
            attachmentBox.appendChild(loading);
            return;
          }

          const url = data.signedUrl;
          const filename = attachmentPath.split("/").pop() || "Attachment";
          const isImage = /\.(jpe?g|png|webp)$/i.test(filename);

          if (isImage) {
            const image = document.createElement("img");
            image.src = url;
            image.alt = filename;
            image.loading = "lazy";
            image.style.cssText =
              "display:block;max-width:220px;max-height:180px;" +
              "width:auto;height:auto;border-radius:7px;margin-bottom:7px;";
            attachmentBox.appendChild(image);
          }

          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open " + filename;
          link.style.cssText = "color:#e5c878;font-size:12px;overflow-wrap:anywhere;";
          attachmentBox.appendChild(link);
        })
        .catch(error => {
          attachmentBox.textContent = "Attachment could not be loaded.";
          console.error("SDE Support attachment error:", error);
        });
    }

    messagesBox.appendChild(wrapper);
  }

  function showWelcome(message) {
    messagesBox.replaceChildren();
    const welcome = document.createElement("div");
    welcome.className = "sge-chat-welcome";
    welcome.textContent = message;
    messagesBox.appendChild(welcome);
  }

  function setClosed(closed) {
    const disabled = Boolean(closed) || !currentUser || sending;
    if (closedNotice) closedNotice.classList.toggle("visible", Boolean(closed));
    input.disabled = disabled;
    sendButton.disabled = disabled;
    attachLabel.style.opacity = disabled ? ".45" : "1";
    attachLabel.style.pointerEvents = disabled ? "none" : "auto";
    input.placeholder = closed ? "This conversation is closed" : "Type your message...";
  }

  function stopPolling() {
    if (pollHandle) {
      window.clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollHandle = window.setInterval(() => {
      if (!panel.hidden && currentUser && supportEnabled) {
        loadMessages().catch(error => status(error.message, true));
      }
    }, 5000);
  }

  async function loadMessages() {
    if (!currentUser || !activeTicket) {
      showWelcome("Welcome to SDE Core Support. Send us a message to start a conversation.");
      setClosed(false);
      return;
    }

    const { data, error } = await client
      .from("support_messages")
      .select("message,sender_role,created_at,attachment_path")
      .eq("ticket_id", activeTicket.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    messagesBox.replaceChildren();

    if (!data || data.length === 0) {
      showWelcome("Welcome to SDE Core Support. Send us a message and our team will reply here.");
    } else {
      data.forEach(item => showMessage(item.message, item.sender_role, item.attachment_path));
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    setClosed(["closed", "resolved"].includes(activeTicket.status));
    status("");
  }

  async function loadLatestTicket() {
    activeTicket = null;

    const { data, error } = await client
      .from("support_tickets")
      .select("id,subject,status,created_at,last_message_at")
      .eq("user_id", currentUser.id)
      .order("last_message_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length) activeTicket = data[0];
    await loadMessages();
  }

  async function checkCustomerSupport() {
    if (!currentUser) {
      supportEnabled = false;
      widget.hidden = true;
      showWelcome("Please sign in to your SDE Core account before contacting customer support.");
      setClosed(true);
      return;
    }

    const { data, error } = await client
      .from("support_customer_settings")
      .select("support_enabled,display_heading")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    supportEnabled = Boolean(data && data.support_enabled === true);

    if (!supportEnabled) {
      widget.hidden = true;
      closeChat();
      return;
    }

    widget.hidden = false;
    if (heading) heading.textContent = data.display_heading?.trim() || "Customer Support";
    await loadLatestTicket();
  }

  function updateFilePreview() {
    const file = fileInput.files?.[0];

    if (!file) {
      filePreview.style.display = "none";
      filePreview.textContent = "";
      return;
    }

    filePreview.style.display = "block";
    filePreview.textContent = "Attached: " + file.name + " (" +
      (file.size / 1024 / 1024).toFixed(2) + " MB) ";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.style.cssText =
      "margin-left:10px;border:0;background:transparent;color:#ffaaaa;cursor:pointer;";
    remove.addEventListener("click", () => {
      fileInput.value = "";
      updateFilePreview();
    });
    filePreview.appendChild(remove);
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      updateFilePreview();
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      fileInput.value = "";
      updateFilePreview();
      status("Choose a JPG, PNG, WEBP, or PDF file.", true);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      fileInput.value = "";
      updateFilePreview();
      status("The maximum attachment size is 10 MB.", true);
      return;
    }

    status("");
    updateFilePreview();
  });

  async function sendMessage() {
    if (sending) return;

    if (!currentUser) {
      status("Please sign in to contact customer support.", true);
      return;
    }

    if (!supportEnabled) {
      status("Customer support is currently unavailable for your account.", true);
      return;
    }

    const message = input.value.trim();
    const file = fileInput.files?.[0] || null;

    if (!message && !file) {
      status("Write a message or attach a file first.", true);
      return;
    }

    if (message.length > 4000) {
      status("Messages must be 4000 characters or fewer.", true);
      return;
    }

    if (file && (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE)) {
      status("Choose a JPG, PNG, WEBP, or PDF file up to 10 MB.", true);
      return;
    }

    sending = true;
    sendButton.disabled = true;
    status("Sending...");

    let uploadedPath = null;

    try {
      if (!activeTicket || ["closed", "resolved"].includes(activeTicket.status)) {
        const { data: ticket, error: ticketError } = await client
          .from("support_tickets")
          .insert({
            user_id: currentUser.id,
            subject: "Homepage Support",
            status: "open"
          })
          .select("id,subject,status,created_at,last_message_at")
          .single();

        if (ticketError) throw ticketError;
        activeTicket = ticket;
      }

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
        uploadedPath = activeTicket.id + "/" + crypto.randomUUID() + "-" + safeName;

        const { error: uploadError } = await client.storage
          .from(BUCKET)
          .upload(uploadedPath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;
      }

      const messageText = message || (file ? "Attachment: " + file.name : "");

      const { error: messageError } = await client
        .from("support_messages")
        .insert({
          ticket_id: activeTicket.id,
          sender_id: currentUser.id,
          sender_role: "customer",
          message: messageText,
          attachment_path: uploadedPath
        });

      if (messageError) {
        if (uploadedPath) {
          await client.storage.from(BUCKET).remove([uploadedPath]);
        }
        throw messageError;
      }

      input.value = "";
      fileInput.value = "";
      updateFilePreview();
      await loadMessages();
      status("");
      input.focus();
    } catch (error) {
      console.error("SDE Support send error:", error);
      status(error.message || "Your message could not be sent. Please try again.", true);
    } finally {
      sending = false;
      setClosed(Boolean(activeTicket && ["closed", "resolved"].includes(activeTicket.status)));
    }
  }

  function openChat() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");

    if (!currentUser) {
      showWelcome("Please sign in to your SDE Core account to use customer support.");
      setClosed(true);
      return;
    }

    if (supportEnabled) {
      loadMessages().catch(error => status(error.message, true));
      startPolling();
    }
    input.focus();
  }

  function closeChat() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    stopPolling();
  }

  toggle.addEventListener("click", event => {
    // On the dedicated support page the toggle may be a navigation link.
    if (toggle.tagName === "A" && toggle.getAttribute("href")) return;
    event.preventDefault();
    if (panel.hidden) openChat();
    else closeChat();
  });

  if (closeButton) closeButton.addEventListener("click", closeChat);
  sendButton.addEventListener("click", sendMessage);

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  async function refreshForSession(session) {
    currentUser = session?.user || null;
    activeTicket = null;
    stopPolling();

    try {
      await checkCustomerSupport();
    } catch (error) {
      console.error("SDE Support load error:", error);
      widget.hidden = !currentUser;
      status("Support could not be loaded: " + error.message, true);
    }
  }

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("SDE Support session error:", error.message);
      return;
    }
    refreshForSession(data.session);
  });

  client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => refreshForSession(session), 0);
  });

  showWelcome("Please sign in to your SDE Core account to use customer support.");
})();
