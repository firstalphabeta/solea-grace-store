# Jewellery store + lightweight business system

Static storefront (`web/`) + Google Apps Script backend (`apps-script/Code.gs`) on a Google Sheet. No payment gateway; payments are recorded manually by an admin.

## Setup
1. Create a Google Sheet. Extensions > Apps Script. Paste `apps-script/Code.gs`.
2. Run `setup()` once (creates all data sheets and a Dashboard with KPI cards and charts). Authorise when asked.
3. Edit the email/password inside `createAdmin()`, run it once, then change those two lines back. Use a long unique password. If you have lost the login details, enter new ones in `resetAdminCredentials()` and run that function; it replaces the existing admin account. Remove your password from the code after running it.
4. Fill the **Settings** sheet: `business_name`, `whatsapp_number` (`233596117844`), `delivery_fee_accra`, `delivery_fee_other`. The public contact links also use `WHATSAPP_NUMBER` in `web/config.js`; keep it in sync when the number changes.
5. Add products, prices, stock, and photos together from **Admin > Products > Add product**. Choose up to 8 photos from your device; uploaded product photos are saved to the script owner's Drive. The Products page shows a searchable storefront-style catalog where products can be edited or hidden and shown again. Hiding keeps the product and sales history in the sheet. Run `setup()` again after updating the script; it safely adds new columns and the `Product_Images` sheet to an existing store. Run `authorizeImageUploads()` once from the Apps Script editor and approve Drive access.
6. Deploy > New deployment > Web app. Execute as: Me. Access: Anyone. Copy the URL into `web/config.js` (`API_URL`).
7. Run locally with `npx serve web` in VS Code, or deploy `web/` to Cloudflare Pages/Netlify. Admin is at `/admin.html`.

When updating an existing deployment, use **Deploy > Manage deployments > Edit > New version > Deploy** so the website can use the updated Apps Script.

### Adding product photos and collections
1. Sign in at `/admin.html` and open **Products**, then choose **Add product**.
2. Enter the product name, category, description, price-option name (such as One size or Gold), price, your cost, stock quantity, and low-stock threshold. Add more options for different sizes or colours.
3. Choose up to 8 product photos in the same form. Use portrait photos around **1200 × 1500 pixels (4:5 ratio)** so product cards line up neatly. Keep the product centered because the storefront crops images to fill the card. JPG or WebP is recommended; the uploader accepts JPG, PNG, WebP, or GIF up to 5 MB per photo and 6 MB combined. Reorder photos with the move buttons; the first photo is the storefront cover.
4. Choose **Create product** to save the details and photos together. Images are stored in the script owner's Drive and shared with anyone who has the link so they can appear on the public storefront.
5. Use the searchable catalog to preview, edit, or hide/show products. Hidden products do not appear in the storefront, but their order history stays intact. Choose **New** or **Limited Edition** under **Badge / collection** for storefront badges. To create two test items, use **Add product** for each item; each can be edited or hidden later.

### Promotions and discount codes
1. In the admin workspace, open **Promotions** and choose **Create promotion**.
2. Set a unique code, percentage or fixed-amount discount, minimum order, optional maximum uses, optional start/end dates, and whether it is active. A maximum of `0` means unlimited uses; leaving dates blank means no date restriction.
3. Customers enter the code in the checkout discount-code field. The server validates the code, dates, minimum spend and use limit and calculates the discount; creating a promotion does not automatically discount every order.
4. Use **Pause** to stop a code without deleting its record or usage history. Existing rows in the **Discounts** sheet are managed in this same Promotions page.

The storefront product detail panel displays the product gallery with selectable thumbnails. When updating an existing deployment, update the Apps Script and publish the latest `web/` files; run `setup()` once so the `Product_Images` sheet exists.

The storefront checkout uses a contact-and-delivery form with an itemized order summary, responsive for phones and desktop. Shipping fees are estimated from the configured Settings values and the server confirms the final order total. Payments are arranged after confirmation; the site does not collect card details or process payments.

### Recording orders from WhatsApp
1. In `/admin.html`, choose **Add WhatsApp order**.
2. Enter the customer's name and phone number, choose delivery or pickup, and add each item and quantity. Delivery orders need an address and region.
3. Choose **Save WhatsApp order**. The order is added as **Unpaid**, stock is reserved, and it appears in the order list. When the customer pays, choose **Record payment** on that order. Cancelling an order returns its stock.

### Changing admin sign-in details
1. Sign in to `/admin.html` and choose **Account settings**.
2. Enter the current password and the new email. To change the password too, enter and confirm a new password of at least 12 characters. Leave both new-password fields blank to keep the current password.
3. Save the settings. The current session remains signed in; other sessions must sign in again. The **Sign out** control is also in **Account settings**.

### Resetting a lost admin login
1. Open the bound Apps Script project from the Google Sheet (**Extensions > Apps Script**).
2. In `Code.gs`, find `resetAdminCredentials()` and replace its example email and password with the new login details you want. Use a unique password of at least 12 characters.
3. Select `resetAdminCredentials` in the function list and click **Run**. Approve access if Google asks.
4. Change the example values back in the code and save. Then sign in at `/admin.html` with the new email and password.

This reset replaces the existing admin account in the `Admin_Users` sheet. The password is stored as a salted hash, not as readable text. Do not share or commit your password.

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
- The web admin workspace includes an overview with date filters (up to 31 days for the daily chart), recent orders, top sellers and low-stock alerts; searchable/order-management tools; product and customer lists; promotion management; custom request status tracking; and expense entry/history. Deploy the latest `apps-script/Code.gs` to Apps Script before these features can load their data.
- Dashboard numbers are based on recorded store data, not website visits or conversion rates. Those require a separate web-analytics integration and visitor consent setup.

## Known limits (be honest with the owner)
- Admin login is a salted hash + 6h token with 5-attempt throttling, served by Apps Script. This is reasonable for a small shop, not bank-grade. Next step: put a Cloudflare Worker in front of Apps Script and keep the Apps Script URL private.
- Sheets slows past a few thousand orders. All data access is in `Code.gs`; migrate to Supabase/Postgres later by replacing those functions.
- Back up: File > Make a copy of the Sheet weekly, or add a time-driven trigger that copies it.

## Still not built
Stock adjustment history and returns screens, a delivery module, FAQ/policy pages, SEO files and product URLs. The Google Sheet Dashboard provides sales and operations metrics; it is not a website traffic or conversion analytics tracker.
