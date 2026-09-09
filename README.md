# Campus Connect Slot Booking

Full-stack React, Vite, Express, and MongoDB booking application.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Leave `MONGO_URI` blank to use the local MongoDB Memory Server, or provide a MongoDB URI.
4. Start the app with `npm run dev`.
5. Open `http://localhost:5173`.

Demo accounts:

- Admin: `admin@campus.com` / `admin123`
- Student: `student@campus.com` / `student123`

## MongoDB Atlas

Create a cluster and database user in MongoDB Atlas, add the deployment IP to Network Access, then set `MONGO_URI` in `.env` to the Atlas connection string. Set `MONGO_DB_NAME` to the database name you want to use.

For production, also set a long random `JWT_SECRET`, `NODE_ENV=production`, and `CLIENT_ORIGIN` to the deployed frontend origin. Never commit `.env`.

## Production

Build the frontend with `npm run build`, then run `npm start`. In production the Express server serves the built frontend and API from one origin. If hosting the frontend separately, set `VITE_API_URL` to the API origin before running the build.

The API enforces authentication, scopes student bookings to the logged-in user, and restricts booking deletion to admin tokens.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
