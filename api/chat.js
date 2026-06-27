module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.json({
    id: 'msg_' + Date.now(),
    role: 'agent',
    text: 'Thanks for reaching out. An agent will be with you shortly.',
    sentAt: new Date().toISOString(),
  });
};
