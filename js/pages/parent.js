import { db } from "../supabaseClient.js";
import { esc } from "../util.js";
import { renderStudentSummary } from "./student.js";

export async function renderParent(container, tenantId, parentId) {
  container.innerHTML = `<p class="muted">Loading your children…</p>`;
  const { data: links } = await db
    .from("parent_student_relationships")
    .select("student_id, relationship, students(first_name, last_name, admission_number)")
    .eq("parent_id", parentId);
  if (!links || !links.length) {
    container.innerHTML = `<div class="panel"><p class="muted">No children are linked to your account yet. Ask the school administrator to link your invitation to your child's record.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="panel">
      <h2>Your children</h2>
      <div class="tabs">${links
        .map(
          (l, i) =>
            `<a href="#" data-id="${l.student_id}" class="tab ${i === 0 ? "active" : ""}">${esc(l.students?.first_name)} ${esc(l.students?.last_name)}</a>`,
        )
        .join("")}</div>
    </div>
    <div id="parent-child"></div>`;
  const tabs = container.querySelectorAll("[data-id]");
  tabs.forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderStudentSummary(container.querySelector("#parent-child"), tenantId, tab.dataset.id);
    };
  });
  renderStudentSummary(container.querySelector("#parent-child"), tenantId, links[0].student_id);
}
