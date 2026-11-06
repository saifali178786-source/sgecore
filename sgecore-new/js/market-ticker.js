(function () {
  "use strict";

  const symbols = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT",
    "SOLUSDT", "XRPUSDT", "DOGEUSDT"
  ];

  const endpoints = [
    "https://api.binance.com/api/v3/ticker/24hr?symbols=" +
      encodeURIComponent(JSON.stringify(symbols)),
    "https://api.binance.us/api/v3/ticker/24hr?symbols=" +
      encodeURIComponent(JSON.stringify(symbols))
  ];

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";

    const digits = n >= 1000 ? 2 : (n >= 1 ? 4 : 6);

    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits
    });
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadMetals() {
    try {
      const data = await fetchJson(
        "https://xaus.com/api/v1/spot?compact=1"
      );

      const gold = Number(
        data && (data.spot_usd_oz || (data.xau && data.xau.price))
      );
      const silver = Number(data && data.silver_usd_oz);

      if (Number.isFinite(gold) && gold > 0) {
        setText("ticker-XAU", "$" + formatPrice(gold / 31.1034768));
      } else {
        setText("ticker-XAU", "Unavailable");
      }

      if (Number.isFinite(silver) && silver > 0) {
        setText("ticker-XAG", "$" + formatPrice(silver));
      } else {
        setText("ticker-XAG", "Unavailable");
      }
    } catch (_) {
      setText("ticker-XAU", "Unavailable");
      setText("ticker-XAG", "Unavailable");
    }
  }

  async function loadCrypto() {
    let rows;
    let lastError;

    for (const endpoint of endpoints) {
      try {
        rows = await fetchJson(endpoint);
        if (Array.isArray(rows)) break;
        throw new Error("Unexpected exchange response");
      } catch (error) {
        lastError = error;
      }
    }

    if (!Array.isArray(rows)) throw lastError;

    const bySymbol = new Map(rows.map(row => [row.symbol, row]));

    symbols.forEach(symbol => {
      const row = bySymbol.get(symbol);

      if (!row) {
        setText("ticker-" + symbol, "Unavailable");
        return;
      }

      setText("ticker-" + symbol, "$" + formatPrice(row.lastPrice));

      const changeNode = document.getElementById(
        "ticker-change-" + symbol
      );

      const change = Number(row.priceChangePercent);

      if (changeNode && Number.isFinite(change)) {
        changeNode.textContent =
          (change > 0 ? "+" : "") + change.toFixed(2) + "%";
        changeNode.className = change < 0 ? "down" : "";
      }
    });
  }

  async function refreshTicker() {
    await Promise.allSettled([loadMetals(), loadCrypto()]);
  }

  refreshTicker();
  window.setInterval(refreshTicker, 30000);
})();