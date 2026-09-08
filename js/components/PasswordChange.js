import { db } from "../supabaseClient.js";

export async function renderPasswordChange(container, onComplete, options = {}) {
  const { userId, tenantId } = options;
  container.innerHTML = `<div class="modal">
      <div>
        <h2>Set your password</h2>
        <p class="muted">This is your first login. Please set a password to access your account.</p>
        <form id="password-form" class="grid">
          <label>Password<input type="password" name="password" required></label>
          <label>Confirm password<input type="password" name="password_confirm" required></label>
          <div><button type="submit" class="primary">Set password</button> <button type="button" class="link" id="cancel">Cancel</button></div>
        </form>
        <p id="password-msg" role="status"></p>
      </div>
    </div>`;

  const form = container.querySelector("#password-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const pwd = form.querySelector('input[name="password"]').value;
    const pwdConfirm = form.querySelector('input[name="password_confirm"]').value;
    const msg = container.querySelector("#password-msg");

    if (pwd !== pwdConfirm) {
      msg.textContent = "Passwords do not match.";
      return;
    }
    if (pwd.length < 8) {
      msg.textContent = "Password must be at least 8 characters.";
      return;
    }

    msg.textContent = "Setting password…";
    
    // Get the current session's access token
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) {
      msg.textContent = "Session expired. Please sign in again.";
      return;
    }

    // Call the change-password Edge Function
    const response = await fetch(
      `${window.EDUSTACK_CONFIG.SUPABASE_URL}/functions/v1/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ new_password: pwd }),
      }
    );
    const result = await response.json();

    if (result?.error || !result?.success) {
      msg.textContent = `Error: ${result?.error || result?.message || "Failed to change password"}`;
      return;
    }

    msg.textContent = "Password set successfully. Loading your workspace…";
    setTimeout(() => {
      onComplete && onComplete();
    }, 1000);
  };
  
  const cancelBtn = container.querySelector("#cancel");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      // Allow cancel - but user can't proceed without changing password
      container.innerHTML = "";
    };
  }
}