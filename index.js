const TelegramBot = require("node-telegram-bot-api");
const TOKEN = '1345286541:AAHQeS4U2uKlhbK9vaZjvBgcrIErENIEskY'
TelegramBot = new TelegramBot(TOKEN,{polling: true});
bot.on('message', msg =>{
    bot.sendMessage(msg.chat.id, 'Hello from HEROKU!')
})