(() => {
  const isTg = typeof window.Telegram !== "undefined" && window.Telegram.WebApp;
  const tg = isTg ? window.Telegram.WebApp : null;
  const BACKEND_URL = "https://tma-den-serv.onrender.com"


  const title = document.getElementById("title");
  const userInfo = document.getElementById("userInfo");
  const backBtn = document.getElementById("backBtn");
  const closeBtn = document.getElementById("closeApp");

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

  // State
  const state = {
    step: "categories",
    catalog: null,
    selection: { category: null, brand: null, model: null, service: null },
    history: []
  };

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
    }

    // Load data
    const res = await fetch("./data/catalog.json");
    state.catalog = await res.json();

    renderCategories();
    wireCommon();
  }
  if (sendBtn) sendBtn.disabled = false;
  function wireCommon() {
    closeBtn.addEventListener("click", () => tg ? tg.close() : window.close());

    backBtn.addEventListener("click", () => {
      if (!state.history.length) return;
      const prev = state.history.pop();
      showScreen(prev);
    });
    brandSearch.addEventListener("input", () => renderBrands(brandSearch.value));
    modelSearch.addEventListener("input", () => renderModels(modelSearch.value));

    // ⬇️ Лайв-валидация: на ввод в полях и переключение чекбокса
    [fName, fPhone, fCity, fComment].forEach(el => {
      el.addEventListener("input", validateForm);
    });
    if (legalCheckbox) legalCheckbox.addEventListener("change", validateForm);

    // ⬇️ НОВОЕ: лайв-валидация формы
    [fName, fPhone, fCity, fComment].forEach(el => {
      el.addEventListener("input", validateForm);
    });
    legalCheckbox?.addEventListener("change", validateForm);

    sendBtn.addEventListener("click", onSubmit);
  }


  function showScreen(name) {
    // remember current step for back
    if (state.step && state.step !== name) state.history.push(state.step);
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
        validateForm();
        break;
    }
  }

  // Screens
  function renderCategories() {
    sCategories.innerHTML = "";
    state.catalog.categories.forEach(cat => {
      const el = document.createElement("button");
      el.className = "card w-full text-left";
      el.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">${cat.title}</div>
            <div class="text-sm opacity-75">${cat.desc || ""}</div>
          </div>
          <div class="text-right text-sm opacity-80">от ${formatPrice(cat.from)}</div>
        </div>
        ${cat.restricted ? '<div class="mt-2 text-xs text-amber-600 dark:text-amber-300">⚠️ Может иметь юридические ограничения</div>' : ""}
      `;
      el.addEventListener("click", () => {
        state.selection.category = cat;
        renderBrands();
        showScreen("brands");
      });
      sCategories.appendChild(el);
    });
    showScreen("categories");
  }

  function renderBrands(filter = "") {
    brandList.innerHTML = "";
    const brands = state.catalog.brands
      .filter(b => b.toLowerCase().includes(filter.trim().toLowerCase()));

    brands.forEach(b => {
      const el = document.createElement("div");
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
        const el = document.createElement("div");
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
    serviceCards.innerHTML = "";
    const restrictedCat = !!state.selection.category.restricted;
    legalNotice.classList.toggle("hidden", !restrictedCat);
    legalCheckbox.checked = false;

    const list = state.catalog.services.filter(s =>
      s.category === state.selection.category.code &&
      s.brand === state.selection.brand &&
      s.model === state.selection.model
    );

    if (!list.length) {
      serviceCards.innerHTML = `<div class="text-sm opacity-70">Пока нет преднастроенных карточек для этой модели. Вы можете всё равно оставить заявку на общую услугу.</div>`;
    }

    list.forEach(srv => {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="font-semibold">${srv.title}</div>
        <div class="text-sm opacity-80 mt-1">Стоимость: от ${formatPrice(srv.price_from)} • Время: ${srv.duration || "—"}</div>
        <div class="mt-2">
          <button class="btn w-full" data-id="${srv.id}">Оставить заявку</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        state.selection.service = srv;
        showScreen("form");
      });
      serviceCards.appendChild(el);
    });

    // Позволяем оставить «общую» заявку по категории/модели даже без карточки
    const general = document.createElement("button");
    general.className = "btn w-full";
    general.textContent = "Оставить общую заявку по этой услуге";
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

  // Helpers
  function validateForm() {
    const restricted = !!state.selection.category?.restricted;
    const okLegal = !restricted || legalCheckbox.checked;

    const okName = fName.value.trim().length >= 2;
    const okPhone = /^\+?\d[\d\s\-()]{7,}$/.test(fPhone.value.trim());
    const valid = okName && okPhone && okLegal;

    // раньше здесь было: sendBtn.disabled = !valid;
    // Кнопку не блокируем — она всегда кликабельна:
    if (sendBtn) sendBtn.disabled = false;
    // Зато системную MainButton показываем только при валидной форме
    if (tg) tg.MainButton[valid ? "show" : "hide"]();

    return valid;
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
})();
