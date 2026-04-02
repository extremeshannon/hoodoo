(function () {
  function placeAuthLi(ul) {
    var cta = ul.querySelector("a.nav-cta");
    return cta ? cta.closest("li") : null;
  }

  function renderLoggedOut(ul, insertBefore) {
    var li = document.createElement("li");
    li.id = "nav-auth-slot";
    li.innerHTML =
      '<a href="/register">Sign up</a> <span class="nav-auth-sep" aria-hidden="true">·</span> <a href="/login">Sign in</a>';
    if (insertBefore) ul.insertBefore(li, insertBefore);
    else ul.appendChild(li);
  }

  function run() {
    var ul = document.querySelector(".nav-list");
    if (!ul || !window.HoodooApi) return;
    var old = document.getElementById("nav-auth-slot");
    if (old) old.remove();
    var insertBefore = placeAuthLi(ul);
    var tok = window.HoodooApi.getToken();
    if (!tok) {
      renderLoggedOut(ul, insertBefore);
      return;
    }
    window.HoodooApi.fetchJson("/auth/me")
      .then(function (u) {
        var li = document.createElement("li");
        li.id = "nav-auth-slot";
        var bits = [
          '<a href="/account.html">Account</a>',
        ];
        if (u.role === "staff" || u.role === "admin") {
          bits.push('<a href="/admin.html">Staff</a>');
        }
        bits.push(
          '<button type="button" class="nav-logout" id="nav-logout-btn" aria-label="Log out">Log out</button>'
        );
        li.innerHTML = bits.join(' <span class="nav-auth-sep" aria-hidden="true">·</span> ');
        if (insertBefore) ul.insertBefore(li, insertBefore);
        else ul.appendChild(li);
        var btn = document.getElementById("nav-logout-btn");
        if (btn) {
          btn.addEventListener("click", function () {
            window.HoodooApi.clearToken();
            window.location.href = "/index.html";
          });
        }
      })
      .catch(function () {
        window.HoodooApi.clearToken();
        renderLoggedOut(ul, insertBefore);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
