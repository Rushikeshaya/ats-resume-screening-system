require('dotenv').config();
const app = require('./app');
const store = require('./store/screeningStore');

const PORT = process.env.PORT || 5000;

store
  .init()
  .then(({ file, count }) => {
    console.log(`History file: ${file} (${count} saved screenings)`);
    app.listen(PORT, () => console.log(`ATS server listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
