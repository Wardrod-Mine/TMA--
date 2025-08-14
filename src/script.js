(() => {
  const isTg = typeof window.Telegram !== "undefined" && window.Telegram.WebApp;
  const tg = isTg ? window.Telegram.WebApp : null;
  const BACKEND_URL = "https://tma-den-serv.onrender.com"

  const askText = document.getElementById("askText");
  const askBtn  = document.getElementById("askBtn");


  const title = document.getElementById("title");
  const userInfo = document.getElementById("userInfo");
  const backBtn = document.getElementById("backBtn");
  const closeBtn = document.getElementById("closeApp");
  const errorBtn = document.getElementById("errorBtn");

  const sCategories = document.getElementById("screen-categories");
  const sBrands = document.getElementById("screen-brands");
  const sModels = document.getElementById("screen-models");
  const sServices = document.getElementById("screen-services");
  const sForm = document.getElementById("screen-form");

  const brandSearch = document.getElementById("brandSearch");
  const brandList = document.getElementById("brandList");
  const modelSearch = document.getElementById("modelSearch");
  const modelList = document.getElementById("modelList");
  const serviceCards = document.getElementById("serviceCards");
  const legalNotice = document.getElementById("legalNotice");
  const legalCheckbox = document.getElementById("legalCheckbox");

  const fName = document.getElementById("fName");
  const fPhone = document.getElementById("fPhone");
  const fCity = document.getElementById("fCity");
  const fComment = document.getElementById("fComment");
  const formSummary = document.getElementById("formSummary");
  const sendBtn = document.getElementById("sendBtn");

  // какие категории скрываем из каталога
  const HIDDEN_CATEGORIES = new Set(["electrics", "bluetooth", "products"]);


  // State
  const state = {
    step: "categories",
    catalog: null,
    selection: { category: null, brand: null, model: null, service: null },
    history: []
  };

  // === admin flag ===
  let IS_ADMIN = false;
  (async function detectAdmin() {
    try {
      const res = await fetch(`${BACKEND_URL}/me`, {
        headers: { "X-Telegram-Init-Data": tg?.initData || "" }
      });
      const j = await res.json();
      IS_ADMIN = !!j.admin;
      if (IS_ADMIN && userInfo) userInfo.textContent = (userInfo.textContent || "") + " • admin";
      if (IS_ADMIN && state.step === "categories") renderCategories();
      if (IS_ADMIN && state.step === "services") renderServices();
    } catch {}
  })();

  
  // Init
  init();
  async function init() {
    if (tg) {
      tg.expand();
      applyTheme(tg.themeParams || {});
      tg.onEvent("themeChanged", () => applyTheme(tg.themeParams || {}));
      const u = tg?.initDataUnsafe?.user;
      if (u) userInfo.textContent = u.username ? `@${u.username}` : (u.first_name || "");
      tg.MainButton.setParams({ text: "Отправить заявку", is_visible: false, is_active: true });
      tg.onEvent("mainButtonClicked", onSubmit);
    } else {
      console.warn("Dev mode: Telegram.WebApp не найден");
      userInfo.textContent = "Dev mode";
      IS_ADMIN = true;
    }

    // Load data
    const res = await fetch("./data/catalog.json");
    state.catalog = await res.json();// полностью убираем скрытые категории и все их услуги
    state.catalog.categories = state.catalog.categories
      .filter(c => !HIDDEN_CATEGORIES.has(c.code));
    state.catalog.services = state.catalog.services
      .filter(s => !HIDDEN_CATEGORIES.has(s.category))

    // подмешиваем правки/удаления из бэка
    try {
      const r = await fetch(`${BACKEND_URL}/services`);
      const j = await r.json();
      if (j?.ok) {
        const updates = j.updates || {};
        const deleted = new Set(j.deleted || []);
        state.catalog.services = (state.catalog.services || []).filter(s => !deleted.has(s.id));
        state.catalog.services = state.catalog.services.map(
          s => updates[s.id] ? { ...s, ...updates[s.id] } : s
        );
      }
    } catch (e) { console.warn("services overrides fetch failed", e); }

    renderCategories();
    wireCommon();
  }

  //if (sendBtn) sendBtn.disabled = false;
  function wireCommon() {
    sCategories.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act='addProductForm']");
      if (!btn) return;
      if (!IS_ADMIN) return tg?.showAlert?.("Доступно только администратору");
      openAddProductForm();
    });
    askBtn?.addEventListener("click", onAskSend);
    const detailsEl = document.getElementById("errorText");
    if (detailsEl) {
      const clamp = () => {
        detailsEl.style.height = "auto";
        detailsEl.style.height = Math.min(detailsEl.scrollHeight, 120) + "px"; // в пределах max-height
      };
      clamp();                            // выставить стартовую высоту
      detailsEl.addEventListener("input", clamp);
    }

    closeBtn.addEventListener("click", () => tg ? tg.close() : window.close());
    errorBtn?.addEventListener("click", onReportClick);
    serviceCards.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "lead") {
        const srv = (state.catalog?.services || []).find(s => s.id === id);
        if (!srv) return;
        state.selection.service = srv;
        showScreen("form");
      }
      if (act === "viewPhotos") return viewPhotos(id);
      if (act === "addPhoto") return addPhoto(id);
      if (act === "editService") return openEditServiceForm(id);
      if (act === "deleteService") return deleteService(id);
    });
    backBtn.addEventListener("click", () => {
      if (!state.history.length) return;
      const prev = state.history.pop();
      showScreen(prev, /*fromBack*/ true);
    });

    brandSearch.addEventListener("input", () => renderBrands(brandSearch.value));
    modelSearch.addEventListener("input", () => renderModels(modelSearch.value));
    // клики по кнопкам внутри карточек услуг


    [fName, fPhone, fCity, fComment].forEach(el => {
      el.addEventListener("input", validateForm);
    });
    legalCheckbox?.addEventListener("change", validateForm);

    sendBtn.addEventListener("click", onSubmit);
  }

  // === ERROR REPORTING ===
  let lastError = null;

  // Автосбор последних ошибок
  window.addEventListener("error", (e) => {
    lastError = {
      type: "error",
      message: e.message,
      source: e.filename,
      line: e.lineno,
      column: e.colno,
      stack: e.error?.stack ? String(e.error.stack).slice(0, 4000) : null
    };
  });
  window.addEventListener("unhandledrejection", (e) => {
    lastError = {
      type: "unhandledrejection",
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack ? String(e.reason.stack).slice(0, 4000) : null
    };
  });

  function collectDebug(extra = {}) {
    const u = tg?.initDataUnsafe?.user;
    return {
      ts: new Date().toISOString(),
      // url: location.href,            // ← УДАЛЕНО, ссылку не шлём
      appStep: state.step,
      selection: state.selection,
      platform: tg?.platform || "web",
      colorScheme: tg?.colorScheme || null,
      viewport: { w: innerWidth, h: innerHeight },
      user: u ? { id: u.id, username: u.username || null, first_name: u.first_name || null } : null,
      lastError,
      ...extra
    };
  }




  function onReportClick() {
    const detailsEl = document.getElementById("errorText");
    const summary = "Отправим: платформу, шаг/выбор, user_id и последнюю ошибку (если поймана). Без ссылки на страницу.";
    if (tg?.showPopup) {
      tg.showPopup({
        title: "Сообщить об ошибке?",
        message: summary,
        buttons: [{id:"cancel", type:"close", text:"Отмена"}, {id:"ok", type:"default", text:"Отправить"}]
      }, async (btnId) => {
        if (btnId !== "ok") return;
        await doSend();
      });
    } else {
      if (confirm(summary + "\n\nОтправить отчёт?")) doSend();
    }

    async function doSend() {
      try {
        const details = detailsEl ? detailsEl.value.trim() : "";
        tg?.HapticFeedback.impactOccurred("light");

        await postErrorReport({
          kind: "error_report",
          details,                      // <-- ТВОЙ ТЕКСТ
          debug: collectDebug({ note: details || undefined })
        });

        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Спасибо! Отчёт отправлен.");
        if (detailsEl) detailsEl.value = ""; // очистим поле
        lastError = null;
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось отправить отчёт. Попробуйте позже.");
      }
    }
  }

  async function postErrorReport(payload) {
    const initData = tg?.initData || "";
    const res = await fetch(`${BACKEND_URL}/report-error`, {  // BACKEND_URL уже есть в файле
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text().catch(()=>"send failed"));
  }

  function showScreen(name, fromBack = false) {
    // remember current step for back
    if (state.step && state.step !== name && !fromBack) state.history.push(state.step);
    state.step = name;

    // toggle
    [sCategories, sBrands, sModels, sServices, sForm].forEach(el => el.classList.add("hidden"));
    backBtn.classList.remove("hidden");
    tg?.MainButton.hide();

    switch (name) {
      case "categories": backBtn.classList.add("hidden"); sCategories.classList.remove("hidden"); title.textContent = "Услуги"; break;
      case "brands": sBrands.classList.remove("hidden"); title.textContent = state.selection.category.title; break;
      case "models": sModels.classList.remove("hidden"); title.textContent = `${state.selection.brand}`; break;
      case "services": sServices.classList.remove("hidden"); title.textContent = `${state.selection.brand} • ${state.selection.model}`; break;
      case "form":
        sForm.classList.remove("hidden");
        title.textContent = "Заявка";
        updateFormSummary();
        // В Telegram показываем только системный MainButton, внутреннюю кнопку скрываем
        if (tg) {
          sendBtn.classList.add("hidden");
        } else {
          sendBtn.classList.remove("hidden");
        }
        validateForm(); // актуализируем видимость MainButton и состояния
        break;
    }
  }

  function renderCategories() {
    sCategories.innerHTML = "";
    state.catalog.categories
      .filter(cat => !HIDDEN_CATEGORIES.has(cat.code)) // фильтруем лишние
      .forEach(cat => {
        const el = document.createElement("button");
        el.className = "card w-full text-left";
        el.innerHTML = `
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold">${cat.title}</div>
              <div class="text-sm opacity-75">${cat.desc || ""}</div>
            </div>
            <div class="text-right text-sm opacity-80">от ${formatPrice(cat.from)}</div>
          </div>`;
        el.addEventListener("click", () => {
          state.selection.category = cat;
          renderBrands();
          showScreen("brands");
        });
        sCategories.appendChild(el);
      });
      // Админ-панель: Добавить товар
      if (IS_ADMIN) {
        const adminBar = document.createElement("div");
        adminBar.className = "card mt-2";
        adminBar.innerHTML = `
          <div class="font-semibold">Управление товарами</div>
          <div class="mt-2">
            <button class="btn btn--pill btn-sm" data-act="addProductForm">Добавить услугу</button>
          </div>`;
        sCategories.appendChild(adminBar);
      }
    showScreen("categories");
  }
  function openAddProductForm() {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="overlay__inner">
        <div class="font-semibold mb-2">Новый товар</div>
        <div class="grid gap-2">
          <input id="ap_title" class="inp" placeholder="Название товара"/>
          <input id="ap_price" class="inp" placeholder="Цена от, ₽" type="number" min="0" step="1"/>
          <textarea id="ap_desc" class="inp" rows="3" placeholder="Краткое описание"></textarea>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button class="btn btn--pill btn-lg" id="ap_save">Сохранить</button>
          <button class="btn btn--secondary btn--pill btn-lg overlay__close">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".overlay__close").onclick = () => overlay.remove();
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    overlay.querySelector("#ap_save").onclick = async () => {
      const title = overlay.querySelector("#ap_title").value.trim();
      const price_from = Number(overlay.querySelector("#ap_price").value);
      const desc = overlay.querySelector("#ap_desc").value.trim();
      if (!title || !Number.isFinite(price_from) || price_from < 0) {
        return tg?.showAlert?.("Заполните название и корректную цену");
      }
      try {
        tg?.MainButton.setParams({ text: "Сохраняем…" });
        tg?.MainButton.show(); tg?.MainButton.disable();

        const res = await fetch(`${BACKEND_URL}/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": tg?.initData || ""
          },
          body: JSON.stringify({ title, price_from, desc })
        });
        const j = await res.json().catch(()=>null);
        if (!res.ok || !j?.ok) throw new Error(j?.error || "save failed");

        overlay.remove();
        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Товар сохранён ✅");
        // при желании: сразу предложить добавить фото по id товара:
        // addPhoto(j.item.id);
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось сохранить товар");
      } finally {
        tg?.MainButton.hide();
      }
    };
  }

  function renderBrands(filter = "") {
    brandList.innerHTML = "";
    const brands = state.catalog.brands
      .filter(b => b.toLowerCase().includes(filter.trim().toLowerCase()));

    brands.forEach(b => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "item text-center";
      el.textContent = b;
      el.addEventListener("click", () => {
        state.selection.brand = b;
        renderModels();
        showScreen("models");
      });
      brandList.appendChild(el);
    });
  }

  function renderModels(filter = "") {
    modelList.innerHTML = "";
    const models = state.catalog.models[state.selection.brand] || [];
    models
      .filter(m => m.toLowerCase().includes(filter.trim().toLowerCase()))
      .forEach(m => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "item text-center";
        el.textContent = m;
        el.addEventListener("click", () => {
          state.selection.model = m;
          renderServices();
          showScreen("services");
        });
        modelList.appendChild(el);
      });
  }

  function renderServices() {
    if (HIDDEN_CATEGORIES.has(state.selection.category?.code)) {
      tg?.showAlert?.("Этот раздел временно недоступен");
      return showScreen("categories");
    }

    serviceCards.innerHTML = "";

    const list = state.catalog.services.filter(s =>
      s.category === state.selection.category.code &&
      s.brand === state.selection.brand &&
      s.model === state.selection.model
    );

    if (!list.length) {
      serviceCards.innerHTML = `<div class="text-sm opacity-70">
        Пока нет преднастроенных карточек для этой модели. Вы можете всё равно оставить заявку на общую услугу.
      </div>`;
    }

    list.forEach(srv => {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="font-semibold">${srv.title}</div>
        <div class="text-sm opacity-80 mt-1">
          Стоимость: от ${formatPrice(srv.price_from)} • Время: ${srv.duration || "—"}
        </div>

        <div class="grid grid-cols-2 gap-2 mt-3">
          <button class="btn btn-block btn--pill btn-sm" data-act="lead" data-id="${srv.id}">
            Оставить заявку
          </button>
          <button class="btn btn-block btn--pill btn-sm" data-act="viewPhotos" data-id="${srv.id}">
            Посмотреть фото автомобиля
          </button>
        </div>

        ${IS_ADMIN ? `
        <div class="mt-2">
          <button class="btn btn--secondary btn-block btn--pill btn-sm" data-act="addPhoto" data-id="${srv.id}">
            Добавить фото
          </button>
          <button class="btn btn--secondary btn-block btn--pill btn-sm" data-act="editService" data-id="${srv.id}">
            Редактировать
          </button>
          <button class="btn btn--secondary btn-block btn--pill btn-sm" data-act="deleteService" data-id="${srv.id}">
            Удалить
          </button>
        </div>` : ``}`;
      serviceCards.appendChild(el);
    });


    // Общая заявка по категории/модели
    const general = document.createElement("button");
    general.className = "btn btn-block btn--pill btn-lg mt-2";
    general.textContent = "Оставить общую заявку по этой услуге";
    general.dataset.act = "lead";
    general.dataset.id = "general";
    general.addEventListener("click", () => {
      state.selection.service = {
        id: "general",
        category: state.selection.category.code,
        brand: state.selection.brand,
        model: state.selection.model,
        title: `Заявка: ${state.selection.category.title}`
      };
      showScreen("form");
    });
    serviceCards.appendChild(general);
  }

  async function viewPhotos(serviceId) {
  try {
    const res = await fetch(`${BACKEND_URL}/photos/${encodeURIComponent(serviceId)}`);
    const j = await res.json();
    const items = (j.items || []).slice(0, 20);
    if (!items.length) {
      return tg?.showAlert?.("Фото пока нет.") || alert("Фото пока нет.");
    }

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="overlay__inner">
        <div class="overlay__grid">
          ${items.map(x => `<img src="${BACKEND_URL}${x.url}" alt="" loading="lazy">`).join("")}
        </div>
        <button class="btn overlay__close">Закрыть</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".overlay__close").onclick = () => overlay.remove();
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
  } catch (e) {
    console.warn(e);
    tg?.showAlert?.("Не удалось загрузить фото") || alert("Не удалось загрузить фото");
  }
}

  async function addPhoto(serviceId) {
    if (!IS_ADMIN) return tg?.showAlert?.("Доступно только администратору") || alert("Доступно только администратору");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        tg?.MainButton.setParams({ text: "Загрузка фото…" });
        tg?.MainButton.show(); tg?.MainButton.disable();

        const fd = new FormData();
        fd.append("photo", file, file.name || "photo.jpg");
        const res = await fetch(`${BACKEND_URL}/photos/${encodeURIComponent(serviceId)}`, {
          method: "POST",
          headers: { "X-Telegram-Init-Data": tg?.initData || "" },
          body: fd
        });
        if (!res.ok) throw new Error(await res.text().catch(()=>"upload failed"));

        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Фото добавлено ✅") || alert("Фото добавлено ✅");
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось загрузить фото") || alert("Не удалось загрузить фото");
      } finally {
        tg?.MainButton.hide();
      }
    };
    input.click();
  }

  function updateFormSummary() {
    const { category, brand, model, service } = state.selection;
    formSummary.textContent =
      `${category.title} → ${brand} → ${model} → ${service?.title || "Без названия"}`;
  }

  // Submit
  async function onSubmit() {
    if (!validateForm()) {
      if (tg?.showAlert) tg.showAlert("Заполните имя и телефон.\nДля некоторых услуг требуется подтвердить законность.");
      else alert("Заполните имя и телефон. Для некоторых услуг требуется подтвердить законность.");
      return;
    }

    const payload = {
      type: "lead",
      ts: Date.now(),
      category: state.selection.category.title,
      brand: state.selection.brand,
      model: state.selection.model,
      service: state.selection.service?.title || null,
      price_from: state.selection.service?.price_from || state.selection.category.from || null,
      name: fName.value.trim(),
      phone: fPhone.value.trim(),
      city: fCity.value.trim(),
      comment: fComment.value.trim()
    };

    try {
      // 1) Отправка в бота
      tg?.sendData(JSON.stringify(payload));

      // 2) (опционально) параллельно — на ваш бекенд
      if (BACKEND_URL && BACKEND_URL.startsWith("http")) {
        await fetch(`${BACKEND_URL}/web-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      tg?.HapticFeedback.impactOccurred("light");
      tg?.showAlert?.("Заявка отправлена. Мы свяжемся с вами.");
    } catch (e) {
      console.warn("submit error", e);
      alert("Не удалось отправить заявку. Попробуйте позже.");
    }
  }
  // === phone validation ===
  // Регион берём из языка Telegram (ru/uk/kk/be) → RU/UA/KZ/BY, иначе GLOBAL.
  function detectRegion() {
    const lang = (tg?.initDataUnsafe?.user?.language_code || "").toLowerCase();
    if (lang.startsWith("ru")) return "RU";
    if (lang.startsWith("kk")) return "KZ";
    if (lang.startsWith("uk")) return "UA";
    if (lang.startsWith("be")) return "BY";
    return "RU"; // по умолчанию
  }
  function validatePhoneByRegion(value, region = "RU") {
    const digits = value.replace(/\D/g, "");
    switch (region) {
      case "RU": // мобильные: +7 9xx xxx-xx-xx, допускаем ведущие 8/7/+7
        return /^9\d{9}$/.test(digits) || /^79\d{9}$/.test(digits) || /^89\d{9}$/.test(digits);
      case "KZ": // Казахстан: +7 7xx xxx-xx-xx
        return /^77\d{8}$/.test(digits) || /^7?7\d{9}$/.test(digits);
      case "UA": // Украина: +380 xx xxx-xx-xx (мобилки 39/50/63/66/67/68/73/89/91/92/93/94/95/96/97/98/99)
        return /^(380(39|50|63|66|67|68|73|89|91|92|93|94|95|96|97|98|99)\d{7})$/.test(digits);
      case "BY": // Беларусь: +375 xx xxx-xx-xx (25/29/33/44)
        return /^(375(25|29|33|44)\d{7})$/.test(digits);
      default:  // E.164 упрощённо
        return /^\+?[1-9]\d{9,14}$/.test(value.replace(/\s/g, ""));
    }
  }

  // Helpers
  function validateForm() {
    const okName = fName.value.trim().length >= 2;
    const region = detectRegion();
    const okPhone = validatePhoneByRegion(fPhone.value.trim(), region);
    const valid = okName && okPhone;

    if (!tg) sendBtn.disabled = !valid;

    if (tg) {
      tg.MainButton.setParams({ text: "Отправить заявку" });
      tg.MainButton[valid ? "show" : "hide"]();
    }
    return valid;
  }

async function onAskSend() {
  const text = askText?.value.trim();
  if (!text) return tg?.showAlert?.("Введите вопрос") || alert("Введите вопрос");
  try {
    tg?.MainButton.setParams({ text: "Отправка вопроса…" });
    tg?.MainButton.show(); tg?.MainButton.disable();

    await postAsk({ text });
    tg?.HapticFeedback.notificationOccurred("success");
    tg?.showAlert?.("Отправили! Мы свяжемся с вами.") || alert("Отправили!");
    askText.value = "";
  } catch (e) {
    console.warn(e);
    tg?.HapticFeedback.notificationOccurred("error");
    tg?.showAlert?.("Не удалось отправить вопрос") || alert("Не удалось отправить вопрос");
  } finally {
    tg?.MainButton.hide();
  }
  }

  async function postAsk(payload) {
    const initData = tg?.initData || "";
    const res = await fetch(`${BACKEND_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text().catch(()=>"ask failed"));
    return res.json();
  }




  function formatPrice(n){ return new Intl.NumberFormat("ru-RU").format(n) + " ₽"; }

  function applyTheme(tp){
    const root = document.documentElement;
    if (tp?.bg_color) root.style.setProperty("--bg", tp.bg_color);
    if (tp?.text_color) root.style.setProperty("--fg", tp.text_color);
    if (tp?.hint_color) root.style.setProperty("--muted", tp.hint_color);
    if (tp?.link_color) root.style.setProperty("--accent", tp.link_color);
    if (tp?.section_separator_color) root.style.setProperty("--border", tp.section_separator_color);
  }

  function openEditServiceForm(id) {
    const srv = (state.catalog.services || []).find(s => s.id === id);
    if (!srv) return;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="overlay__inner">
        <div class="font-semibold mb-2">Редактировать услугу</div>
        <div class="grid gap-2">
          <input id="es_title" class="inp" placeholder="Название" value="${(srv.title||"").replace(/"/g, "&quot;")}" />
          <input id="es_price" class="inp" type="number" min="0" step="1" placeholder="Цена от, ₽" value="${Number(srv.price_from||0)}" />
          <input id="es_duration" class="inp" placeholder="Время (например: 1–2 ч.)" value="${srv.duration ? srv.duration.replace(/"/g, "&quot;") : ""}" />
          <textarea id="es_desc" class="inp" rows="3" placeholder="Описание">${srv.desc ? srv.desc : ""}</textarea>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button class="btn btn--pill btn-lg" id="es_save">Сохранить</button>
          <button class="btn btn--secondary btn--pill btn-lg overlay__close">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".overlay__close").onclick = () => overlay.remove();
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    overlay.querySelector("#es_save").onclick = async () => {
      const patch = {
        title: overlay.querySelector("#es_title").value.trim(),
        price_from: Number(overlay.querySelector("#es_price").value),
        duration: overlay.querySelector("#es_duration").value.trim(),
        desc: overlay.querySelector("#es_desc").value.trim()
      };
      if (!patch.title || !Number.isFinite(patch.price_from) || patch.price_from < 0) {
        return tg?.showAlert?.("Заполните название и корректную цену");
      }
      try {
        tg?.MainButton.setParams({ text: "Сохраняем…" }); tg?.MainButton.show(); tg?.MainButton.disable();
        const res = await fetch(`${BACKEND_URL}/services/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": tg?.initData || ""
          },
          body: JSON.stringify(patch)
        });
        const j = await res.json().catch(()=>null);
        if (!res.ok || !j?.ok) throw new Error(j?.error || "save failed");

        // применим патч локально и перерисуем
        const i = state.catalog.services.findIndex(s => s.id === id);
        if (i >= 0) state.catalog.services[i] = { ...state.catalog.services[i], ...patch };
        overlay.remove();
        renderServices();
        tg?.HapticFeedback.notificationOccurred("success");
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось сохранить");
      } finally {
        tg?.MainButton.hide();
      }
    };
  }

  async function deleteService(id) {
    if (!confirm("Удалить эту услугу?")) return;
    try {
      tg?.MainButton.setParams({ text: "Удаляем…" }); tg?.MainButton.show(); tg?.MainButton.disable();
      const res = await fetch(`${BACKEND_URL}/services/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Telegram-Init-Data": tg?.initData || "" }
      });
      const j = await res.json().catch(()=>null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "delete failed");
      // убираем из локального списка
      state.catalog.services = (state.catalog.services || []).filter(s => s.id !== id);
      renderServices();
      tg?.HapticFeedback.notificationOccurred("success");
    } catch (e) {
      console.warn(e);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert?.("Не удалось удалить");
    } finally {
      tg?.MainButton.hide();
    }
  }


})();
