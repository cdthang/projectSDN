# BookSwap

BookSwap helps readers share books they have finished and find books they want to read. The project contains a React/Vite frontend and an Express/MongoDB API.

## Frontend structure

Role-specific screens live under `frontend/src/roles`:

- `user/screens` — discovery, book details, and order confirmation.
- `user/components` — user-only features such as trade-loop matching.
- `admin/screens` — administration dashboard and management screens.
- `courier/screens` — courier login, available deliveries, and delivery confirmation.
- `frontend/src/App.jsx` — routes the URL to the appropriate role screen.
- `frontend/src/services` — shared API client; `frontend/src/style.css` — shared styles.

## Requirements

- Node.js 18 or newer
- MongoDB
- Backend environment variables in `backend/.env`:
  - `MONGO_URI` — MongoDB connection string
  - `JWT_SECRET` — a long, private signing secret
  - `PORT` — optional; defaults to `5000`
  - `FRONTEND_URL` — optional; defaults to `http://localhost:5173`
  - `GEMINI_API_KEY` — required for book-photo analysis; get it from Google AI Studio and keep it only in `backend/.env`
  - `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`
  - Start from [`backend/.env.example`](./backend/.env.example), then set your own private MongoDB URI, JWT secret, and Gemini API key.

## Run locally

Install dependencies and start the API:

```powershell
cd backend
npm install
npm run dev
```

In a second terminal, start the web app:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. The API health check is available at `/api/health`.
The frontend uses `http://localhost:9999/api` by default in this checkout. If the backend uses another port, set `VITE_API_URL` in `frontend/.env.local` (for example, `VITE_API_URL=http://localhost:5000/api`) and restart Vite.

## Demo data

With `MONGO_URI` configured in `backend/.env`, run this once to create or refresh the local demo accounts and sample books:

```powershell
cd backend
npm run seed
```

Demo user login: `minhanh@bookswap.test` / `BookSwap123!`

Admin login: open `/admin` and use `admin` / `admin`.

Courier login: open `/courier` and use any `courier1@bookswap.test` through `courier7@bookswap.test` with `BookSwap123!`.

The seed command creates 10 sample sale listings, 10 trade listings, 3 user accounts, 7 courier accounts, and an admin. It is safe to rerun: it only updates the dedicated `@bookswap.test` demo accounts and their sample books. The built-in admin password is intentionally weak for local testing only; change it immediately and do not expose this seed account in production.

## Included features

- Create an account and sign in with a JWT-backed session.
- Browse and search available books in separate sale and trade tabs.
- List books for sale with a seller-selected cash price and stock quantity, or list a single book for trade with both points and cash checkout options. Sale stock or trade listings are reserved when an order is placed.
- Add books to a personal shelf or wishlist, with book credit estimates based on price and condition.
- Find three-member trade loops that match available books against each member's wishlist.
- Open a dedicated book-details page with a seller-uploaded photo, summary, listed condition, sale price, quantity selector, and COD purchase form. Successful purchases open an order confirmation page.
- Gemini Vision assesses each owned-book photo at listing time and suggests a cash price, condition, and damage level; sellers choose the final cash price. Assessment details stay private to the seller/admin; a trade listing exposes only its calculated points price to buyers. Images are sent to Google only after the uploader explicitly consents.
- Pay on delivery or redeem book credits at 1 point = 1,000 VND.
- On completed delivery and admin approval, book owners receive credits based on Gemini's estimated value and damage: low damage 100%, medium 75%, high 50%, at 1 point = 1,000 VND. Buyers can redeem the full calculated points value for a trade listing or pay its seller-selected cash price.
- View book summaries, listed condition, and seller-reported damage; owners cannot delete their listings.
- Admins can view users, books, damage levels, completed trade/maintenance-fee statistics, and completed sale totals (including order quantities).
- A 2% maintenance fee is calculated from cover price and is visible only to the book owner and admins. Couriers cannot view this fee. Couriers confirm delivery; admins review proof, record the fee, and award eligible credits. No payment gateway is connected; COD is collected by the courier.
- Admins can review user, book, order, courier, and transaction details; create or lock/unlock courier accounts; and approve completed delivery evidence. They cannot create delivery orders.
- Couriers sign in at `/courier`, choose and claim an available delivery order, update its status, and upload a JPEG, PNG, or WebP delivery photo (up to 5 MB). Claiming is atomic so only one courier can take an order. Admins review the protected photo and record the 2% fee.
- In-app chat stores message history and supports browser-to-browser voice calls. Admins may contact users and couriers; users and couriers may contact only people connected to a shared delivery. Calls require microphone permission and a secure context (localhost or HTTPS).
- Courier accounts can be locked from the admin panel; locked accounts cannot sign in, use authenticated APIs, or connect to chat.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- Admin login: `POST /api/auth/admin/login`; protected dashboard APIs under `/api/admin`
- Admin courier status: `PATCH /api/admin/couriers/:courierId/status`
- Courier login: `POST /api/auth/courier/login`; courier delivery APIs under `/api/courier`
- Chat history and contacts: protected endpoints under `/api/chat`; realtime chat and WebRTC signaling use Socket.IO with authenticated conversation membership.
- `GET /api/books?search=...&listingMode=SALE|TRADE`, `GET /api/books/:id`, `GET /api/books/:id/image`, `GET /api/books/user/:userId`
- Authenticated book analysis/listing: `POST /api/books/analyze`, `POST /api/books`, `POST /api/books/:id/orders`
- Authenticated orders: `GET /api/books/orders/mine`, `GET /api/books/orders/:orderId`
- Couriers list and claim available jobs: `GET /api/courier/deliveries`, `POST /api/courier/deliveries/:deliveryId/claim`
- Authenticated book management: `PATCH /api/books/:id`; deleting books is admin-only
- Authenticated matching: `GET /api/trades/find-loops`
