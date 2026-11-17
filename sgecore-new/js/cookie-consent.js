(function () {
  "use strict";

  var STORAGE_KEY = "sde_cookie_preferences";

  function getPreferences() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (error) {}

    return {
      essential: true,
      analytics: false,
      marketing: false
    };
  }

  function savePreferences(preferences) {
    preferences.essential = true;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {}

    var panel = document.querySelector(".sde-cookie-panel");
    if (panel) panel.remove();
  }

  function openSettings() {
    var existing = document.querySelector(".sde-cookie-panel");
    if (existing) {
      existing.remove();
      return;
    }

    var preferences = getPreferences();
    var panel = document.createElement("div");

    panel.className = "sde-cookie-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Cookie settings");

    panel.innerHTML = `
      <h3>Cookie Settings</h3>
      <p>Manage your optional cookie preferences. Essential cookies are always enabled.</p>

      <label>
        <input type="checkbox" checked disabled>
        Essential cookies (always active)
      </label>

      <label>
        <input type="checkbox" id="sde-cookie-analytics">
        Analytics cookies
      </label>

      <label>
        <input type="checkbox" id="sde-cookie-marketing">
        Marketing cookies
      </label>

      <div class="sde-cookie-actions">
        <button type="button" id="sde-cookie-save">Save preferences</button>
        <button type="button" class="secondary" id="sde-cookie-reject">Reject optional</button>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#sde-cookie-analytics").checked = !!preferences.analytics;
    panel.querySelector("#sde-cookie-marketing").checked = !!preferences.marketing;

    panel.querySelector("#sde-cookie-save").addEventListener("click", function () {
      savePreferences({
        essential: true,
        analytics: panel.querySelector("#sde-cookie-analytics").checked,
        marketing: panel.querySelector("#sde-cookie-marketing").checked
      });
    });

    panel.querySelector("#sde-cookie-reject").addEventListener("click", function () {
      savePreferences({
        essential: true,
        analytics: false,
        marketing: false
      });
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-cookie-settings]");
    if (button) {
      event.preventDefault();
      openSettings();
    }
  });

  window.SDECookiePreferences = {
    get: getPreferences,
    open: openSettings
  };
})();

// SDE COOKIE NOTIFICATION
(function () {
    "use strict";

    const STORAGE_KEY = "sde_cookie_preferences";

    function getPreferences() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            return null;
        }
    }

    function savePreferences(analytics, marketing) {
        const preferences = {
            essential: true,
            analytics: analytics,
            marketing: marketing,
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        const banner = document.getElementById("sde-cookie-notice");
        if (banner) banner.remove();
    }

    function showCookieNotice() {
        if (getPreferences()) return;
        if (document.getElementById("sde-cookie-notice")) return;

        const banner = document.createElement("div");
        banner.id = "sde-cookie-notice";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", "Cookie preferences");
        banner.setAttribute("aria-live", "polite");

        banner.innerHTML = `
            <div class="sde-cookie-heading">
                <span class="sde-cookie-icon">🍪</span>
                <strong>We value your privacy</strong>
            </div>

            <p>
                We use essential cookies to make our website work.
                With your permission, we may also use optional cookies
                to improve your experience.
            </p>

            <div class="sde-cookie-actions">
                <button type="button" id="sde-cookie-reject">
                    Reject Optional
                </button>

                <button type="button" id="sde-cookie-accept">
                    Accept All
                </button>
            </div>

            <button type="button" class="sde-cookie-settings-link"
                    data-cookie-settings>
                Cookie Settings
            </button>
        `;

        document.body.appendChild(banner);

        document.getElementById("sde-cookie-accept")
            .addEventListener("click", function () {
                savePreferences(true, true);
            });

        document.getElementById("sde-cookie-reject")
            .addEventListener("click", function () {
                savePreferences(false, false);
            });

        banner.querySelector("[data-cookie-settings]")
            .addEventListener("click", function () {
                if (window.SDECookiePreferences &&
                    typeof window.SDECookiePreferences.open === "function") {
                    window.SDECookiePreferences.open();
                }
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showCookieNotice);
    } else {
        showCookieNotice();
    }
})();
