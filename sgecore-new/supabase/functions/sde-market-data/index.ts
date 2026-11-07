
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const marketSymbols: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "JPY=X",
  XPT: "XPTUSD=X",
  XPD: "XPDUSD=X",
  SP500: "^GSPC",
  NASDAQ: "^IXIC",
  DOW: "^DJI",
  FTSE: "^FTSE",
  DAX: "^GDAXI",
  NIKKEI: "^N225",
  WTI: "CL=F",
  BRENT: "BZ=F",
  NATGAS: "NG=F"
};

let cachedPayload: {
  expiresAt: number;
  payload: Record<string, unknown>;
} | null = null;

let cachedGlobal: {
  expiresAt: number;
  payload: Record<string, unknown>;
} | null = null;

function jsonResponse(
  payload: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=15"
    }
  });
}

async function fetchQuote(symbol: string) {
  const encodedSymbol = encodeURIComponent(symbol);

  const hosts = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com"
  ];

  let lastError = "Quote unavailable";

  for (const host of hosts) {
    const url =
      `https://${host}/v8/finance/chart/${encodedSymbol}?range=5d&interval=1d`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0"
        }
      });

      if (!response.ok) {
        lastError = `Yahoo returned HTTP ${response.status}`;
        continue;
      }

      const data = await response.json();
      const result = data?.chart?.result?.[0];

      if (!result) {
        lastError = "Quote unavailable";
        continue;
      }

      return { data, error: null };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Request failed";
    } finally {
      clearTimeout(timer);
    }
  }

  return { data: null, error: lastError };
}

async function loadGlobalData() {
  if (cachedGlobal && Date.now() < cachedGlobal.expiresAt) {
    return jsonResponse(cachedGlobal.payload);
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/global",
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data?.data?.market_cap_percentage?.btc ||
        !data?.data?.total_market_cap?.usd) {
      throw new Error("CoinGecko global data is incomplete");
    }

    const payload = {
      global: data.data,
      fetchedAt: new Date().toISOString()
    };

    cachedGlobal = {
      expiresAt: Date.now() + 60000,
      payload
    };

    return jsonResponse(payload);
  } catch (error) {
    // Use the last successful response if CoinGecko is temporarily unavailable.
    if (cachedGlobal) {
      return jsonResponse({
        ...cachedGlobal.payload,
        stale: true
      });
    }

    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "Global market data unavailable"
    }, 502);
  }
}

async function loadYahooQuotes() {
  if (cachedPayload && Date.now() < cachedPayload.expiresAt) {
    return jsonResponse(cachedPayload.payload);
  }

  const entries = Object.entries(marketSymbols);
  const quotes: Record<string, unknown> = {};

  // Limit concurrent Yahoo requests to four.
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);

    const results = await Promise.all(
      batch.map(async ([key, symbol]) => {
        const result = await fetchQuote(symbol);
        return { key, result };
      })
    );

    for (const item of results) {
      quotes[item.key] = item.result.data
        ? item.result.data
        : { error: item.result.error };
    }
  }

  const successful = Object.values(quotes).filter((quote) => {
  return (
    typeof quote === "object" &&
    quote !== null &&
    !("error" in quote)
  );
}).length;

  const payload = {
    quotes,
    successful,
    total: entries.length,
    fetchedAt: new Date().toISOString()
  };

  if (successful > 0) {
    cachedPayload = {
      expiresAt: Date.now() + 20000,
      payload
    };
  }

  return jsonResponse(payload);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    let body: Record<string, unknown> = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action = body.action || "quotes";

    if (action === "global") {
      return await loadGlobalData();
    }

    if (action === "quotes") {
      return await loadYahooQuotes();
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "Market data service unavailable"
    }, 500);
  }
});
