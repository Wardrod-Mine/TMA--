import { Telegraf } from "telegraf";

const BOT_TOKEN = "8310422634:AAHACKWJd-NWODxeUPwd1o0IHrnnZpOgFv4";                   // токен бота
const ADMIN_CHAT_IDS = -4754564050
  .split(",").map(s => s.trim()).filter(Boolean);

const bot = new Telegraf(BOT_TOKEN);

// Команда для получения chat_id (в ЛС и в группе)
bot.command("id", (ctx) => ctx.reply(`chat_id: ${ctx.chat.id}`));

bot.on("message", async (ctx) => {
  const data = ctx.message?.web_app_data?.data;
  if (!data) return;

  let p;
  try { p = JSON.parse(data); } catch { return; }

  const from = ctx.from;
  const text = formatLead(p, from);

  // отправляем всем администраторам/в группу (бот должен быть добавлен в группу!)
  for (const chatId of ADMIN_CHAT_IDS) {
    await ctx.telegram.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
  }

  // подтверждение пользователю
  await ctx.reply("✅ Заявка принята, скоро свяжемся!");
});

function esc(s=""){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function formatLead(p, from) {
  return [
    `<b>Новая заявка</b>`,
    `Категория: <b>${esc(p.category)}</b>`,
    `Марка/модель: <b>${esc(p.brand)} ${esc(p.model)}</b>`,
    p.service ? `Услуга: <b>${esc(p.service)}</b>` : null,
    p.price_from ? `От: <b>${p.price_from} ₽</b>` : null,
    `Имя: <b>${esc(p.name)}</b>`,
    `Телефон: <b>${esc(p.phone)}</b>`,
    p.city ? `Город: <b>${esc(p.city)}</b>` : null,
    p.comment ? `Комментарий: ${esc(p.comment)}` : null,
    ``,
    `От пользователя: <a href="tg://user?id=${from.id}">${esc(from.username ? '@'+from.username : from.first_name || 'user')}</a>`,
    `Время: ${new Date(p.ts || Date.now()).toLocaleString("ru-RU")}`
  ].filter(Boolean).join('\n');
}

bot.launch();
