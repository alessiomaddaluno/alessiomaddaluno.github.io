/* Cipher — client-side search (requires Fuse, concatenated before this file).
   Reads Fuse options from window.CIPHER.searchFuse and the index URL from
   window.CIPHER.searchIndex. */
(function () {
  "use strict";

  var input = document.getElementById("search-input");
  var result = document.getElementById("search-result");
  if (!input || !result) return;

  var cfg = window.CIPHER || {};
  var opts = cfg.searchFuse || { keys: ["title", "summary", "content"], threshold: 0.4, ignoreLocation: true };
  var indexURL = cfg.searchIndex || "/index.json";

  var fuse = null;

  fetch(indexURL)
    .then(function (r) { return r.json(); })
    .then(function (data) { fuse = new Fuse(data, opts); })
    .catch(function () { result.innerHTML = "<li>Search index unavailable.</li>"; });

  input.addEventListener("input", function () {
    var q = this.value.trim();
    if (!fuse || !q) { result.innerHTML = ""; return; }
    var hits = fuse.search(q).slice(0, 20);
    result.innerHTML = hits
      .map(function (h) {
        return '<li><a href="' + h.item.permalink + '">' + h.item.title + "</a></li>";
      })
      .join("");
  });
})();
