module.exports = (req, res) => {
  res.json({ status: 'ok', service: 'airpak-express-backend', uptime: process.uptime() });
};
