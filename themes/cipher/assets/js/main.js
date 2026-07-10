/* Cipher — theme runtime (no build step, no dependencies).
   Reads config from window.CIPHER injected by head.html. */
(function () {
  "use strict";

  var cfg = window.CIPHER || {};
  var ICON_DARK = (cfg.switch && cfg.switch[0]) || "◐";
  var ICON_LIGHT = (cfg.switch && cfg.switch[1]) || "◑";

  /* ── Theme toggle ─────────────────────────────────────────── */
  function currentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function setToggleIcon(btn) {
    btn.textContent = currentTheme() === "dark" ? ICON_LIGHT : ICON_DARK;
    btn.setAttribute("aria-label", "Switch to " + (currentTheme() === "dark" ? "light" : "dark") + " theme");
  }

  function initToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    setToggleIcon(btn);
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      var root = document.documentElement.classList;
      root.remove("light", "dark");
      root.add(next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      setToggleIcon(btn);
    });
  }

  /* ── Selectable (disable text selection when configured) ──── */
  function initSelectable() {
    if (cfg.selectable === false) {
      document.documentElement.style.userSelect = "none";
    }
  }

  /* ── TOC scrollspy ────────────────────────────────────────── */
  function initScrollspy() {
    var toc = document.querySelector(".toc");
    if (!toc) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    var map = {};
    var targets = [];
    links.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      var el = document.getElementById(id);
      if (el) { map[id] = a; targets.push(el); }
    });
    if (!targets.length) return;

    var current = null;
    function activate(id) {
      if (current === id) return;
      if (current && map[current]) map[current].classList.remove("active");
      if (map[id]) map[id].classList.add("active");
      current = id;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target.id);
      });
    }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });

    targets.forEach(function (t) { observer.observe(t); });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    initToggle();
    initSelectable();
    initScrollspy();
  });
})();
