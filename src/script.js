(() => {
  // ===== Telegram & backend =====
  const isTg = typeof window.Telegram !== "undefined" && window.Telegram.WebApp;
  const tg = isTg ? window.Telegram.WebApp : null;
  const BACKEND_URL = window.BACKEND_URL || window.SERVER_URL || "https://tma-den-serv.onrender.com";

  // ===== DOM =====
  const title = document.getElementById("title");
  const userInfo = document.getElementById("userInfo");
  const backBtn = document.getElementById("backBtn");
  const closeBtn = document.getElementById("closeApp");

  const sCategories = document.getElementById("screen-categories");
  const sBrands     = document.getElementById("screen-brands");
  const sModels     = document.getElementById("screen-models");
  const sServices   = document.getElementById("screen-services");
  const sForm       = document.getElementById("screen-form");

  const brandSearch = document.getElementById("brandSearch");
  const brandList   = document.getElementById("brandList");
  const modelSearch = document.getElementById("modelSearch");
  const modelList   = document.getElementById("modelList");
  const serviceCards= document.getElementById("serviceCards");

  // форма заявки
  const fName    = document.getElementById("fName");
  const fPhone   = document.getElementById("fPhone");
  const fCity    = document.getElementById("fCity");
  const fComment = document.getElementById("fComment");
  const sendBtn  = document.getElementById("sendBtn");

  // блок «вопрос админу»
  const askText  = document.getElementById("askText");
  const askBtn   = document.getElementById("askBtn");

  // ===== State =====
  const state = {
    step: "categories",
    catalog: null,
    selection: { category: null, brand: null, model: null, service: null },
    history: []
  };

  // какие категории скрываем
  const HIDDEN_CATEGORIES = new Set(["electrics", "bluetooth", "products"]);

  // ===== Admin flag =====
  let IS_ADMIN = false;
  (async function detectAdmin() {
    try {
      const res = await fetch(`${BACKEND_URL}/me`, {
        headers: { "X-Telegram-Init-Data": tg?.initData || "" }
      });
      const j = await res.json();
      IS_ADMIN = !!j.admin;
      if (IS_ADMIN && userInfo) {
        userInfo.textContent = (userInfo.textContent || "") + " • admin";
      }
      // дорисуем то, где уже находимся
      if (state.step === "categories") renderCategories();
      if (state.step === "services")   renderServices();
    } catch {}
  })();

  // ===== Init =====
  init();
  async function init() {
    if (tg) {
      tg.expand();
      applyTheme(tg.themeParams || {});
      tg.onEvent("themeChanged", () => applyTheme(tg.themeParams || {}));
      const u = tg?.initDataUnsafe?.user;
      if (u) userInfo.textContent = u.username ? `@${u.username}` : (u.first_name || "");
      tg.MainButton.setParams({ text: "Отправить заявку", is_visible: false, is_active: true });
    } else {
      // dev режим
      console.warn("Dev mode: Telegram.WebApp не найден");
      userInfo.textContent = "Dev mode";
      IS_ADMIN = true; // в браузере покажем админ-функции для проверки
    }

    // Загрузка каталога
    const res = await fetch("./data/catalog.json");
    state.catalog = await res.json();

    // Спрятать скрытые категории/услуги (перестраховка)
    state.catalog.categories = (state.catalog.categories || []).filter(c => !HIDDEN_CATEGORIES.has(c.code));
    state.catalog.services   = (state.catalog.services   || []).filter(s => !HIDDEN_CATEGORIES.has(s.category));

    // Подмешиваем правки/удаления услуг с бэка
    // Подмешиваем правки/удаления услуг + добавляем новые, созданные на бэке
    try {
      const r = await fetch(`${BACKEND_URL}/services`);
      const j = await r.json();
      if (j?.ok) {
        const updates = j.updates || {};
        const deleted = new Set(j.deleted || []);

        const base = state.catalog.services || [];
        const baseIds = new Set(base.map(s => s.id));

        const updatedBase = base
          .filter(s => !deleted.has(s.id))
          .map(s => updates[s.id] ? { ...s, ...updates[s.id] } : s);

        const addedFromServer = Object.entries(updates)
          .filter(([id]) => !baseIds.has(id) && !deleted.has(id))
          .map(([id, s]) => ({ id, ...s }));

        state.catalog.services = [...updatedBase, ...addedFromServer];
      }
    } catch (e) { console.warn("services overrides fetch failed", e); }

    wireCommon();
    renderCategories();
    showScreen("categories");
  }

  // ===== Wiring =====
  function wireCommon() {
    // 1) Сообщить об ошибке
    const errorBtn  = document.getElementById("errorBtn");
    const errorText = document.getElementById("errorText");
    errorBtn?.addEventListener("click", async () => {
      const details = (errorText?.value || "").trim();
      try {
        tg?.MainButton.setParams({ text: "Отправляем отчёт…" }); tg?.MainButton.show(); tg?.MainButton.disable();
        const debug = {
          ts: Date.now(),
          user: tg?.initDataUnsafe?.user || null,
          platform: tg?.platform || "",
          colorScheme: tg?.colorScheme || "",
          appStep: state.step,
          selection: state.selection
        };
        const res = await fetch(`${BACKEND_URL}/report-error`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg?.initData || "" },
          body: JSON.stringify({ details, debug })
        });
        if (!res.ok) throw new Error("report failed");
        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Спасибо! Отчёт отправлен ✅");
        if (errorText) errorText.value = "";
      } catch(e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось отправить отчёт");
      } finally { tg?.MainButton.hide(); }
    });

    closeBtn?.addEventListener("click", () => tg ? tg.close() : window.close());

    backBtn?.addEventListener("click", () => {
      if (!state.history.length) return;
      const prev = state.history.pop();
      showScreen(prev, /*fromBack*/ true);
    });

    brandSearch?.addEventListener("input", () => renderBrands(brandSearch.value));
    modelSearch?.addEventListener("input", () => renderModels(modelSearch.value));

    // «вопрос админу»
    askBtn?.addEventListener("click", onAskSend);

    // клики по карточкам услуг (делегирование)
    serviceCards.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id  = btn.dataset.id;
      const act = btn.dataset.act;

      if (act === "lead") {
        // найти услугу и открыть форму
        const srv = (state.catalog?.services || []).find(s => s.id === id);
        if (!srv) return;
        state.selection.service = srv;
        showScreen("form");
      }
      if (act === "viewPhotos") return viewPhotos(id);
      if (act === "addPhoto")  return addPhoto(id);
      if (act === "editService")   return openEditServiceForm(id);
      if (act === "deleteService") return deleteService(id);
    });

    // лайв-валидация формы
    [fName, fPhone, fCity, fComment].forEach(el => el?.addEventListener("input", validateForm));
    sendBtn?.addEventListener("click", onSubmit);
  }

  function updateBackButton() {
    // скрывать, когда некуда возвращаться
    backBtn?.classList.toggle("hidden", state.history.length === 0);
  }

  // ===== Screens common =====
  function showScreen(name, fromBack = false) {
    if (state.step && state.step !== name && !fromBack) state.history.push(state.step);
    state.step = name;

    [sCategories, sBrands, sModels, sServices, sForm].forEach(el => el?.classList?.add("hidden"));

    if (name === "categories") {
      sCategories.classList.remove("hidden");
      title.textContent = "Каталог";
    }
    if (name === "brands") {
      sBrands.classList.remove("hidden");
      title.textContent = state.selection.category?.title || "Выбор марки";
    }
    if (name === "models") {
      sModels.classList.remove("hidden");
      title.textContent = state.selection.brand || "Выбор модели";
    }
    if (name === "services") {
      sServices.classList.remove("hidden");
      const cat = state.selection.category?.title || "";
      const bm  = `${state.selection.brand || ""} • ${state.selection.model || ""}`.trim();
      title.textContent = bm ? `${bm}` : cat || "Услуги";
    }
    if (name === "form") {
      sForm.classList.remove("hidden");
      title.textContent = "Заявка";
      validateForm();
    }
    updateBackButton()
  }



  // ===== Screens =====
  function renderCategories() {
    sCategories.innerHTML = "";

    (state.catalog.categories || []).forEach(cat => {
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
      `;
      el.addEventListener("click", () => {
        state.selection.category = cat;
        renderBrands();
        showScreen("brands");
      });
      sCategories.appendChild(el);
    });
  }

  function renderBrands(filter = "") {
    brandList.innerHTML = "";
    const brands = (state.catalog.brands || [])
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
    const models = (state.catalog.models[state.selection.brand] || [])
      .filter(m => m.toLowerCase().includes(filter.trim().toLowerCase()));

    models.forEach(m => {
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
    // защита
    if (HIDDEN_CATEGORIES.has(state.selection.category?.code)) {
      tg?.showAlert?.("Этот раздел временно недоступен");
      return showScreen("categories");
    }

    serviceCards.innerHTML = "";

    const list = (state.catalog.services || []).filter(s =>
      s.category === state.selection.category.code &&
      s.brand    === state.selection.brand &&
      s.model    === state.selection.model
    );

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `
        <div class="text-sm opacity-80">
          Пока нет преднастроенных карточек для этой модели. 
          Вы можете всё равно оставить заявку на общую услугу.
        </div>`;
      serviceCards.appendChild(empty);
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
      `;
      serviceCards.appendChild(el);
    });

    // Общая заявка
    const general = document.createElement("button");
    general.className = "btn btn-block btn--pill btn-lg mt-2";
    general.textContent = "Оставить общую заявку по этой услуге";
    general.addEventListener("click", () => {
      state.selection.service = {
        id: "general",
        category: state.selection.category.code,
        brand: state.selection.brand,
        model: state.selection.model,
        title: `Заявка: ${state.selection.category.title}`,
        price_from: state.selection.category.from
      };
      showScreen("form");
    });
    serviceCards.appendChild(general);

    // Админу показываем кнопку добавления услуги ТОЛЬКО если карточек услуг нет
    // Админ-панель снизу: выбор услуги + действия + добавление услуги
    if (IS_ADMIN) {
      const hasServices = list.length > 0;
      const adminBar = document.createElement("div");
      adminBar.className = "card mt-2";
      adminBar.innerHTML = `
        <div class="font-semibold">Управление</div>
        ${hasServices ? `
          <div class="mt-2 grid gap-2">
            <select id="admSrvSelect" class="inp">
              ${list.map(s => `<option value="${s.id}">${s.title}</option>`).join("")}
            </select>
            <div class="grid grid-cols-3 gap-2">
              <button class="btn btn--pill btn-sm" data-act="admAddPhoto">Добавить фото</button>
              <button class="btn btn--pill btn-sm" data-act="admEdit">Редактировать услугу</button>
              <button class="btn btn--pill btn-sm" data-act="admDelete">Удалить карточку</button>
            </div>
          </div>
        ` : `<div class="text-sm opacity-75 mt-2">Для этой модели пока нет карточек услуг</div>`}
        <div class="mt-2">
          <button class="btn btn--pill btn-sm btn-block" data-act="addServiceForm">
            Добавить карточку услуги
          </button>
        </div>
      `;
      serviceCards.appendChild(adminBar);

      // локальные события админ-панели
      adminBar.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-act]");
        if (!b) return;
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === "addServiceForm") return openAddServiceForm();

        const select = adminBar.querySelector("#admSrvSelect");
        const id = select?.value;
        if (!id) return tg?.showAlert?.("Нет выбранной услуги");

        if (act === "admAddPhoto")  return addPhoto(id);
        if (act === "admEdit")      return openEditServiceForm(id);
        if (act === "admDelete")    return deleteService(id);
      });
    }
  } 

  // ===== Галерея фото =====
  async function viewPhotos(serviceId) {
    try {
      const res = await fetch(`${BACKEND_URL}/photos/${encodeURIComponent(serviceId)}`);
      const j = await res.json();
      const items = (j.items || []);
      if (!items.length) return tg?.showAlert?.("Фото пока нет.") || alert("Фото пока нет.");

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
      tg?.showAlert?.("Не удалось загрузить фото");
    }
  }

  async function addPhoto(serviceId) {
    if (!IS_ADMIN) return tg?.showAlert?.("Доступно только администратору");
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        tg?.MainButton.setParams({ text: "Загружаем фото…" }); tg?.MainButton.show(); tg?.MainButton.disable();
        const fd = new FormData();
        fd.append("photo", file);
        const res = await fetch(`${BACKEND_URL}/photos/${encodeURIComponent(serviceId)}`, {
          method: "POST",
          headers: { "X-Telegram-Init-Data": tg?.initData || "" },
          body: fd
        });
        const j = await res.json().catch(()=>null);
        if (!res.ok || !j?.ok) throw new Error(j?.error || "upload failed");
        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Фото загружено ✅");
      } catch(e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось загрузить фото");
      } finally {
        tg?.MainButton.hide();
      }
    };
    inp.click();
  }


  // ===== Админ: правка/удаление услуги =====
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
      // убрать локально
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

  // ===== Админ: добавить услугу =====
  function openAddProductForm() {
    if (document.getElementById("overlay-add-product")) return;
    const overlay = document.createElement("div");
    overlay.id = "overlay-add-product";
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="overlay__inner">
        <div class="font-semibold mb-2">Новая услуга</div>
        <div class="grid gap-2">
          <input id="ap_title" class="inp" placeholder="Название услуги"/>
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
        tg?.showAlert?.("Услуга сохранена ✅");
        // можно сразу предложить добавить фото:
        // addPhoto(j.item.id);
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось сохранить услугу");
      } finally {
        tg?.MainButton.hide();
      }
    };
  }


  // ===== Админ: добавить услугу =====
  function openAddServiceForm() {
    if (document.getElementById("overlay-add-service")) return;
    const overlay = document.createElement("div");
    overlay.id = "overlay-add-service";
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="overlay__inner">
        <div class="font-semibold mb-2">Новая услуга</div>
        <div class="grid gap-2">
          <input id="as_title" class="inp" placeholder="Название услуги"/>
          <input id="as_price" class="inp" placeholder="Цена от, ₽" type="number" min="0" step="1"/>
          <input id="as_duration" class="inp" placeholder="Время (например: 1–2 часа)"/>
          <textarea id="as_desc" class="inp" rows="3" placeholder="Краткое описание"></textarea>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button class="btn btn--pill btn-lg" id="as_save">Сохранить</button>
          <button class="btn btn--secondary btn--pill btn-lg overlay__close">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".overlay__close").onclick = () => overlay.remove();
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    overlay.querySelector("#as_save").onclick = async () => {
      const title     = overlay.querySelector("#as_title").value.trim();
      const price_from= Number(overlay.querySelector("#as_price").value);
      const duration  = overlay.querySelector("#as_duration").value.trim();
      const desc      = overlay.querySelector("#as_desc").value.trim();
      if (!title || !Number.isFinite(price_from) || price_from < 0) {
        return tg?.showAlert?.("Заполните название и корректную цену");
      }
      const payload = {
        category: state.selection.category.code,
        brand: state.selection.brand,
        model: state.selection.model,
        title, price_from, duration, desc
      };
      try {
        tg?.MainButton.setParams({ text: "Сохраняем…" }); tg?.MainButton.show(); tg?.MainButton.disable();
        const res = await fetch(`${BACKEND_URL}/services`, {
          method: "POST",
          headers: { "Content-Type":"application/json", "X-Telegram-Init-Data": tg?.initData || "" },
          body: JSON.stringify(payload)
        });
        const j = await res.json().catch(()=>null);
        if (!res.ok || !j?.ok) throw new Error(j?.error || "save failed");

        // добавим услугу локально и перерисуем список
        state.catalog.services = state.catalog.services || [];
        state.catalog.services.unshift(j.item);
        overlay.remove();
        renderServices();
        tg?.HapticFeedback.notificationOccurred("success");
        tg?.showAlert?.("Услуга создана ✅");
      } catch (e) {
        console.warn(e);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert?.("Не удалось создать услугу");
      } finally { tg?.MainButton.hide(); }
    };
  }


  // ===== Вопрос админу =====
  async function onAskSend() {
    const text = askText?.value.trim();
    if (!text) return tg?.showAlert?.("Введите вопрос") || alert("Введите вопрос");
    try {
      tg?.MainButton.setParams({ text: "Отправка вопроса…" });
      tg?.MainButton.show(); tg?.MainButton.disable();

      const res = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": tg?.initData || ""
        },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error("ask failed");
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

  // ===== Отправка заявки =====
  function validateForm() {
    const okName  = fName?.value.trim().length >= 2;
    const okPhone = /^[+0-9()\-\s]{6,}$/.test(fPhone?.value.trim() || "");
    const valid = okName && okPhone;

    if (!tg) sendBtn.disabled = !valid;
    if (tg) {
      tg.MainButton.setParams({ text: "Отправить заявку" });
      tg.MainButton[valid ? "show" : "hide"]();
    }
    return valid;
  }

  async function onSubmit() {
    if (!validateForm()) {
      if (tg?.showAlert) tg.showAlert("Заполните имя и телефон.");
      else alert("Заполните имя и телефон.");
      return;
    }

    const payload = {
      type: "lead",
      ts: Date.now(),
      category: state.selection.category?.title,
      brand: state.selection.brand,
      model: state.selection.model,
      service: state.selection.service?.title || null,
      price_from: state.selection.service?.price_from || state.selection.category?.from || null,
      name: fName.value.trim(),
      phone: fPhone.value.trim(),
      city: fCity?.value.trim() || "",
      comment: fComment?.value.trim() || ""
    };

    try {
      tg?.MainButton.setParams({ text: "Отправляем…" }); tg?.MainButton.show(); tg?.MainButton.disable();

      if (tg?.sendData) {
        tg.sendData(JSON.stringify(payload)); // бот примет web_app_data
      } else {
        await fetch(`${BACKEND_URL}/web-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      tg?.HapticFeedback.notificationOccurred("success");
      tg?.showAlert?.("Заявка отправлена ✅") || alert("Заявка отправлена ✅");
      [fName, fPhone, fCity, fComment].forEach(el => el && (el.value = ""));
      showScreen("categories");
    } catch (e) {
      console.warn(e);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert?.("Не удалось отправить") || alert("Не удалось отправить");
    } finally {
      tg?.MainButton.hide();
    }
  }


  // ===== Utils =====
  function formatPrice(n){ return new Intl.NumberFormat("ru-RU").format(n) + " ₽"; }

  function applyTheme(tp){
    const root = document.documentElement;
    if (tp?.bg_color)   root.style.setProperty("--bg", tp.bg_color);
    if (tp?.text_color) root.style.setProperty("--fg", tp.text_color);
    if (tp?.hint_color) root.style.setProperty("--muted", tp.hint_color);
    if (tp?.link_color) root.style.setProperty("--accent", tp.link_color);
    if (tp?.section_separator_color) root.style.setProperty("--border", tp.section_separator_color);
  }
})();
