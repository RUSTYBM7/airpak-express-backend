module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.json({ passUrl: 'https://example.com/mock.pkpass', signed: false });
};
