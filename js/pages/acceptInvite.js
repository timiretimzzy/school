import { db } from "../supabaseClient.js";
import { esc, safeError } from "../util.js";

export function renderAcceptInvite(container, onAccepted) {
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
    msg.textContent = `Invitation accepted as ${esc(data.role)}. Loading your workspace…`;
    setTimeout(() => onAccepted && onAccepted(), 800);
  };
}
