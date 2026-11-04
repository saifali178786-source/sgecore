
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const SUPPORTED_ASSETS = ["USDT", "BTC", "ETH", "XAUT", "PAXG"];
const FEE_RATE = 0.005;
const MINIMUM_USD = 1;
const QUOTE_VALIDITY_SECONDS = 30;

async function getMarketPrices(apiKey: string) {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price" +
      "?ids=bitcoin,ethereum,tether-gold,pax-gold" +
      "&vs_currencies=usd&precision=full",
    {
      headers: {
        "x-cg-demo-api-key": apiKey,
        "Accept": "application/json",
      },
    },
  );

  if (!response.ok) {
    console.error("CoinGecko HTTP status:", response.status);
    throw new Error("Unable to retrieve market prices.");
  }

  const market = await response.json();

  const prices: Record<string, number> = {
    USDT: 1,
    BTC: market.bitcoin?.usd,
    ETH: market.ethereum?.usd,
    XAUT: market["tether-gold"]?.usd,
    PAXG: market["pax-gold"]?.usd,
  };

  for (const asset of SUPPORTED_ASSETS) {
    const price = prices[asset];

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new Error(`A valid ${asset} price was not returned.`);
    }
  }

  return prices;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const apiKey = Deno.env.get("COINGECKO_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const publishableKey = publishableKeys
      ? JSON.parse(publishableKeys).default
      : anonKey;

    if (!apiKey || !supabaseUrl || !publishableKey) {
      return jsonResponse({
        error: "Server configuration is incomplete.",
      }, 500);
    }

    // Authenticate the customer.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({
        error: "Authentication required.",
      }, 401);
    }

    const token = authorization.replace("Bearer ", "");

    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      return jsonResponse({
        error: "Invalid user session.",
      }, 401);
    }

    const userId = userData.user.id;

    // Read the requested action.
    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({
        error: "Invalid JSON request.",
      }, 400);
    }

    const action = body.action ?? "prices";

    if (action !== "prices" && action !== "quote") {
      return jsonResponse({
        error: "Unsupported action.",
      }, 400);
    }

    // Fetch current market prices.
    const prices = await getMarketPrices(apiKey);

    // ACTION 1: Return live asset prices.
    if (action === "prices") {
      return jsonResponse({
        success: true,
        action: "prices",
        provider: "CoinGecko",
        currency: "USD",
        prices,
        fetched_at: new Date().toISOString(),
      });
    }

    // ACTION 2: Validate and create a swap quote.
    const walletType = body.wallet_type;
    const fromCurrency = body.from_currency;
    const toCurrency = body.to_currency;
    const rawAmount = body.from_amount;

    if (
      walletType !== "funding" &&
      walletType !== "delivery"
    ) {
      return jsonResponse({
        error: "Invalid wallet type.",
      }, 400);
    }

    if (
      typeof fromCurrency !== "string" ||
      typeof toCurrency !== "string" ||
      !SUPPORTED_ASSETS.includes(fromCurrency) ||
      !SUPPORTED_ASSETS.includes(toCurrency)
    ) {
      return jsonResponse({
        error: "Unsupported swap currency.",
      }, 400);
    }

    if (fromCurrency === toCurrency) {
      return jsonResponse({
        error: "Source and destination currencies must be different.",
      }, 400);
    }

    const amountText = String(rawAmount ?? "");

    if (
      !/^\d+(\.\d{1,12})?$/.test(amountText)
    ) {
      return jsonResponse({
        error: "Enter a valid amount with up to 12 decimal places.",
      }, 400);
    }

    const fromAmount = Number(amountText);

    if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
      return jsonResponse({
        error: "Swap amount must be greater than zero.",
      }, 400);
    }

    const fromPrice = prices[fromCurrency];
    const toPrice = prices[toCurrency];

    const grossUsdValue = fromAmount * fromPrice;

    if (
      !Number.isFinite(grossUsdValue) ||
      grossUsdValue < MINIMUM_USD
    ) {
      return jsonResponse({
        error: "Minimum swap value is 1 USD.",
      }, 400);
    }

    // Fee is charged on the gross input amount.
    const feeAmount = fromAmount * FEE_RATE;
    const netAmount = fromAmount - feeAmount;

    // Convert the amount remaining after the fee.
    const exchangeRate = fromPrice / toPrice;
    const toAmount = netAmount * exchangeRate;

    if (
      !Number.isFinite(toAmount) ||
      toAmount <= 0 ||
      !Number.isFinite(exchangeRate) ||
      exchangeRate <= 0
    ) {
      return jsonResponse({
        error: "Unable to calculate the swap quote.",
      }, 502);
    }

    // Create an administrative client for secure quote storage.
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is missing.");

      return jsonResponse({
        error: "Quote service is not configured.",
      }, 500);
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const quotedAt = new Date();
    const expiresAt = new Date(
      quotedAt.getTime() +
        QUOTE_VALIDITY_SECONDS * 1000,
    );

    const quote = {
      user_id: userId,
      wallet_type: walletType,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      from_amount: fromAmount,
      fee_rate: FEE_RATE,
      fee_amount: feeAmount,
      to_amount: toAmount,
      from_price_usd: fromPrice,
      to_price_usd: toPrice,
      exchange_rate: exchangeRate,
      quoted_at: quotedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const { data: savedQuote, error: quoteError } =
      await adminClient
        .from("sde_asset_swap_quotes")
        .insert(quote)
        .select("id")
        .single();

    if (quoteError || !savedQuote) {
      console.error("Swap quote database error:", quoteError);

      return jsonResponse({
        error: "Unable to create your swap quote.",
      }, 500);
    }

    return jsonResponse({
      success: true,
      action: "quote",
      quote_id: savedQuote.id,
      provider: "CoinGecko",
      wallet_type: walletType,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      from_amount: fromAmount,
      fee_rate: FEE_RATE,
      fee_amount: feeAmount,
      net_from_amount: netAmount,
      from_price_usd: fromPrice,
      to_price_usd: toPrice,
      exchange_rate: exchangeRate,
      to_amount: toAmount,
      gross_usd_value: grossUsdValue,
      quoted_at: quotedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

  } catch (error) {
    console.error("Asset price function error:", error);

    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "An unexpected server error occurred.",
    }, 500);
  }
});
