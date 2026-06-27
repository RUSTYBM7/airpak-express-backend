module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.json({
    id: 'msg_' + Date.now(),
    role: 'agent',
    text: 'Acknowledged. Will follow up.',
    sentAt: new Date().toISOString(),
  });
};
