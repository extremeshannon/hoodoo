(function (global) {
  var TOKEN_KEY = "hoodoo_access_token";

  function parseDetail(data) {
    if (!data || typeof data !== "object") return "Request failed";
    var d = data.detail;
    if (typeof d === "string" && d.trim()) return d;
    if (Array.isArray(d) && d.length) {
      var first = d[0];
      if (first && typeof first.msg === "string") return first.msg;
      if (first && typeof first.message === "string") return first.message;
    }
    if (d && typeof d === "object" && typeof d.msg === "string") return d.msg;
    return "Request failed";
  }

  /** Parse fetch Response body (JSON or plain text) and surface API errors. */
  function parseResponse(r, text) {
    var j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch (e) {
      j = null;
    }
    if (!r.ok) {
      var msg = parseDetail(j);
      if (!msg || msg === "Request failed") {
        msg = (r.status ? r.status + " " : "") + (r.statusText || "Error");
      }
      return { ok: false, error: msg };
    }
    return { ok: true, data: j };
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
    parseResponse: parseResponse,
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
