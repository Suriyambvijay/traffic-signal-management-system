// Builds the shared top navigation on every protected page.
// Call renderNavbar('dashboard') passing the current page's key.
function renderNavbar(activeKey, user) {
  const initials = (user.displayName || user.email || "U")
    .split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();

  const links = [
    { key: "dashboard", href: "dashboard.html", label: "Dashboard" },
    { key: "input", href: "input.html", label: "Video / Image Input" },
    { key: "signals", href: "signals.html", label: "Signal Control" },
    { key: "analytics", href: "analytics.html", label: "Analytics" },
    { key: "settings", href: "settings.html", label: "Settings" },
  ];

  const linksHtml = links.map(l =>
    `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}">${l.label}</a>`
  ).join("");

  document.getElementById("topbar").innerHTML = `
    <div class="brand">
      <div class="mark">ST</div>
      <div>
        <h1>Smart Traffic Signal Management</h1>
        <span>AI &middot; ML &middot; Computer Vision &middot; Adaptive Control</span>
      </div>
    </div>
    <div class="navlinks">${linksHtml}</div>
    <div class="userbox">
      <a href="profile.html" class="userlink" title="View profile">
        <div class="avatar">${initials}</div>
        <span class="uname">${user.displayName || user.email}</span>
      </a>
      <button class="btn-logout" id="btnLogout">Log out</button>
    </div>
  `;
  document.getElementById("btnLogout").addEventListener("click", logOutUser);
}
