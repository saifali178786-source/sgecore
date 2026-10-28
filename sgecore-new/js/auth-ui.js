
(() => {
  "use strict";

  function getSupabase() {
    return typeof sgecoreSupabase !== "undefined"
      ? sgecoreSupabase
      : null;
  }

  // Add Show / Hide buttons to password fields.
  function setupPasswordVisibility() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.visibilityReady === "true") return;
      input.dataset.visibilityReady = "true";

      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "display:flex;align-items:center;gap:8px;width:100%;";

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      input.style.flex = "1";
      input.style.minWidth = "0";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Show";
      button.setAttribute("aria-label", "Show password");
      button.style.cssText =
        "padding:10px 12px;border:1px solid #344359;" +
        "border-radius:4px;background:#14243a;color:#f0d58c;" +
        "cursor:pointer;font:inherit;";

      button.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute(
          "aria-label",
          show ? "Hide password" : "Show password"
        );
      });

      wrapper.appendChild(button);
    });
  }

  // Start Google OAuth.
  function setupGoogleSignIn() {
    document.querySelectorAll("[data-google-signin]").forEach((button) => {
      if (button.dataset.googleReady === "true") return;
      button.dataset.googleReady = "true";

      button.addEventListener("click", async () => {
        const supabase = getSupabase();
        const message = document.querySelector(
          "#login-message, #register-message"
        );

        if (!supabase?.auth) {
          if (message) {
            message.textContent =
              "Authentication is unavailable. Please try again.";
          }
          return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Connecting to Google...";

        try {
          const isInPagesFolder =
            /\/pages\/[^/]*$/i.test(window.location.pathname);

          const redirectUrl = new URL(
            isInPagesFolder ? "dashboard.html" : "pages/dashboard.html",
            window.location.href
          );

          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: redirectUrl.href
            }
          });

          if (error) throw error;
        } catch (error) {
          console.error("Google sign-in error:", error);

          if (message) {
            message.textContent =
              error.message ||
              "Google sign-in could not be started. Please try again.";
          }

          button.disabled = false;
          button.textContent = originalText;
        }
      });
    });
  }

  // Update the homepage navigation according to authentication status.
  function setupAccountMenu() {
    const navigation = document.querySelector(".main-nav");
    if (!navigation) return;

    const loginLink = navigation.querySelector(".nav-login");
    const registerLink = navigation.querySelector(".nav-register");

    if (!loginLink && !registerLink) return;

    const supabase = getSupabase();
    if (!supabase?.auth) return;

    const isHomepage =
      !/\/pages\/[^/]*$/i.test(window.location.pathname);

    let accountMenu = null;

    function removeAccountMenu() {
      if (accountMenu) {
        accountMenu.remove();
        accountMenu = null;
      }
    }

    function showSignedOut() {
      removeAccountMenu();
      if (loginLink) loginLink.hidden = false;
      if (registerLink) registerLink.hidden = false;
    }

    function showSignedIn(user) {
      removeAccountMenu();

      if (loginLink) loginLink.hidden = true;
      if (registerLink) registerLink.hidden = true;

      accountMenu = document.createElement("div");
      accountMenu.id = "sge-account-menu";
      accountMenu.style.cssText = "position:relative;display:inline-block;";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = "My Account ▾";
      toggle.setAttribute("aria-expanded", "false");
      toggle.style.cssText =
        "padding:10px 14px;border:1px solid #d9b45d;" +
        "border-radius:4px;background:#0d1a2b;color:#f0d58c;" +
        "cursor:pointer;font:inherit;";

      const dropdown = document.createElement("div");
      dropdown.hidden = true;
      dropdown.style.cssText =
        "position:absolute;right:0;top:calc(100% + 8px);" +
        "z-index:1000;min-width:210px;padding:8px;" +
        "background:#0d1a2b;border:1px solid rgba(217,180,93,.5);" +
        "border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,.35);";

      const accountLabel = document.createElement("div");
      accountLabel.textContent = user.email || "Signed in";
      accountLabel.title = user.id;
      accountLabel.style.cssText =
        "padding:10px;color:#aeb9ca;font-size:12px;" +
        "overflow-wrap:anywhere;border-bottom:1px solid #344359;";

      dropdown.appendChild(accountLabel);

      const links = [
        {
          label: "Dashboard",
          href: isHomepage ? "pages/dashboard.html" : "dashboard.html"
        },
        {
          label: "Quick Recharge",
          href: isHomepage
            ? "pages/quick-recharge.html"
            : "quick-recharge.html"
        }
      ];

      links.forEach((item) => {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        link.style.cssText =
          "display:block;padding:10px;color:#f5f7fb;text-decoration:none;";
        dropdown.appendChild(link);
      });

      const logoutButton = document.createElement("button");
      logoutButton.type = "button";
      logoutButton.textContent = "Log Out";
      logoutButton.style.cssText =
        "display:block;width:100%;padding:10px;text-align:left;" +
        "border:0;background:transparent;color:#f0d58c;" +
        "cursor:pointer;font:inherit;";

      logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;

          window.location.href = isHomepage
            ? "index.html"
            : "../index.html";
        } catch (error) {
          console.error("Logout error:", error);
          alert("Unable to log out. Please try again.");
          logoutButton.disabled = false;
          logoutButton.textContent = "Log Out";
        }
      });

      dropdown.appendChild(logoutButton);

      toggle.addEventListener("click", () => {
        dropdown.hidden = !dropdown.hidden;
        toggle.setAttribute("aria-expanded", String(!dropdown.hidden));
      });

      accountMenu.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      document.addEventListener("click", () => {
        dropdown.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      });

      accountMenu.append(toggle, dropdown);
      navigation.appendChild(accountMenu);
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not read session:", error);
        showSignedOut();
        return;
      }

      if (data.session?.user) {
        showSignedIn(data.session.user);
      } else {
        showSignedOut();
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        showSignedIn(session.user);
      } else {
        showSignedOut();
      }
    });
  }

  function initialize() {
    setupPasswordVisibility();
    setupGoogleSignIn();
    setupAccountMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
