const Telegraf = require('telegraf');
require('dotenv').config();
const express = require('express');
const expressApp = express();
const TelegramBot = require("node-telegram-bot-api")
const PORT = process.env.PORT || 500;
const host = "0.0.0.0";
const externalUrl = process.env.CUSTOM_ENV_VARIABLE || "https://expense-tlg-bot.herokuapp.com/"
const token = process.env.TOKEN;
var loginSF = process.env.SF_USERNAME;
var passwordSF = process.env.SF_PASSWORD;

const bot = new Telegraf(token);
/*bot.telegram.deleteWebhook();
bot.telegram.setWebhook(`${URL}/bot${API_TOKEN}`);*/
expressApp.use(bot.webhookCallback(`/bot${token}`));

var jsforce = require("jsforce");

var Markup = require('telegraf/markup');
const Calendar = require('telegraf-calendar-telegram');
const WizardScene = require("telegraf/scenes/wizard");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");
const Composer = require('telegraf/composer');

const calendar = new Calendar(bot, {
    startWeekDay: 0,
    weekDayNames: ["S", "M", "T", "W", "T", "F", "S"],
    monthNames: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ],
    minDate: null,
    maxDate: null
});

var conn = new jsforce.Connection({
    LoginUrl: 'https://login.salesforce.com'
});

conn.login(loginSF,passwordSF, function(err, userInfo) {
    if (err) { return console.error(err);
        return ctx.reply(err);}
    // Now you can get the access token and instance URL information.
    // Save them to establish connection next time.
    console.log(conn.accessToken);
    console.log(conn.instanceUrl);
    // logged in user property
    console.log("User ID: " + userInfo.id);
    console.log("Org ID: " + userInfo.organizationId);
    // ...
});
var officeId = '';
var selecteddate = new Date();

calendar.setDateListener((ctx, date) => {
    selecteddate = date;
    ctx.reply("Введите описание");
});

const stepHandler = new Composer();
stepHandler.action("calendar", ctx => {

    const today = new Date();
    const minDate = new Date();
    minDate.setMonth(today.getMonth() - 2);
    const maxDate = new Date();
    maxDate.setMonth(today.getMonth() + 2);
    ctx.reply("Выберите дату", calendar.setMinDate(minDate).setMaxDate(maxDate).getCalendar());
    return ctx.wizard.next();
});
stepHandler.action("today", ctx => {
    ctx.wizard.state.datacard = new Date();
    ctx.reply("Введите описание: ");
    return ctx.wizard.next();
});
stepHandler.action("backFromscene", ctx => {
    ctx.reply(
        "Выберите действие",
        Markup.inlineKeyboard([
            Markup.callbackButton('Текущий баланс', 'balance'),
            Markup.callbackButton('Создать карточку', "create")
        ]).extra()
    );
    ctx.scene.leave();
});

const authentication = new WizardScene(
    "authentication",
    ctx => {
        ctx.reply("Введите логин: ");
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.login = ctx.message.text;
        ctx.reply("Введите пароль: ");
        // Go to the following scene
        return ctx.wizard.next();
    },
    ctx => {
        ctx.wizard.state.password = ctx.message.text;
        conn.sobject("Contact")
            .find({
                    'Email': ctx.wizard.state.login,
                    'Password__c': ctx.wizard.state.password
                },
                {
                    Id: 1,
                    Name: 1,
                    CreatedDate: 1,
                    Admin__c: 1
                })
            .execute(function (err, records) {
                if (err) {
                    return console.error(err);
                }
                if (records.length == 0)
                    return ctx.reply('Вход не выполнен! Проверьте логин или пароль!',
                        Markup.inlineKeyboard([
                            Markup.callbackButton('Повтор', 'replay')
                        ]).extra());
                if(records.length > 0 && records[0].Admin__c == true)
                    return ctx.reply('Вход выполнен в качестве администратора. Пожалуйста, для создания карточки и просмотра баланса офиса зайдите под учетной записью работника офиса.',
                        Markup.inlineKeyboard([
                            Markup.callbackButton('Повтор', 'replay')
                        ]).extra());

                else {
                    officeId = records[0].Id;
                    ctx.reply('Авторизация прошла успешно!',
                        Markup.inlineKeyboard([
                            Markup.callbackButton('Текущий баланс', 'balance'),
                            Markup.callbackButton('Создать карточку', "create")
                        ]).extra()
                    );
                }

            });
        return ctx.scene.leave();
    }
);

// Go back to menu after action
bot.action("back", ctx => {
    ctx.reply(
        "Выберите действие",
        Markup.inlineKeyboard([
            Markup.callbackButton('Текущий баланс', 'balance'),
            Markup.callbackButton('Создать карточку', "create")
        ]).extra()
    );
});

const expenseCreater = new WizardScene(
    "expenseCreater",
    stepHandler.use((ctx) => {
        ctx.reply('На какой день желаете создать карточку? ',
            Markup.inlineKeyboard([
                Markup.callbackButton('Сегодня', 'today'),
                Markup.callbackButton('Календарь', 'calendar'),
                Markup.callbackButton('Отмена', 'backFromscene')
            ]).extra()
        );
    }),
    stepHandler,
    ctx => {
        ctx.wizard.state.datacard = selecteddate;
        ctx.wizard.state.description = ctx.message.text;
        ctx.reply("Введите стоимость: ");
        return ctx.wizard.next();
    },
    ctx => {
        conn.sobject("Expense_Card__c").create(
            { Description__c : ctx.wizard.state.description,
                Amount__c: ctx.message.text,
                CardDate__c: ctx.wizard.state.datacard,
                CardKeeper__c: officeId}
            ,
            function(err, rets) {
                if (err) { return console.error(err); }
                for (var i=0; i < rets.length; i++) {
                    if (rets[i].success) {
                        console.log("Created record id : " + rets[i].id);
                    }
                }
                // ...
            });
        ctx.reply("Карточка успешно создана",
            Markup.inlineKeyboard([
                Markup.callbackButton('Выход', 'back')
            ]).extra())
        return ctx.scene.leave();
    }
);

const stage = new Stage([authentication, expenseCreater]);
bot.use(session());
bot.use(stage.middleware());
bot.action("create", Stage.enter("expenseCreater"));
bot.start(Stage.enter("authentication"));
bot.action("replay", Stage.enter("authentication"));


bot.action('balance', ctx => {
    const chatId = ctx.chat.id;
    var sum = 0;
    conn.sobject("Monthly_Expense__c")
        .find( { 'Keeper__c': officeId},
            { Id: 1,
                Reminder__c: 1 })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            else {
                for (var i = 0; i < records.length; i++) {
                    sum += records[i].Reminder__c;
                }
                return ctx.reply( 'Текущий баланс:' + sum + '$',
                    Markup.inlineKeyboard([
                        Markup.callbackButton('Создать карточку', "create")
                    ]).extra());
            }
        });

});

bot.catch((err) => {
    console.log("Error in bot:", err);
});
bot.launch();
expressApp.get('/', (req, res) => {
    res.send('Telegram bot is active');
});
expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});








