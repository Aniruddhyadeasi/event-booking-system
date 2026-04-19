const express = require("express");
const cors = require("cors");

const app = express();

/**
 * Route Imports
 */
const userRoutes = require("./routes/UserRoutes");
const eventRoutes = require("./routes/EventRoutes");
const bookingRoutes = require("./routes/BookingRoutes");

/**
 * Middlewares
 */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/**
 * Health Check
 */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Event Booking API Running 🚀",
  });
});

/**
 * API Routes
 */
app.use("/api/users", userRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/bookings", bookingRoutes);

/**
 * 404 Route Handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/**
 * Global Error Handler
 */
app.use((err, req, res, next) => {
  console.error("ERROR:", err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;