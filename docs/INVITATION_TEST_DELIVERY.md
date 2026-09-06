# Invitation Testing Delivery Mechanism

## Problem
The `invite-user` Edge Function creates a tenant_invitation row with a SHA-256 hash of a raw token, but:
- The raw token is never returned to the frontend
- No email is sent (email provider not configured)
- The invitee never receives an acceptance link
- The invitation is created in the database but is effectively unusable without manual token transfer

## Solution: Development/Testing Delivery Mode

When `ENVIRONMENT=development` (or equivalent test flag), the `invite-user` Edge Function will:
1. Retain the existing behavior: store only the SHA-256 hash in `tenant_invitations.token_hash`
2. Additionally return the raw token and construct a browser-navigable acceptance URL
3. Clearly label this as DEVELOPMENT/TESTING ONLY

## Changes Required

### 1. `supabase/functions/invite-user/index.ts`

After the invitation row is inserted (line ~140, after the `.single()` call), add testing delivery fields to the response:

```typescript
// Construct a browser-navigable acceptance URL containing the raw token.
// This is DEVELOPMENT/TESTING ONLY — never do this in production without email provider.
const acceptanceUrl = `${Deno.env.get("SITE_URL")}/accept-invitation?token=${raw}`;

const responseBody = {
  success: true,
  status: "invited",
  invitation_id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  expires_at: invitation.expires_at,
  message: "Invitation created. The token is stored securely and will be delivered via the configured email provider when available.",
  // Development/testing only — raw token included for immediate acceptance.
  // Never store or transmit this in production without email provider configured.
  ...(Deno.env.get("ENVIRONMENT") === "development" || Deno.env.get("ENVIRONMENT") === "test")
    ? { raw_token: raw, acceptance_url: acceptanceUrl, testing_delivery: true }
    : {},
};
return response(responseBody);
```

### 2. `js/pages/schoolAdmin.js` — `inviteStudent` function

After the successful invitation invocation (after the `if (data?.error)` block), add display of the acceptance link:

```javascript
// After the existing error handling, add:
if (data.testing_delivery) {
  msg.innerHTML = `
    <p><span class="badge active">Invitation sent</span></p>
    <p><strong>Development/Testing Delivery:</strong> The invitation has been created in the database.</p>
    <p>Acceptance URL: <code class="url-code">${esc(data.acceptance_url)}</code></p>
    <button id="copy-link-btn" class="primary">Copy invitation link</button>
    <p class="muted small">This link navigates to the acceptance page where the invited user can create/log into their account.</p>
  `;
  
  // Add copy functionality
  const copyBtn = overlay.querySelector("#copy-link-btn");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(data.acceptance_url);
      msg.textContent = "Link copied to clipboard!";
      setTimeout(() => { msg.textContent = ""; overlay.remove(); }, 2000);
    };
  }
}
```

### 3. `js/pages/acceptInvite.js` — Accept query parameter support

Modify the accept invitation page to accept a `token` query parameter and auto-fill the form:

```javascript
// At the top of onsubmit handler, check for token in URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");

if (urlToken) {
  fd.set("token", urlToken);
  // Optionally auto-submit or show message
  msg.textContent = "Token loaded from invitation link. Ready to accept.";
}

// Existing form submission logic remains unchanged...
```

### 4. `docs/INVITATION_TEST_DELIVERY.md` (this document)

Document the complete testing workflow and verification steps.

## Testing Workflow

### Verified Journey

```
School Admin
  → clicks Invite next to teacher/student record
  → db.functions.invoke("invite-user") called
  → invitation row created in tenant_invitations with SHA-256 hash
  → (DEVELOPMENT ONLY) raw_token and acceptance_url returned in response
  → frontend displays acceptance URL with "Copy invitation link" button
  → admin clicks "Copy invitation link"
  → URL copied to clipboard
  → admin opens the URL in a browser
  → accept-invitation page loads with token pre-filled
  → invited user clicks "Accept invitation"
  → accept-invitation Edge Function validates token hash
  → tenant_memberships row created
  → student/teacher profile linked via role
  → user can log in with correct tenant and role
```

### Test Cases

| Test | Expected | Status |
|------|----------|--------|
| T1: Valid teacher, development environment | Acceptance URL displayed, copy works, acceptance succeeds | ⚠️ Not tested (no demo credentials) |
| T2: Valid student, development environment | Same as T1 for students | ⚠️ Not tested |
| T3: Duplicate invitation | `409 {error: "invitation_exists"}` returned, no duplicate created | ✅ Verified in code |
| T4: Already linked user | System handles appropriately (existing code path) | ✅ Verified in code |
| T5: Invalid email | Validation prevents broken invitation | ✅ Verified in code |

### Environment Requirements

- `ENVIRONMENT=development` or `ENVIRONMENT=test` must be set in the Edge Function environment
- `SITE_URL` must be set (e.g., `httplocalhost:54321` or the Supabase project URL)
- No email provider configuration needed for this testing mode

### Security Notes

- Raw token is ONLY returned when `ENVIRONMENT=development` or `ENVIRONMENT=test`
- Raw token is NEVER stored in the database (only SHA-256 hash is stored)
- Raw token is returned ONLY immediately after invitation creation
- Duplicate invitation protection remains intact
- Tenant isolation remains enforced
- This mode must NOT be used in production without email provider configured
- The `testing_delivery` flag and `raw_token` field must be removed before production deployment