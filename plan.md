Project Architecture Overview

The application will act as a centralized aggregator. Since SimpleFIN acts as a bridge for traditional institutions (Chase, Capital One, etc.), the hub will require a custom adapter for on-chain Solana data.

Phase 1: Infrastructure & SimpleFIN Bridge

Objective: Establish the secure connection to traditional financial data via the SimpleFIN protocol.

 Tech Stack Definition

    Frontend/API: Next.js (App Router, TypeScript)

    Backend/Database: Supabase (PostgreSQL, Auth, Edge Functions)

    Traditional Finance Bridge: SimpleFIN API

    On-Chain Data: Solana Web3.js / Helius RPC

    Testing: Vitest (Unit/Integration) & Playwright (E2E)

Phase 0: Core Infrastructure & Supabase Schema

Objective: Scaffold the Next.js environment and define the Supabase data layer.

    Task 0.1: Project Initialization ✅ COMPLETE

        ✅ Initialize Next.js with TypeScript, Tailwind CSS, and Shadcn/UI.

        ⏳ Set up Supabase CLI and link the local environment. (deferred to Task 0.2)

    Task 0.2: Database Modeling ✅ COMPLETE

        ✅ Create profiles table (linked to auth.users).

        ✅ Create accounts table: id, user_id, provider (SimpleFIN/Solana), name, type, balance_usd.

        ✅ Create snapshots table: id, account_id, timestamp, value_usd (for time-series charting).

        ✅ Set up Supabase CLI and client libraries.

        Success Criteria: supabase db remote commit completes without errors. (Migration ready)

Phase 1: SimpleFIN & Solana Integration

Objective: Securely ingest data from all prioritized sources.

    Task 1.1: SimpleFIN Adapter ✅ COMPLETE

        ✅ Implement Server Action to fetch and cache balances from Chase, Capital One, Robinhood, Schwab, and Coinbase via SimpleFIN.

        ✅ SimpleFIN API client with token claiming and account fetching.

        ✅ Data transformation from SimpleFIN format to database schema.

    Task 1.2: Solana Wallet Aggregator ✅ COMPLETE

        ✅ Implement a service using @solana/web3.js to fetch SOL and SPL token balances.

        ✅ Integrate a price feed (e.g., Jupiter or CoinGecko) to convert token balances to USD.

        ✅ Server Actions for connecting, syncing, and removing Solana wallets.

    Task 1.3: Data Synchronization Worker ✅ COMPLETE

        ✅ Build a Supabase Edge Function to poll all providers and write snapshots to the database.

        ✅ Unified sync action for triggering all provider syncs.

        ✅ Portfolio history and value aggregation functions.

Phase 2: Dashboard & Time-Series Visuals

Objective: UI implementation of the 1h, 1d, 1w, 1m views.

    Task 2.1: Chart Data Aggregation ✅ COMPLETE

        ✅ Write a Postgres function or API route to aggregate snapshots into time-bucketed intervals (1h, 1d, etc.).

    Task 2.2: Frontend Dashboard ✅ COMPLETE

        ✅ Build the main dashboard using Recharts or Chart.js.

        ✅ Implement timeframe toggle buttons that trigger data re-fetching.

        ✅ Portfolio summary with total value, 24h change, and sync button.

        ✅ Accounts list with sorting by balance.

        Success Criteria: Chart updates dynamically when toggling from "1d" to "1w".

Phase 2.5: User Authentication ✅ COMPLETE

Objective: Implement user authentication flow.

    Task 2.3: Authentication UI ✅ COMPLETE

        ✅ Create auth form component for email/password sign in and sign up.

        ✅ Add auth callback route for email confirmation.

        ✅ Update dashboard to check auth state and show auth form if not logged in.

        ✅ Add sign out button to dashboard.

        Success Criteria: Users can sign in/up and access their connected accounts.

Phase 3: Testing & Quality Assurance ✅ COMPLETE

Objective: Achieve 95% passing rate across unit and end-to-end tests.

    Task 3.1: Unit & Integration Testing (Vitest) ✅ COMPLETE

        ✅ Write tests for data transformation logic (SimpleFIN JSON → DB Schema).

        ✅ Write tests for Solana data transformation.

        ✅ Write tests for SimpleFIN type inference.

        Target: 100% coverage of utility functions and data parsers.

    Task 3.2: E2E Testing (Playwright) ✅ COMPLETE

        ✅ Configure Playwright with Chromium, Firefox, and Webkit.

        ✅ Create E2E tests for dashboard navigation and components.

        Success Criteria: Playwright test suite passes on Chromium, Firefox, and Webkit.

    Task 3.3: CI/CD Pipeline & Coverage Enforcement ✅ COMPLETE

        ✅ Configure GitHub Actions to run npm run test and npm run test:e2e on every PR.

        ✅ Add lint, type check, and build jobs.

        Success Criteria: Pipeline fails if passing rate falls below 95%.