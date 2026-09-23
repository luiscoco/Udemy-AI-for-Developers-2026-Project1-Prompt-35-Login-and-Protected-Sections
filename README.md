# Prompt E — Adding a Login Flow to the Frontend

This guide walks through how the AI assistant carried out **Prompt E: "Frontend: login flow and auth-aware API client"**. The goal is to show the *process* as well as the result: how to read an existing codebase, plan a change, build it in small pieces, and check it before calling it done.

The backend already had `POST /api/auth/login` and `GET /api/auth/me`. The shared `@equipment-hub/contract` package already had the `LoginRequest`, `LoginResponse` and `User` types. This prompt only changes the React frontend in `apps/frontend`.

---

## Step 1 — Read before writing

Before changing any code, the assistant read the parts of the project the prompt touches:

| What was read | Why |
| --- | --- |
| Root `package.json` and the file tree | To see the monorepo layout (`apps/*`, `packages/*`) and the scripts |
| `apps/frontend/package.json`, `vite.config.ts`, `tsconfig.json` | To learn the test setup (Vitest + jsdom + Testing Library) and TypeScript settings |
| `src/main.tsx`, `src/App.tsx`, `src/api/client.ts` | The files the prompt asks to change |
| `src/App.test.tsx` | The prompt says to *"mock the API calls the same way existing frontend tests do"*, so the existing mocking pattern (`vi.mock("./api/client", ...)`) had to be copied |
| `packages/contract/src/index.ts` and `types.gen.ts` | To use the real `User`, `LoginRequest` and `LoginResponse` types instead of inventing new ones |
| `apps/backend/src/routes/auth.ts` | To see how the API behaves, e.g. login returns **401** for a wrong password |
| `styles.css`, `eslint.config.js`, `prisma/seed.ts` | To match the existing CSS classes and lint rules, and to find the demo users |

> **Lesson:** a prompt names the files to change, but not the conventions around them. Reading first means the new code matches the old code.

---

## Step 2 — Design decisions

Some design questions came up while reading. Each one got a decision before any code was written:

1. **How does the API client get the token without depending on React?**
   A small plain TypeScript module, `src/auth/session.ts`, stores the token. Both the React context and the API client read from it, and neither imports the other.

2. **How does the API client "log the user out" on a 401?**
   `session.ts` also keeps an *unauthorized handler*, a callback that `AuthProvider` registers when it mounts. On a 401 the client clears the token and calls that handler, and React switches back to the login form.

3. **What about a 401 from the login endpoint itself?**
   Here a 401 only means *wrong email or password*, not *your session expired*. Logging out would be wrong, so the login request passes a `skipUnauthorizedHandling` option and the error goes back to the form.

4. **"Redirect to login" when there is no router**
   The app doesn't use React Router, so there is no URL to redirect to. The "redirect" is a state change: when `user` becomes `null`, `App` shows `<LoginForm />`.

5. **Where does `AuthProvider` live?**
   Inside `App.tsx` rather than `main.tsx`. That way `render(<App />)` in tests includes authentication automatically.

---

## Step 3 — Implement in small pieces

The files were built in dependency order, from the bottom layer to the top.

### 3.1 `src/auth/session.ts` (new)
- `getToken`, `setToken` and `clearToken` wrap `localStorage`. Each call is inside `try/catch`, because storage can be unavailable (for example in private browsing).
- `setUnauthorizedHandler(fn)` registers the logout callback and returns an *unregister* function.
- `notifyUnauthorized()` clears the token and calls the handler.

### 3.2 `src/api/client.ts` (updated)
- Every request adds `Authorization: Bearer <token>` when a token exists.
- A `401` response calls `notifyUnauthorized()`, unless the request set `skipUnauthorizedHandling`.
- Two new endpoint functions were added: `login(credentials)` and `getCurrentUser()`.

### 3.3 `src/auth/AuthContext.tsx` (new)
- `AuthProvider` holds `{ user, token }` plus an `initializing` flag.
- **On load:** if a token is stored, it calls `GET /api/auth/me` to get the user back. If that call fails, it logs out.
- `login(email, password)` calls the API, saves the token and sets the user.
- `logout()` clears the token and the state.
- `useAuth()` returns the context and throws a clear error if it is used outside the provider.
- The effect uses a `cancelled` flag so React StrictMode, which runs effects twice in development, doesn't cause stale updates.

### 3.4 `src/components/LoginForm.tsx` (new)
- Email and password fields with labels, and a submit button that is disabled while the request is running.
- Shows the server's error message (for example *"Invalid email or password"*) in an `.alert` with `role="alert"`.

### 3.5 `src/App.tsx` (updated)
- The old `App` component was renamed to **`WorkOrderWorkspace`**. Its body did not change.
- The new `App` is `<AuthProvider><AuthGate /></AuthProvider>`.
- `AuthGate` shows one of three screens:
  - *"Checking session..."* while the stored token is being checked
  - `LoginForm` when there is no user
  - otherwise `AppHeader` and `WorkOrderWorkspace`
- `AppHeader` shows the user's **name**, **role** and a **Log out** button.

### 3.6 `src/styles.css` (updated)
Adds styles for the header bar and a centred login card. They reuse the existing CSS variables (`--color-primary`, `--radius`, and so on).

---

## Step 4 — Tests

The same mocking pattern as the existing tests was used: `vi.mock("./api/client", ...)` keeps the real module and replaces selected functions with `vi.fn()`.

| Test file | What it checks |
| --- | --- |
| `src/auth/AuthContext.test.tsx` (new) | Login saves the token and user, and logout clears them · a failed login stores nothing · the user is restored from a stored token via `/me` · a failed `/me` logs out · a 401 from the client logs out |
| `src/api/client.test.ts` (new) | The `Authorization` header is sent when there is a token and left out when there isn't · a 401 clears the token and calls the handler · a 401 from **login** does *not* log out |
| `src/App.test.tsx` (updated) | The login form shows when no one is signed in · an inline error shows on a failed login · logging in shows the board with the user's name and role · a stored session shows the board, and Log out returns to the login form |

Two supporting changes:
- `src/setupTests.ts` now calls `localStorage.clear()` after each test, so one test's token doesn't leak into the next.
- The existing integration test in `App.test.tsx` now starts from a signed-in session (`signInAsStoredUser()`), because the board is only visible after login.

---

## Step 5 — Verify

The first test run failed because the root `node_modules` folder was missing. The fix was to install dependencies from the lockfile:

```bash
npm ci
```

After that, these checks ran:

```bash
cd apps/frontend
npx vitest run          # 6 test files, 28 tests, all passing
npx tsc -p . --noEmit   # 1 error, in code this prompt didn't touch (see below)
npx eslint apps/frontend   # run from the repo root: no problems
npx vite build          # production build succeeds
```

The one TypeScript error is in `ClientApiError`, which already existed before this prompt. Because `exactOptionalPropertyTypes` is enabled, `this.details = details` isn't allowed when `details` can be `undefined`. It was reported rather than silently fixed, because it's outside the prompt's scope. The fix is one line: declare the field as `readonly details: Record<string, unknown> | undefined`.

> **Lesson:** run every check, and report exactly what fails, including problems that were already there.

---

## Running the app on Windows (Windows Terminal / PowerShell)

The backend stores its data in **SQL Server** through Prisma, so SQL Server has to be running before you start the app. `apps/backend/README.md` explains how to install SQL Server and configure the database.

### One-time setup

Open **Windows Terminal** (PowerShell) and run:

```powershell
# 1. Go to the project root. Keep the quotes: the path has spaces in it.
cd "C:\0. IMPORTANTE - atmira---Curso-AI-SDD-main\Curso Udemy 1 AI Para programadores\Project equipment_maintenance_hub_React_Vite_Fastify_TypeScrip\Prompt 35 -"

# 2. Install all workspace dependencies from the lockfile
npm ci

# 3. Make sure SQL Server is running (run this in an Administrator terminal)
net start MSSQLSERVER

# 4. Create the backend config file, then edit DATABASE_URL and JWT_SECRET
#    (skip this step if apps\backend\.env already exists)
Copy-Item apps\backend\.env.example apps\backend\.env

# 5. Create the database tables and load the demo data (including the demo users)
npm run db:migrate --workspace=@equipment-hub/backend
npm run db:seed --workspace=@equipment-hub/backend
```

If you use a named SQL Server instance such as SQL Express, the service is called `MSSQL$SQLEXPRESS`, so step 3 becomes `net start 'MSSQL$SQLEXPRESS'`. Use single quotes so PowerShell doesn't treat `$SQLEXPRESS` as a variable.

### Start the app

From the project root:

```powershell
npm run dev
```

This starts both apps together:

| App | URL |
| --- | --- |
| Backend (Fastify API) | http://127.0.0.1:3001 |
| Frontend (Vite + React) | **http://localhost:5173** |

The frontend forwards every `/api/...` request to the backend, so you only need to open http://localhost:5173. Press **Ctrl + C** to stop both.

### Running the apps separately (optional)

To see each app's logs on its own, open two Windows Terminal tabs in the project root:

```powershell
# Tab 1 — backend
npm run dev --workspace=@equipment-hub/backend
```

```powershell
# Tab 2 — frontend
npm run dev --workspace=@equipment-hub/frontend
```

### Running the tests

```powershell
npm test                                        # all workspaces
npm test --workspace=@equipment-hub/frontend    # frontend only
```

---

## Try it yourself

Start the app as described in the section above, then open http://localhost:5173 and log in with one of the demo users from `apps/backend/prisma/seed.ts`:

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin@equipment-hub.test` | `Admin!2345` |
| supervisor | `supervisor@equipment-hub.test` | `Super!2345` |
| technician | `elena.vasquez@equipment-hub.test` | `Tech!2345` |

Things to try:
- Refresh the page. You stay logged in, because the token is in `localStorage`.
- Click **Log out**. You return to the login form.
- Enter a wrong password. An inline error appears.

---

## Summary of files

```
apps/frontend/src/
├── auth/
│   ├── session.ts              NEW   token storage + 401 handler
│   ├── AuthContext.tsx         NEW   AuthProvider + useAuth()
│   └── AuthContext.test.tsx    NEW
├── api/
│   ├── client.ts               EDIT  Bearer header, 401 → logout, login(), getCurrentUser()
│   └── client.test.ts          NEW
├── components/
│   └── LoginForm.tsx           NEW
├── App.tsx                     EDIT  AuthGate + AppHeader, old App → WorkOrderWorkspace
├── App.test.tsx                EDIT  auth tests + signed-in integration test
├── setupTests.ts               EDIT  clears localStorage between tests
└── styles.css                  EDIT  header + login styles
```
