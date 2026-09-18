(function () {
  var next = location.pathname + location.search + location.hash;
  function bounce() {
    location.replace("/login?next=" + encodeURIComponent(next || "/"));
  }
  if (!window.HoodooApi || !window.HoodooApi.getToken()) {
    bounce();
    return;
  }
  window.HoodooApi.fetchJson("/auth/me")
    .then(function (u) {
      if (!u || (u.role !== "staff" && u.role !== "admin")) {
        bounce();
        return;
      }
      document.body.classList.add("is-hoodoo-staff");
    })
    .catch(bounce);
})();
