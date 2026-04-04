# Stohill ERP: External Website Maintenance Integration Guide

This guide provides the technical information required to link your company's official website (e.g., https://stphillproperties.co.zw/) to the Stohill ERP. This allows tenants to log maintenance requests directly from your site without needing a login to the ERP.

## 🔗 Endpoint Details

- **URL**: `https://erp.stphillproperties.co.zw/api/rentals/public-maintenance/` (Update with your actual ERP domain)
- **Method**: `POST`
- **Authentication**: None (Public Endpoint)

## 📋 Required Payload (JSON)

The following fields must be sent in the request body:

| Field | Type | Description |
| :--- | :--- | :--- |
| `lease_number` | String | Exactly as it appears on the lease (e.g., `LSE-00015`) |
| `email` | String | The tenant's primary email address registered in the ERP |
| `category` | String | Type of issue (Plumbing, Electrical, General, etc.) |
| `priority` | String | Options: `low`, `medium`, `high`, `emergency` |
| `description` | String | Detailed description of the problem |

---

## 🛠️ Implementation Example (JavaScript/Fetch)

Your web developer can use the following code snippet to submit the form to the ERP:

```javascript
async function submitMaintenanceTicket() {
  const payload = {
    lease_number: document.getElementById('lease_no').value,
    email: document.getElementById('tenant_email').value,
    category: document.getElementById('issue_category').value,
    priority: document.getElementById('issue_priority').value,
    description: document.getElementById('issue_description').value,
  };

  try {
    const response = await fetch('https://erp.stphillproperties.co.zw/api/rentals/public-maintenance/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok) {
      alert(`Success! Ticket Logged. Reference: ${result.reference}`);
      // Redirect or show success message on your site
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Integration Error:', error);
    alert('Failed to connect to the Maintenance Server.');
  }
}
```

## 🔒 Security Notes
1. **Validation**: The ERP only accepts requests where both the `lease_number` and `email` match an **active** lease record.
2. **CORS**: Ensure that your ERP configuration allows requests from your website domain (`https://stphillproperties.co.zw`).
3. **Spam Prevention**: It is recommended to add a CAPTCHA to your website form to prevent automated spam tickets.
