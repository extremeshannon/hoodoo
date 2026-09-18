(function () {
  function markStaff(on) {
    document.body.classList.toggle("is-hoodoo-staff", !!on);
  }

  function clearAuth(ul) {
    ul.querySelectorAll(".nav-auth-item").forEach(function (el) {
      el.remove();
    });
  }

  function addItem(ul, html) {
    var li = document.createElement("li");
    li.className = "nav-auth-item";
    li.innerHTML = html;
    ul.appendChild(li);
    return li;
  }

  function logout() {
    var base = (window.HoodooApi && window.HoodooApi.apiUrl) ? window.HoodooApi.apiUrl("/auth/logout") : "/api/auth/logout";
    fetch(base, { method: "POST", credentials: "same-origin" }).finally(function () {
      if (window.HoodooApi) window.HoodooApi.clearToken();
      window.location.href = "/";
    });
  }

  function renderLoggedOut(ul) {
    markStaff(false);
    addItem(ul, '<a href="/login">Sign in</a>');
  }

  function run() {
    var ul = document.querySelector(".nav-list");
    if (!ul || !window.HoodooApi) return;
    clearAuth(ul);
    var tok = window.HoodooApi.getToken();
    if (!tok) {
      renderLoggedOut(ul);
      return;
    }
    window.HoodooApi.fetchJson("/auth/me")
      .then(function (u) {
        var isStaff = u && (u.role === "staff" || u.role === "admin");
        markStaff(isStaff);
        if (isStaff) {
          addItem(ul, u.role === "admin" ? '<a href="/admin.html">Admin</a>' : '<a href="/admin.html">Staff</a>');
        }
        addItem(ul, '<a href="/account.html">Account</a>');
        addItem(ul, '<button type="button" class="nav-logout" id="nav-logout-btn">Log out</button>');
        var btn = document.getElementById("nav-logout-btn");
        if (btn) btn.addEventListener("click", logout);
      })
      .catch(function () {
        window.HoodooApi.clearToken();
        renderLoggedOut(ul);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
