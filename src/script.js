// ====== Telegram Mini App — базовый стартовый скрипт ======
(() => {
  const isTelegramEnv = typeof window.Telegram !== "undefined" && !!window.Telegram.WebApp;
  const tg = isTelegramEnv ? window.Telegram.WebApp : null;

  // UI-элементы страницы
  const closeBtn = document.getElementById("closeApp");
  const appRoot = document.getElementById("app");

  // Локальная проверка (запуск вне Telegram — удобно для GitHub Pages)
  if (!isTelegramEnv) {
    console.warn("Запущено вне Telegram. Некоторые функции (MainButton, theme) работать не будут.");
    // Имитация пользователя для разработки
    appRoot.insertAdjacentHTML("beforeend", `
      <div class="mt-4 text-center text-sm opacity-80">
        <div>Dev mode: Telegram.WebApp не найден.</div>
        <div>Открой через кнопку в боте, чтобы проверить интеграцию.</div>
      </div>
    `);
  }

  // ===== Инициализация WebApp =====
  function initWebApp() {
    // Растянуть мини-приложение
    tg.expand();

    // Включить авто-тему Telegram
    tg.enableClosingConfirmation(); // защитит от случайного закрытия при незавершённых действиях

    // Синхронизируем цвета с темой Telegram
    applyThemeFromTelegram();

    // Подписки на события
    tg.onEvent("themeChanged", applyThemeFromTelegram);
    tg.onEvent("viewportChanged", ({ isStateStable }) => {
      // Можно реагировать на изменение высоты, если понадобится
      // console.log("viewportChanged", isStateStable, tg.viewportHeight, tg.viewportStableHeight);
    });

    // Настраиваем MainButton (пока «пустое» действие)
    tg.MainButton.setParams({
      text: "Готово",
      is_visible: true,
      is_active: true
    });

    // Клик по MainButton — отправим заготовленный payload боту
    tg.onEvent("mainButtonClicked", () => {
      // Отправляем данные в бота (бот получит их в update.callback_query.web_app_data)
      const payload = {
        action: "complete",
        ts: Date.now()
      };
      tg.HapticFeedback.impactOccurred("light");
      tg.sendData(JSON.stringify(payload));
    });

    // Приветствие с именем пользователя (если есть)
    const username = tg.initDataUnsafe?.user?.username || tg.initDataUnsafe?.user?.first_name;
    if (username) {
      appRoot.insertAdjacentHTML("beforeend", `
        <p class="mt-4 text-center text-sm">Пользователь: <b>@${username}</b></p>
      `);
    }
  }

  // ===== Синхронизация темы (Telegram -> CSS переменные) =====
  function applyThemeFromTelegram() {
    const theme = tg?.themeParams || {};
    // Пробрасываем ключевые цвета в :root
    const root = document.documentElement;
    if (theme.bg_color)         root.style.setProperty("--bg", theme.bg_color);
    if (theme.text_color)       root.style.setProperty("--fg", theme.text_color);
    if (theme.hint_color)       root.style.setProperty("--muted", theme.hint_color);
    if (theme.link_color)       root.style.setProperty("--accent", theme.link_color);
    if (theme.section_separator_color) root.style.setProperty("--border", theme.section_separator_color);
    // Обновим цвет адресной строки на мобилках
    try {
      const m = document.querySelector('meta[name="theme-color"]') || (() => {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
        return meta;
      })();
      m.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
    } catch {}
  }

  // ===== Кнопка Закрыть (в футере) =====
  closeBtn?.addEventListener("click", () => {
    if (tg) tg.close();
    else window.close(); // на случай запуска вне Telegram
  });

  // Старт
  if (tg) initWebApp();
})();
