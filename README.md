# BookSwap

BookSwap helps readers share books they have finished and find books they want to read. The project contains a React/Vite frontend and an Express/MongoDB API.

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

Demo login: `minhanh@bookswap.test` / `BookSwap123!`

Admin login: open `/admin` and use `admin` / `admin`.

The seed command is safe to rerun: it updates only the dedicated `@bookswap.test` demo accounts and their sample books, including a sale listing with stock for testing purchases. The built-in admin password is intentionally weak for local testing only; change it immediately and do not expose this seed account in production.

## Included features

- Create an account and sign in with a JWT-backed session.
- Browse and search available books in separate sale and trade tabs.
- List books for sale with a seller-selected price and stock quantity, or list books for trade as before. Sale stock is reserved when an order is placed; sold-out listings disappear from public browsing.
- Add books to a personal shelf or wishlist, with book credit estimates based on price and condition.
- Find three-member trade loops that match available books against each member's wishlist.
- Open a dedicated book-details page with a seller-uploaded photo, summary, listed condition, sale price, quantity selector, and COD purchase form. Successful purchases open an order confirmation page.
- Sellers may request Gemini Vision to assess a book photo and suggest its condition and price. The seller chooses the final sale price; AI results are estimates, not professional appraisals. Images are sent to Google only after the uploader explicitly consents.
- Pay on delivery or redeem book credits at 1 point = 1,000 VND.
- Earn credits only after successful delivery and admin approval, and only when Gemini assesses the book as new/like new with low damage.
- View book summaries, listed condition, and seller-reported damage; owners cannot delete their listings.
- Admins can view users, books, damage levels, completed trade/maintenance-fee statistics, and completed sale totals (including order quantities).
- A 2% maintenance fee is calculated from cover price and is visible only to the book owner and admins. Couriers confirm delivery; admins review proof, record the fee, and award eligible credits. No payment gateway is connected; COD is collected by the courier.
- Admins can create courier accounts, assign delivery orders, and contact couriers by phone, SMS, or WhatsApp.
- Couriers sign in at `/courier`, update delivery status, and upload a JPEG, PNG, or WebP delivery photo (up to 5 MB). The courier confirmation marks the book exchanged; admins review the protected photo and record the 2% fee.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- Admin login: `POST /api/auth/admin/login`; protected dashboard APIs under `/api/admin`
- Courier login: `POST /api/auth/courier/login`; courier delivery APIs under `/api/courier`
- `GET /api/books?search=...&listingMode=SALE|TRADE`, `GET /api/books/:id`, `GET /api/books/:id/image`, `GET /api/books/user/:userId`
- Authenticated book analysis/listing: `POST /api/books/analyze`, `POST /api/books`, `POST /api/books/:id/orders`
- Authenticated orders: `GET /api/books/orders/mine`, `GET /api/books/orders/:orderId`
- Admin assignment: `POST /api/admin/deliveries/:deliveryId/assign`
- Authenticated book management: `PATCH /api/books/:id`; deleting books is admin-only
- Authenticated matching: `GET /api/trades/find-loops`
