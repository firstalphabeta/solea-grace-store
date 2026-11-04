# Jewellery store + lightweight business system

Static storefront (`web/`) + Google Apps Script backend (`apps-script/Code.gs`) on a Google Sheet. No payment gateway; payments are recorded manually by an admin.

## Setup
1. Create a Google Sheet. Extensions > Apps Script. Paste `apps-script/Code.gs`.
2. Run `setup()` once (creates all data sheets and a Dashboard with KPI cards and charts). Authorise when asked.
3. Edit the email/password inside `createAdmin()`, run it once, then change those two lines back. Use a long unique password.
4. Fill the **Settings** sheet: `business_name`, `whatsapp_number` (digits with country code, e.g. 233XXXXXXXXX), `delivery_fee_accra`, `delivery_fee_other`.
5. Add rows to **Categories**, **Products** (`active` = TRUE) and **Product_Variants** (one row per size/colour, with price, cost, stock, min_stock, `active` = TRUE; `product_id` must match Products).
6. Deploy > New deployment > Web app. Execute as: Me. Access: Anyone. Copy the URL into `web/config.js` (`API_URL`).
7. Run locally with `npx serve web` in VS Code, or deploy `web/` to Cloudflare Pages/Netlify. Admin is at `/admin.html`.

## Host the storefront on GitHub Pages
1. Create a GitHub repository named `solea-grace-store`. The GitHub account owner name becomes part of the site address.
2. Push this project to the repository's `main` branch.
3. In the repository, open **Settings > Pages** and set the build and deployment source to **GitHub Actions**.
4. The included `.github/workflows/pages.yml` publishes only the `web/` storefront. The site appears at `https://OWNER.github.io/solea-grace-store/` after the workflow completes.
5. To connect real products and orders, deploy the Apps Script separately, enter its web app URL in `web/config.js`, then push that change. Until connected, the storefront intentionally displays its sample catalog.

GitHub Pages hosts the public storefront only; it does not run the Apps Script backend or host the Google Sheet. The Apps Script remains deployed by Google. Do not put admin passwords, tokens, or other credentials in the public repository.

## How it works
- Stock is deducted when an order is placed (prevents overselling; a script lock serialises orders) and restored when an order is cancelled. Cancelled orders cannot be reopened.
- Prices, fees and discounts are always recalculated server-side. Orders are idempotent via `clientKey`.
- Orders start as Pending / Unpaid. Only an admin payment record changes payment status (Unpaid, Partially Paid, Paid, Refunded).
- Every status/payment change is written to **Order_History**.
- Revenue excludes Cancelled/Returned orders; cash received comes only from recorded payments; profit figures are estimates.
- The **Dashboard** tab summarizes sales, payments, outstanding balance, estimated profit, orders, customers, custom requests, low stock and inventory cost. It includes monthly sales, order-status and best-seller charts, and refreshes after website/admin writes or manual edits to data tabs. The original data remains in its individual tabs (Orders, Order_Items, Payments, Customers, Custom_Orders, Expenses, inventory and product tabs).
- Dashboard numbers are based on recorded store data, not website visits or conversion rates. Those require a separate web-analytics integration and visitor consent setup.

## Known limits (be honest with the owner)
- Admin login is a salted hash + 6h token with 5-attempt throttling, served by Apps Script. This is reasonable for a small shop, not bank-grade. Next step: put a Cloudflare Worker in front of Apps Script and keep the Apps Script URL private.
- Sheets slows past a few thousand orders. All data access is in `Code.gs`; migrate to Supabase/Postgres later by replacing those functions.
- Back up: File > Make a copy of the Sheet weekly, or add a time-driven trigger that copies it.

## Not built yet (next phases)
Product/variant editor, stock adjustments and returns screens, customer pages, delivery module, expense UI (backend `adminAddExpense` exists), discount UI, date-range filters in the admin UI, image upload, FAQ/policy pages, SEO files and product URLs. The Google Sheet Dashboard provides current all-time KPIs and charts; it is not a website traffic or conversion analytics tracker.
