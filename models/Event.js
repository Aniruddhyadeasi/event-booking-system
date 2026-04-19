// models/Event.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      default: "General",
    },

    venue: {
      type: String,
      required: true,
    },

    eventDate: {
      type: Date,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },

    bookedSeats: {
      type: Number,
      default: 0,
      min: 0,
    },

    availableSeats: {
      type: Number,
      default: function () {
        return this.totalSeats;
      },
    },

    status: {
      type: String,
      enum: ["draft", "published", "cancelled"],
      default: "published",
    },

    imageUrl: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);