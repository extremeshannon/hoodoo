(function (global) {
  var TOKEN_KEY = "hoodoo_access_token";

  function parseDetail(data) {
    if (!data || typeof data !== "object") return "Request failed";
    var d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && d[0].msg) return d[0].msg;
    return "Request failed";
  }

  global.HoodooApi = {
    tokenKey: TOKEN_KEY,
    base: function () {
      return global.HOODOO_API_BASE || "";
    },
    apiUrl: function (path) {
      return this.base() + "/api" + path;
    },
    getToken: function () {
      return global.localStorage.getItem(TOKEN_KEY);
    },
    setToken: function (t) {
      if (t) global.localStorage.setItem(TOKEN_KEY, t);
      else global.localStorage.removeItem(TOKEN_KEY);
    },
    clearToken: function () {
      global.localStorage.removeItem(TOKEN_KEY);
    },
    parseDetail: parseDetail,
    fetchJson: function (path, opts) {
      opts = opts || {};
      var headers = Object.assign({}, opts.headers || {});
      var tok = this.getToken();
      if (tok) headers.Authorization = "Bearer " + tok;
      if (opts.body && typeof opts.body === "string" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      var req = Object.assign({}, opts, {
        credentials: "same-origin",
        headers: headers,
      });
      return fetch(this.apiUrl(path), req).then(function (r) {
        if (r.status === 204) return null;
        return r.text().then(function (text) {
          var j = null;
          try {
            j = text ? JSON.parse(text) : null;
          } catch (e) {
            j = null;
          }
          if (!r.ok) throw new Error(parseDetail(j) || r.statusText);
          return j;
        });
      });
    },
  };
})(typeof window !== "undefined" ? window : this);
