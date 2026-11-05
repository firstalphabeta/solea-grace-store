# Jewellery store + lightweight business system

Static storefront (`web/`) + Google Apps Script backend (`apps-script/Code.gs`) on a Google Sheet. No payment gateway; payments are recorded manually by an admin.

## Setup
1. Create a Google Sheet. Extensions > Apps Script. Paste `apps-script/Code.gs`.
2. Run `setup()` once (creates all data sheets and a Dashboard with KPI cards and charts). Authorise when asked.
3. Edit the email/password inside `createAdmin()`, run it once, then change those two lines back. Use a long unique password.
4. Fill the **Settings** sheet: `business_name`, `whatsapp_number` (digits with country code, e.g. 233XXXXXXXXX), `delivery_fee_accra`, `delivery_fee_other`.
5. Add products, prices, and stock from **Admin > Manage products > Add a product**. The admin screen creates product and variant rows in the Google Sheet. You can still add them directly to **Products** and **Product_Variants** if you prefer. Run `setup()` again after updating the script; it safely adds the new `badge` column to an existing Products sheet. Run `authorizeImageUploads()` once from the Apps Script editor and approve Drive access.
6. Deploy > New deployment > Web app. Execute as: Me. Access: Anyone. Copy the URL into `web/config.js` (`API_URL`).
7. Run locally with `npx serve web` in VS Code, or deploy `web/` to Cloudflare Pages/Netlify. Admin is at `/admin.html`.

When updating an existing deployment, use **Deploy > Manage deployments > Edit > New version > Deploy** so the website can use the updated Apps Script.

### Adding product photos and collections
1. Sign in at `/admin.html`, choose **Manage products**, then **Add a product**.
2. Enter the product name, category, description, price-option name (such as One size or Gold), price, your cost, stock quantity, and low-stock threshold. Add more options for different sizes or colours, then choose **Create product**.
3. Use a portrait photo around **1200 × 1500 pixels (4:5 ratio)** so product cards line up neatly. Keep the product centered because the storefront crops images to fill the card. JPG or WebP is recommended; the uploader accepts JPG, PNG, WebP, or GIF up to 5 MB.
4. Uploaded images are saved in the script owner's Drive, shared with anyone who has the link so they can appear on the public storefront, and attached to the product automatically. You can also paste an existing public image URL.
5. Choose **New** or **Limited Edition** under **Badge / collection** to place the product in those storefront category filters. Edit product details, prices, options, or stock from the same screen.

### Recording orders from WhatsApp
1. In `/admin.html`, choose **Add WhatsApp order**.
2. Enter the customer's name and phone number, choose delivery or pickup, and add each item and quantity. Delivery orders need an address and region.
3. Choose **Save WhatsApp order**. The order is added as **Unpaid**, stock is reserved, and it appears in the order list. When the customer pays, choose **Record payment** on that order. Cancelling an order returns its stock.

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
Stock adjustment history and returns screens, customer pages, delivery module, expense UI (backend `adminAddExpense` exists), discount UI, date-range filters in the admin UI, FAQ/policy pages, SEO files and product URLs. The Google Sheet Dashboard provides current all-time KPIs and charts; it is not a website traffic or conversion analytics tracker.
