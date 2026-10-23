const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Clinic Booking API running on http://127.0.0.1:${PORT}`);
});
