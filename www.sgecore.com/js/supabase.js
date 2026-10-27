
const SUPABASE_URL = "https://qxyasakmlpijkgtlicli.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCAYceiMKHFobwXoaehSEg_hb_Qs4a1";

const { createClient } = supabase;

const sgecoreSupabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
