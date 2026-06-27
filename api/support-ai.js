module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const history = req.body?.history || [];
  const last = (history[history.length - 1]?.content || '').toLowerCase();
  let reply = "Hi! I'm Mavis, the AirPak assistant. How can I help with your parcel today?";
  if (last.includes('track') || last.includes('where') || last.includes('status')) {
    reply = "Your parcel is currently in transit. Customs cleared at 09:42 SGT, and it's on the way to the local linehaul hub. ETA is in about 5 hours.";
  } else if (last.includes('price') || last.includes('cost') || last.includes('rate')) {
    reply = "Express service from Kuala Lumpur to Jakarta is 49.80 USD for a 4.2kg parcel. Airpak Coin (APC) is accepted at 1:1 USD.";
  } else if (last.includes('refund')) {
    reply = "Refunds are processed within 5–7 business days. I can escalate this for you — would you like me to file a refund request?";
  } else if (last.includes('hold') || last.includes('customs')) {
    reply = "Holds are usually resolved in 24–48 hours. Could you confirm the sender's full name and address?";
  } else if (last.includes('apc') || last.includes('airpak coin') || last.includes('coin')) {
    reply = "Airpak Coin (APC) is our settlement token. 1 APC = 1 USD. You can buy, deposit, or pay with it.";
  } else if (last.length > 5) {
    reply = "Tracking is APK2026052900003, status In transit. ETA in transit 5h 42m. Let me know if you need anything else.";
  }
  res.json({ role: 'assistant', content: reply });
};
