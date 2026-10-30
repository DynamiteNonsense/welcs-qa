// Вставить в консоль браузера (F12, вкладка Console) на /es/, /en/, /fr/, /de/ и сравнить вывод.
// Ищет кнопку CTA в блоке For Travellers / Para Viajeros:
//   ES "¡Empieza a buscar ahora!", EN "Start searching now!",
//   FR "Commencez à chercher dès maintenant !", DE "Beginnen Sie jetzt mit der Suche!"
(() => {
  const CTA = /start searching|empieza a buscar|commence\w*\s+(à|a)\s+(re)?chercher|beginnen\s+sie\s+jetzt\s+mit\s+der\s+suche|jetzt suchen|suche starten/i;
  // убираем неразрывные пробелы (во FR перед "!") и приводим "à" к одному виду
  const norm = (s) => (s || "").normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  const all = [...document.querySelectorAll("a.m-button-icon")].filter((a) => a.offsetParent);
  // 1) по тексту, 2) если перевод снова поменяют: по структуре, кнопка внутри секции mdl-imgText
  let btn = all.find((a) => CTA.test(norm(a.innerText)))
         || all.find((a) => a.closest("section.mdl-imgText"));
  if (btn && !CTA.test(norm(btn.innerText))) console.warn("Кнопка найдена по структуре, а не по тексту. Проверь, что выделена нужная:", btn.innerText.trim());
  if (!btn) {
    console.warn("Кнопка не найдена, тексты кнопок на странице:", all.map((a) => a.innerText.trim()));
    return;
  }
  btn.scrollIntoView({ block: "center" });
  btn.style.outline = "3px solid red"; // видно, что выбрана нужная кнопка

  const desc = (n) => n.tagName.toLowerCase() + (n.classList.length ? "." + [...n.classList].join(".") : "");
  const info = (n, level) => {
    const cs = getComputedStyle(n), r = n.getBoundingClientRect();
    return { level, el: desc(n), text: (n.innerText || "").trim().replace(/\s+/g, " ").slice(0, 35) || "(ПУСТО)",
      top: Math.round(r.top + scrollY), height: Math.round(r.height), position: cs.position, cssTop: cs.top,
      marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
      minHeight: cs.minHeight, display: cs.display, justify: cs.justifyContent, transform: cs.transform };
  };

  const rows = [];
  for (let n = btn, i = 0; n && i < 5; n = n.parentElement, i++) rows.push(info(n, "parent " + i));
  // все дети колонки с кнопкой и её родителя: ищем пустые элементы с высотой
  for (const col of [btn.parentElement, btn.parentElement.parentElement])
    [...col.children].forEach((c) => rows.push(info(c, "child of " + desc(col))));
  // картинки в той же секции: фото гостиной и фото семьи
  const section = btn.closest("section") || btn.parentElement.parentElement.parentElement;
  section.querySelectorAll("img, picture, [style*='background']").forEach((im) => {
    const box = im.closest("div") || im;
    rows.push(info(box, "image box"));
  });
  console.log("Кнопка:", btn.innerText.trim(), "| секция:", desc(section));
  console.table(rows);
})();
