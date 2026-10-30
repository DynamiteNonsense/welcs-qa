// ==UserScript==
// @name         WELCS hero hotfix (search tabs + "Start searching now!" button)
// @namespace    https://github.com/DynamiteNonsense/welcs-qa
// @version      1.2.0
// @description  Fixes overlapping search tabs (EN/FR/DE) and the hidden "Start searching now!" button on welcs.com
// @match        https://www.welcs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
//
// JS, а не только CSS, т. к. фикс не привязан к именам классов вёрстки.
// Он находит вкладки по тексту на любом языке и раздвигает их по реальной
// геометрии (getBoundingClientRect), поэтому работает для любой длины перевода.
// Постоянное решение для исходников сайта описано в docs/bug-reports.md (раздел «Решение»).

(function () {
  "use strict";

  const TAB_DEST = /^(search by destination|recherche par destination|b[uú]squeda por destino|buscar por destino|suche nach (reise)?ziel)/i;
  const TAB_REF = /(reference|r[ée]f[ée]rence|referencia|referenz)/i;
  const GAP_PX = 8;

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };

  // Все видимые элементы, чей собственный короткий текст совпадает с регуляркой
  function findTextElements(re) {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t && t.length < 60 && re.test(t) && isVisible(node.parentElement)) out.push(node.parentElement);
    }
    return out;
  }

  function commonAncestor(a, b) {
    const seen = new Set();
    for (let n = a; n; n = n.parentElement) seen.add(n);
    for (let n = b; n; n = n.parentElement) if (seen.has(n)) return n;
    return null;
  }

  // Поднимаемся от el до прямого ребёнка ancestor
  function branchUnder(el, ancestor) {
    let n = el;
    while (n && n.parentElement !== ancestor) n = n.parentElement;
    return n;
  }

  // ---------- Fix 1: вкладки "Search by destination" / "Search by reference or name"
  function fixSearchTabs() {
    for (const refText of findTextElements(TAB_REF)) {
      // ближайшая к ней вкладка "по направлению"
      let best = null;
      for (const destText of findTextElements(TAB_DEST)) {
        const lca = commonAncestor(refText, destText);
        const depth = lca ? lca.querySelectorAll("*").length : Infinity;
        if (!best || depth < best.depth) best = { destText, lca, depth };
      }
      if (!best || !best.lca) continue;

      const tab1 = branchUnder(best.destText, best.lca);
      const tab2 = branchUnder(refText, best.lca);
      if (!tab1 || !tab2 || tab1 === tab2) continue;

      // 1) первая вкладка больше не обрезает текст (FR: "Recherche par destina…")
      for (const tab of [tab1, tab2]) {
        tab.style.setProperty("width", "auto", "important");
        tab.style.setProperty("max-width", "none", "important");
        tab.style.setProperty("white-space", "nowrap", "important");
        tab.style.setProperty("overflow", "visible", "important");
        tab.style.setProperty("text-overflow", "clip", "important");
        tab.style.setProperty("flex-shrink", "0", "important");
      }

      // 2) вторая вкладка сдвигается ровно на величину наложения
      const r1 = tab1.getBoundingClientRect();
      const r2 = tab2.getBoundingClientRect();
      const overlap = r1.right + GAP_PX - r2.left;
      const sameRow = Math.abs(r1.top - r2.top) < r1.height;
      if (overlap > 0 && sameRow) {
        const cs = getComputedStyle(tab2);
        if (cs.position === "absolute" || cs.position === "fixed") {
          const left = parseFloat(cs.left) || 0;
          tab2.style.setProperty("left", left + overlap + "px", "important");
        } else {
          const ml = parseFloat(cs.marginLeft) || 0;
          tab2.style.setProperty("margin-left", ml + overlap + "px", "important");
        }
      }
      tab1.dataset.wxFixed = tab2.dataset.wxFixed = "tabs";
    }
  }

  // ---------- Fix 2: кнопка "Start searching now!" наезжает на фото
  // В ES кнопка стоит под текстом, а фото начинается ниже неё. В EN после текста
  // появляется лишний вертикальный отступ: кнопка съезжает вниз и перекрывает фото.
  // Правильное поведение: кнопка ПЕРЕД фото, без наложения (не над ним и не под ним).
  const CTA_GAP_AFTER_TEXT = 60; // как в испанской версии
  const CTA_GAP_BEFORE_IMG = 24;

  const hasPicture = (el) =>
    el.tagName === "IMG" || el.tagName === "PICTURE" || getComputedStyle(el).backgroundImage !== "none";

  // Фото, которое пересекается с кнопкой (или ближайшее под ней)
  function findPhotoBelow(btn) {
    const b = btn.getBoundingClientRect();
    let best = null;
    for (const el of document.querySelectorAll("img, picture, div, figure")) {
      if (el.contains(btn) || btn.contains(el) || !hasPicture(el) || !isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 150) continue;              // только крупные фото
      const horiz = Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0;
      const near = r.top < b.bottom + 200 && r.bottom > b.top;     // под кнопкой или пересекается
      if (horiz && near && (!best || r.top < best.r.top)) best = { el, r };
    }
    return best;
  }

  // Последний текстовый блок перед кнопкой (абзац "We offer you…")
  function textAbove(btn) {
    const b = btn.getBoundingClientRect();
    let best = null;
    for (const el of document.querySelectorAll("p, h1, h2, h3, h4, div")) {
      if (el.contains(btn) || !isVisible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 20);
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const horiz = Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0;
      if (horiz && r.bottom <= b.top + 2 && (!best || r.bottom > best.r.bottom)) best = { el, r };
    }
    return best;
  }

  function placeButtonBeforePhoto(btn) {
    btn.style.removeProperty("transform");
    const photo = findPhotoBelow(btn);
    if (!photo) return true;
    const b = btn.getBoundingClientRect();
    const overlap = b.bottom + CTA_GAP_BEFORE_IMG - photo.r.top;
    if (overlap <= 0) return true; // кнопка и так перед фото

    // 1) убираем лишний отступ между текстом и кнопкой (как в ES)
    const text = textAbove(btn);
    let shift = 0;
    if (text) {
      const extraGap = b.top - (text.r.bottom + CTA_GAP_AFTER_TEXT);
      shift = Math.max(0, Math.min(extraGap, overlap));
      if (shift > 0) btn.style.setProperty("transform", `translateY(${-shift}px)`, "important");
    }

    // 2) если места всё равно не хватает, сдвигаем фото вниз (не кнопку под него)
    const rest = overlap - shift;
    if (rest > 0) {
      const cs = getComputedStyle(photo.el);
      if (cs.position === "absolute") {
        photo.el.style.setProperty("top", (parseFloat(cs.top) || 0) + rest + "px", "important");
      } else {
        photo.el.style.setProperty("margin-top", (parseFloat(cs.marginTop) || 0) + rest + "px", "important");
      }
    }
    btn.dataset.wxFixed = `button: up ${Math.round(shift)}px, photo down ${Math.round(Math.max(rest, 0))}px`;
    return true;
  }

  // Только кнопка блока For Travellers, другие .m-button-icon (например, в "A unique experience") не трогаем
  const CTA_TEXT = /start searching|empieza a buscar|commence\w*\s+(à|a)\s+(re)?chercher|beginnen\s+sie\s+jetzt\s+mit\s+der\s+suche|jetzt suchen|suche starten/i;

  // Причина BUG-2 (замерено через diagnose-cta.js): в EN блок .m-text занимает 225px,
  // а текста в нём всего 3 строки (~70px). Остальное занимают пустые абзацы и <br> в конце
  // перевода из CMS. Убираем пустые элементы в конце текстовых блоков.
  const isEmptyNode = (n) =>
    (n.nodeType === 3 && !n.textContent.replace(/\u00a0/g, " ").trim()) ||
    (n.nodeType === 1 && (n.tagName === "BR" ||
      (!n.textContent.replace(/\u00a0/g, " ").trim() && !n.querySelector("img, svg, iframe, video, input"))));

  function trimEmptyTail(el) {
    let removed = 0;
    // снимаем пустые хвосты на всех уровнях: <p>текст<br><br></p><p>&nbsp;</p>
    for (let node = el; node; ) {
      while (node.lastChild && isEmptyNode(node.lastChild)) { node.lastChild.remove(); removed++; }
      node = node.lastElementChild && !isEmptyNode(node.lastElementChild) ? node.lastElementChild : null;
    }
    // и пустые абзацы в середине (<p>&nbsp;</p>)
    el.querySelectorAll("p").forEach((p) => { if (isEmptyNode(p)) { p.remove(); removed++; } });
    if (removed) el.dataset.wxTrimmed = String(removed);
  }

  function fixStartButtons() {
    document.querySelectorAll(".mdl-imgText .m-text").forEach(trimEmptyTail);
    document.querySelectorAll("a.m-button-icon").forEach((btn) => {
      if (isVisible(btn) && CTA_TEXT.test(btn.innerText.normalize("NFC"))) placeButtonBeforePhoto(btn);
    });
  }

  function run() {
    try { fixSearchTabs(); } catch (e) { console.warn("[welcs-hotfix] tabs", e); }
    try { fixStartButtons(); } catch (e) { console.warn("[welcs-hotfix] button", e); }
  }

  run();
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(run, 150); });
  addEventListener("load", run); // картинки догрузились, размеры поменялись
  document.addEventListener("click", () => setTimeout(fixSearchTabs, 50), true); // переключение вкладок
})();
