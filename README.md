# Event Booking System API

A Node.js + Express + MongoDB backend for an **Event Booking System** with **Role-Based Access Control (RBAC)** for Organizers and Customers.

Organizers can create and manage events. Customers can browse events and book tickets.

The project also includes asynchronous background tasks for:

* Booking confirmation notifications
* Event update notifications

---

# Tech Stack

* Node.js
* Express.js
* MongoDB Atlas / MongoDB
* Mongoose
* JWT Authentication
* bcryptjs
* Async background jobs using `setImmediate()`

---

# Features

## Authentication

* Register User
* Login User
* JWT Protected Routes
* Get Logged-in User Profile

## Roles

### Organizer

* Create Event
* Update Own Event
* Delete Own Event
* View Own Events
* View Bookings for Own Event

### Customer

* Browse Events
* Book Tickets
* View My Bookings
* Cancel Booking

---

# Background Tasks

## Task 1: Booking Confirmation

Triggered when customer books tickets successfully.

Example console output:

```txt
📧 BOOKING CONFIRMATION EMAIL
To: amit@example.com
Event: Food Fest Kolkata
```

## Task 2: Event Update Notification

Triggered when organizer updates an event.

Example console output:

```txt
📢 EVENT UPDATE NOTIFICATION
User Email: amit@example.com
Event: Food Fest Kolkata
```

---

# Folder Structure

```txt
Event_Booking/
|──config/
|  ├──db.js
│── controllers/
│   ├── UserController.js
│   ├── EventController.js
│   └── BookingController.js
│
│── middleware/
│   └── authMiddleware.js
│
│── models/
│   ├── User.js
│   ├── Event.js
│   └── Booking.js
│
│── routes/
│   ├── UserRoutes.js
│   ├── EventRoutes.js
│   └── BookingRoutes.js
│
│── utils/
│   └── asyncJobs.js
│
│── app.js
│── server.js
│── .env
│── package.json
```

---

# Installation

## 1. Clone Project

```bash
git clone https://github.com/Aniruddhyadeasi/event-booking-system
cd Event_Booking
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Create `.env`

```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

## 4. Run Server

```bash
npm run dev
```

or

```bash
node server.js
```

---

# API Base URL

```txt
http://localhost:3000/api
```

---

# API Endpoints

# User Routes

| Method | Endpoint        | Access  |
| ------ | --------------- | ------- |
| POST   | /users/register | Public  |
| POST   | /users/login    | Public  |
| GET    | /users/me       | Private |

---

# Event Routes

| Method | Endpoint               | Access    |
| ------ | ---------------------- | --------- |
| GET    | /events                | Public    |
| GET    | /events/:id            | Public    |
| POST   | /events                | Organizer |
| GET    | /events/my-events/list | Organizer |
| PATCH  | /events/:id            | Organizer |
| DELETE | /events/:id            | Organizer |

---

# Booking Routes

| Method | Endpoint                 | Access    |
| ------ | ------------------------ | --------- |
| POST   | /bookings                | Customer  |
| GET    | /bookings/my-bookings    | Customer  |
| GET    | /bookings/:id            | Customer  |
| PATCH  | /bookings/:id/cancel     | Customer  |
| GET    | /bookings/event/:eventId | Organizer |

---

# Authentication Header

Protected routes require JWT token:

```txt
Authorization: Bearer YOUR_TOKEN
```

---

# Sample Users

## Organizer

```json
{
  "fullName": "Rahul Organizer",
  "email": "rahul@example.com",
  "password": "123456",
  "role": "organizer"
}
```

## Customer

```json
{
  "fullName": "Amit Customer",
  "email": "amit@example.com",
  "password": "123456",
  "role": "customer"
}
```

---

# Important Logic Implemented

## Prevent Overselling Tickets

Bookings use MongoDB transactions to ensure seats cannot be overbooked.

## Ownership Security

Organizers can only update/delete their own events.

## Role-Based Authorization

Users can access only routes allowed by their role.

---

# Future Improvements

* Payment Gateway Integration
* Email Service (SendGrid / Nodemailer)
* Redis Queue
* Swagger API Docs
* Docker Deployment
* Admin Dashboard

---

# Author
Aniruddhya Deasi  
Backend Developer specializing in Node.js, Express.js, MongoDB

Built using Node.js, Express, MongoDB.
