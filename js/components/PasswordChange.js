import { db } from "../supabaseClient.js";

export async function renderPasswordChange(container, onComplete, options = {}) {
  const { userId, tenantId } = options;
  container.innerHTML = `
      <div style="max-width:400px;width:100%">
        <h2>Set your password</h2>
        <p class="muted">This is your first login. Please set a password to access your account.</p>
        <form id="password-form" class="grid">
          <label>Password<input type="password" name="password" required></label>
          <label>Confirm password<input type="password" name="password_confirm" required></label>
          <div><button type="submit" class="primary">Set password</button></div>
        </form>
        <p id="password-msg" role="status"></p>
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

    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) {
      msg.textContent = "Session expired. Please sign in again.";
      return;
    }

    try {
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
        msg.textContent = result?.error || "Failed to change password";
        return;
      }
    } catch (err) {
      msg.textContent = "Network error. Please try again.";
      return;
    }

    msg.textContent = "Password set. Signing in with new password…";

    try {
      const { data: userData } = await db.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        msg.textContent = "Could not determine account email. Please sign in manually.";
        return;
      }
      await db.auth.signOut();
      const { error: reSignInError } = await db.auth.signInWithPassword({ email, password: pwd });
      if (reSignInError) {
        msg.textContent = "Password was set but automatic sign-in failed. Please sign in manually.";
        return;
      }
    } catch (err) {
      msg.textContent = "Password set. Please sign in manually with your new password.";
      return;
    }

    setTimeout(() => {
      onComplete && onComplete();
    }, 500);
  };
}
