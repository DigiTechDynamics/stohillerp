# UAT Findings

## User-Reported Findings

| # | Area | Finding | Expected |
|---|---|---|---|
| 1 | General – Notifications | The notification icon is shown, but no notifications are received or can be read (see also HC-3). | Notifications are delivered to the icon and can be opened and marked as read. |
| 2 | General – Sidebar | The sidebar shows the wrong logo. | The sidebar shows the correct logo. |
| 3 | General – Right side panel | The panel's elements sit outside its margins, and its grey and white colours have too little contrast. | Elements sit inside the panel's margins, and the colours contrast clearly. |
| 4 | General – Dialogs (system-wide) | Messages and confirmations use the browser's built-in pop-ups (generic JavaScript alert and confirm boxes). | Messages and confirmations use a properly designed modal dialog, centred on screen and matching the system's styling. |
| 5 | CRM – Action buttons | In light mode, the text on the create, edit and delete buttons is only visible on hover. | Button text is always visible. |
| 6 | Properties – Map | Property locations don't appear on the map, because the maps API key (a Vite environment variable) isn't set. | The API key is configured and property locations appear on the map. |
| 7 | Properties – List | All properties load on one page. | The list is paginated. |
| 8 | Rental Management – Invoices | Rental invoices can't be viewed. | Invoices can be viewed, exported and printed. |
| 9 | Documents – Upload | Uploading a document fails with the error "Failed to upload document". | Documents upload successfully. |
| 10 | Documents – All screens | The module shows hardcoded data (details in HC-1 and HC-2). | Hardcoded data is removed and only real data is shown. |
| 11 | Documents – Document types | Document type tiles (e.g. Property Title Deeds, with its file count) can't be clicked. | Clicking a document type lists its documents (e.g. all the title deeds), and clicking a document opens it with an option to download it. |
| 12 | Finance – Exports (all screens) | The Excel and PDF export options both produce a CSV file. | Excel export produces an Excel file and PDF export produces a PDF. |
| 13 | Finance – Accounts Receivable invoices | Generated invoices show as empty, and opening one shows an error. | Invoices show their details and open without errors. |
| 14 | Finance – Accounts Receivable receipts | Receipts download, but the downloaded file can't be opened. | Downloaded receipts open correctly. |
| 15 | Fixed Assets – Add asset | Adding a fixed asset fails silently: the asset isn't saved and no error message is shown. No asset categories are available to choose from. | Asset categories are available, and the asset saves successfully, or a clear error explains why it couldn't be saved. |

## Hardcoded Data

Found in a code audit. HC-1 to HC-7 are visible on screen; HC-8 to HC-14 are values fixed in the backend that should come from settings or the posting profile.

| # | Area | Finding | Expected |
|---|---|---|---|
| HC-1 | Documents – Category tiles | The file counts on the five category tiles are fixed numbers (Property Title Deeds 42, Lease Agreements 124, KYC Documents 85, Sales Contracts 32, Invoices & Receipts 412), not counts of real documents. | Each tile shows the actual number of documents in that category. |
| HC-2 | Documents – Category tiles | The five category names are fixed in the page. | Categories come from the document types set up in the system. |
| HC-3 | General – Notifications | The notification bell always shows an "unread" dot. | The dot only shows when there are unread notifications. |
| HC-4 | General – Top bar | When a user's name is missing, "Admin User" is shown. | The user's real name is shown, or a neutral placeholder. |
| HC-5 | General – Top bar | When a user has no role, "Super Admin" is shown, which can display a false role. | The user's real role is shown, or none. |
| HC-6 | General – Login page | The footer year is fixed ("© 2026 Stohill Properties"). | The year updates automatically. |
| HC-7 | Finance – Customer and supplier forms | Phone fields suggest a South African number ("+27..."), but the company is set up for Zimbabwe. | Phone placeholders match the company's country. |
| HC-8 | Rental Management – Invoice posting | An older rental-invoice posting function charges VAT at 15%, while the company VAT rate is 15.5%. | VAT always uses the company's configured rate. |
| HC-9 | Finance – Ledger accounts | About 15 places in rentals, property management, owner accounting and deposit refunds use fixed account codes (2210 Owner Funds, 4920 Recoveries, 4100 Rental Income, 1120/2110 Withholding Tax). | Account codes come from the posting profile, so changing the chart of accounts doesn't break postings. |
| HC-10 | Rental Management – Payments | Every rental payment is banked to whichever bank account is listed first. | Payments go to a chosen or configured bank account. |
| HC-11 | Finance and Payroll – Currency | Journal postings and payroll tax calculations assume USD. | They use the company's base currency or the document's currency. |
| HC-12 | Payroll – Statutory rates | If a setting is missing, payroll silently falls back to an AIDS levy of 3%, NSSA of 4.5% and an NSSA ceiling of $700. | Missing settings are reported instead of fixed rates being used. |
| HC-13 | Properties – New property | The country defaults to "South Africa", although the company is in Zimbabwe. | The country defaults to the company's country. |
| HC-14 | Rental Management and Properties – Defaults | Rent escalation defaults to 8% a year and the management fee to 10%. | Defaults come from configurable settings. |

## Gaps

Found in a code audit of features that are missing, unfinished or not connected. Every API path the frontend calls exists on the backend, and every sidebar link leads to a real page.

| # | Area | Finding | Expected |
|---|---|---|---|
| GAP-1 | General – Notifications | In-app notifications don't exist in the backend: the notifications app only logs emails and SMS sent to contacts, with no notifications for users and no read/unread tracking (root cause of #1). | Users receive in-app notifications that can be opened and marked as read. |
| GAP-2 | Rental Management – Invoices | The backend can already produce a rental invoice PDF, but no screen uses it (relates to #8). | Rental invoices can be viewed, downloaded and printed from the screen. |
| GAP-3 | Documents – Document detail | Clicking a document opens a detail panel that was never built, so it shows blank (relates to #11). | Clicking a document shows its details, with an option to download it. |
| GAP-4 | General – Audit log | The backend records an audit log, but there is no screen for it. | Authorised users can view the audit log. |
| GAP-5 | CRM – Contact documents | Uploading, verifying and downloading contact documents is supported in the backend, but there is no screen for it. | Contact documents can be managed from the contact's record. |
| GAP-6 | CRM – Sales teams | Sales teams exist in the backend, but there is no screen for them. | Sales teams can be set up and managed. |
| GAP-7 | CRM – Notes | Note attachments can't be downloaded from any screen. | Note attachments can be downloaded. |
| GAP-8 | Fixed Assets – Books and locations | Asset books and asset locations exist in the backend, but there is no screen for them. | Asset books and locations can be set up and managed. |
| GAP-9 | HR – Attendance | Attendance exists in the backend, but there is no screen for it. | Attendance can be recorded and viewed. |
| GAP-10 | HR – Leave allocations | Leave allocations exist in the backend, but there is no screen for them. | Leave allocations can be set up and managed. |
| GAP-11 | General – User settings | The user "executive mode" switch exists in the backend, but there is no screen for it. | Executive mode can be switched on and off. |
| GAP-12 | Finance – Journal entries | The "Reverse Entry" button does nothing, although the backend supports reversals. | Reverse Entry reverses the journal entry. |
| GAP-13 | Payroll – Deduction settings | The "Add New Bracket" and Save buttons do nothing. | Tax brackets can be added and saved. |
| GAP-14 | CRM – Opportunities | The Delete button does nothing. | Opportunities can be deleted. |
| GAP-15 | General – User Access | The "Auto-Suggest Rules" button does nothing. | The button suggests rules, or is removed. |
| GAP-16 | Banking, Finance and CRM – Filters | The filter and date buttons in Banking, Bank Transactions and the CRM Calendar do nothing. | The buttons filter the data shown. |
| GAP-17 | Fixed Assets – History | The History button does nothing. | The button shows the asset's history. |
| GAP-18 | General – Email | Email is only printed to the server console, so no emails reach anyone (invoices, statements, arrears letters). | Emails are delivered through a configured mail server. |
| GAP-19 | General – SMS | SMS messages are logged but never sent. | SMS messages are delivered through a configured SMS provider. |
| GAP-20 | Payments – Paynow | Paynow online payments have no keys configured. | Paynow is configured and online payments work. |
| GAP-21 | Rental Management – Integrations | Credit checks, e-signatures and CPI figures are manual only; no provider is connected. | Providers are connected, or the manual process is confirmed as the intended approach. |
| GAP-22 | General – Dialogs | 38 places use the browser's built-in alert or confirm boxes (relates to #4). | All of them use the system's own modal dialog. |
| GAP-23 | Rental Management – Compared with MRI MDA | Seven property-management features are missing compared with MRI MDA, such as per-property ledgers and interest on arrears; details are in `gaps.md`. | The gaps are reviewed and the needed features planned. |
