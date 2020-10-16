const TelegramBot = require("node-telegram-bot-api")
require('http').createServer().listen(process.env.PORT || 5000).on('request', function(req, res){
    res.end('')
})
const TOKEN = '1345286541:AAHQeS4U2uKlhbK9vaZjvBgcrIErENIEskY'

const bot = new TelegramBot(TOKEN,{polling: true})
bot.on('message', msg =>{
    bot.sendMessage(msg.chat.id, 'Hello from HEROKU!')
})
