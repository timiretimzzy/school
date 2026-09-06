import { db } from "../supabaseClient.js";
import { esc, safeError } from "../util.js";
import { renderPasswordChange } from "../components/PasswordChange.js";

export function renderAcceptInvite(container, onAccepted) {
  // Check for token in URL query parameter (development/testing delivery)
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");

  container.innerHTML = `<div class="panel">
      <h2>Accept your invitation</h2>
      <p class="muted">Paste the invitation token your school administrator shared with you.</p>
      <form id="accept-form" class="grid">
        <label class="span-2">Invitation token<input name="token" required placeholder="paste token here"></label>
        <label>First name (parents only)<input name="first_name"></label>
        <label>Last name (parents only)<input name="last_name"></label>
        <div><button type="submit" class="primary">Accept invitation</button></div>
      </form>
      <p id="accept-msg" role="status"></p>
    </div>`;

  // If a token was passed via query parameter, auto-fill the form
  if (urlToken) {
    const tokenInput = container.querySelector('input[name="token"]');
    if (tokenInput) {
      tokenInput.value = urlToken;
      tokenInput.disabled = true;
      // Optionally auto-submit or show message
      const msg = container.querySelector("#accept-msg");
      msg.textContent = "Token loaded from invitation link. Ready to accept.";
    }
  }

  container.querySelector("#accept-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = container.querySelector("#accept-msg");
    msg.textContent = "Accepting invitation…";
    const { data, error } = await db.functions.invoke("accept-invitation", {
      body: { token: fd.get("token").trim(), first_name: fd.get("first_name") || undefined, last_name: fd.get("last_name") || undefined },
    });
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    // New accounts created via create-account must change password on first login.
    // Show the password change component using the Edge Function.
    const overlay = document.createElement("div");
    overlay.className = "modal";
    document.body.appendChild(overlay);
    
    // Get user ID from the acceptance response
    const userId = data?.user_id;
    const userEmail = data?.email;
    const tenantId = data?.tenant_id;
    
    renderPasswordChange(overlay, async () => {
      document.body.removeChild(overlay);
      onAccepted && onAccepted();
    }, { userId, tenantId });
  };
}