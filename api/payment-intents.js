module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.json({
    id: 'pi_mock_' + Date.now(),
    client_secret: 'pi_mock_secret_' + Math.random().toString(36).slice(2),
    amount: req.body?.amount ?? 0,
    currency: req.body?.currency ?? 'USD',
    status: 'requires_confirmation',
  });
};
