export default function handler(req, res) {
  const key = process.env.RETAILCRM_API_KEY || "";
  const url = process.env.RETAILCRM_URL || "";
  return res.status(200).json({
    RETAILCRM_URL: url,
    RETAILCRM_API_KEY_length: key.length,
    RETAILCRM_API_KEY_first4: key.slice(0, 4),
    RETAILCRM_API_KEY_last4: key.slice(-4),
    SUPABASE_URL: (process.env.SUPABASE_URL || "").slice(0, 30),
    TELEGRAM_BOT_TOKEN_set: !!process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
  });
}
