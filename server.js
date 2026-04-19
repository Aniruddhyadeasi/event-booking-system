require("dotenv").config();
const app = require('./app');
const connectDB = require('./config/db.js');
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();