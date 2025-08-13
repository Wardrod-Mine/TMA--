import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");

const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
if (!ADMIN_CHAT_IDS.length) console.warn("ADMIN_CHAT_IDS is empty – admin notifications disabled");

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9000 });

bot.start(ctx => ctx.reply("Бот запущен. Используй кнопку WebApp или пришли /id, чтобы узнать chat_id."));
bot.command("id", ctx => ctx.reply(`chat_id: ${ctx.chat.id}`));

bot.on("message", async (ctx) => {
  const data = ctx.message?.web_app_data?.data;
  if (!data) return; // игнорим прочие сообщения

  let p; try { p = JSON.parse(data); } catch { return; }

  const text = formatLead(p, ctx.from);

  if (ADMIN_CHAT_IDS.length) {
    await Promise.all(ADMIN_CHAT_IDS.map(chatId =>
      ctx.telegram.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true })
    ));
  }
  await ctx.reply("✅ Заявка принята, скоро свяжемся!");
});

function esc(s=""){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function formatLead(p, from){
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
    `От: <a href="tg://user?id=${from.id}">${esc(from.username ? '@'+from.username : from.first_name || 'user')}</a>`,
    `Время: ${new Date(p.ts || Date.now()).toLocaleString("ru-RU")}`
  ].filter(Boolean).join('\n');
}

bot.launch().then(()=>console.log("Bot launched"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
