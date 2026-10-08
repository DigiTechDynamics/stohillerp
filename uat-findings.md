# UAT findings

| # | Area | Finding | Expected |
|---|---|---|---|
| 1 | Notifications | The notification icon is shown, but notifications are not wired up: none are received, and none can be read. | Notifications are delivered to the icon and can be opened and marked as read. |
| 2 | Sidebar | The sidebar shows the wrong logo. | The sidebar shows the correct logo. |
| 3 | CRM | In light mode, the text on the create, edit and delete buttons is only visible on hover. | Button text is always visible. |
| 4 | Right side panel | The panel's elements sit outside its margins, and the grey-on-white colour scheme has too little contrast. | Elements sit inside the panel's margins, and the colours contrast clearly. |
| 5 | Properties map | Property locations can't be shown on the map because the maps API key (a Vite environment variable) isn't set. | The key is configured and property locations appear on the map. |
| 6 | Properties list | All properties load on one page. | The list is paginated. |
| 7 | Rental management | Rental invoices can't be viewed. | An invoice can be opened, exported and printed. |
| 8 | Documents | Uploading a document fails with the error "Failed to upload document". | Documents upload successfully. |
