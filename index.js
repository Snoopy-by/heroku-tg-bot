const TelegramBot = require("node-telegram-bot-api")
const port = process.env.PORT || 5000
const host = "0.0.0.0"
const externalUrl = process.env.CUSTOM_ENV_VARIABLE || "https://expense-tlg-bot.herokuapp.com/"
const token = '1345286541:AAHQeS4U2uKlhbK9vaZjvBgcrIErENIEskY'
var loginSF = "https://task3@scl.com/"
var passwordSF = "offmin291"
var jsforce = require("jsforce")
var conn = new jsforce.Connection()

var previousMessage;
var changeMessageId;
var contactId = "";
var chatId;
var amount;
var description;
var dayToInsert;
var login;

var todayDay = new Date();
var month = todayDay.getMonth();
var monthName;
var year = todayDay.getFullYear();

var bot = new TelegramBot(token, { webHook: { port : port, host : host } });
bot.setWebHook(externalUrl + ':5000/bot' + token);

bot.on("message", msg => {
    if (msg.text == "/start") {
        previousMessage = "";
        conn.login(loginSF, passwordSF, function(err, res) {
            if (err) {
                bot.sendMessage(msg.chat.id, "Ошибка авторизации в Salesforce");
                return console.error(err);
            } else {
                bot
                    .sendMessage(msg.chat.id, "Введите логин: ")
                    .then((previousMessage = "login"));
            }
        })
    } else if (previousMessage == "login") {
        login = msg.text;
        bot
            .sendMessage(msg.chat.id, "Введите пароль: ")
            .then((previousMessage = "password"));
    } else if (previousMessage == "password") {
        var password = msg.text;
        conn.query(
            "SELECT Id, Name, Email FROM Contact " +
            "WHERE Email = '" +
            login +
            "' " +
            "AND Password__c = '" +
            password +
            "' " +
            "LIMIT 1",
            function(err, res) {
                if (err) {
                    return console.error("err", err);
                }
                console.log(res);
                if (res.records.length == 0) {
                    bot
                        .sendMessage(msg.chat.id, "Неверный логин или пароль!")
                        .then((previousMessage = ""));
                    bot
                        .sendMessage(msg.chat.id, "Введите логин: ")
                        .then((previousMessage = "login"));
                }

                contactId = res.records[0].Id;
                chatId = msg.chat.id;
                bot
                    .sendMessage(chatId, "Авторизация прошла успешно!")
                    .then(mainMenu(chatId));
            }
        );
    } else if (previousMessage == "amount") {
        amount = msg.text;
        const amountRegex = /^-?\d+\.?\d*$/;
        if(amountRegex.test(amount) &&  amount > 0){
            bot
                .sendMessage(msg.chat.id, "Введите описание: ")
                .then((previousMessage = "description"));
        } else{
            bot.sendMessage(msg.chat.id, "Неверный ввод. Введите сумму: ").then((previousMessage = "amount"));
        }
    } else if (previousMessage == "description") {
        description = msg.text;
        cardDate = dayToInsert;
        conn.sobject("Expense_Card__c").create(
            {
                CardKeeper__c: contactId,
                CardDate__c: cardDate,
                Amount__c: amount,
                Description__c: description
            },
            function(err, ret) {
                if (err || !ret.success) {
                    return console.error(err, ret);
                }
                bot
                    .sendMessage(msg.chat.id, "Карточка успешно добавлена! ").then(previousMessage = '')
                    .then(mainMenu(chatId));
            }
        );
    } else if(msg.text == "/exit"){
        console.log(previousMessage);
        previousMessage = "";
        bot.sendMessage(msg.chat.id, "Вы вышли из аккаунта.")
            .then((previousMessage = "login"));
    }
});

bot.on("callback_query", callbackQuery => {
    var answer = callbackQuery.data;
    if (answer == "new-card") {
        const opts = {
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: "Сегодня", callback_data: "today" },
                        { text: "Календарь", callback_data: "calendar" },
                        { text: "Отмена", callback_data: "cancel" }
                    ]
                ]
            })
        };
        bot.sendMessage(chatId, "На какой день желаете создать карточку?", opts);
    } else if (answer == "balance") {
        getBalance(chatId);
    } else if (answer == "today") {
        previousMessage = "today";
        dayToInsert = todayDay;
        insertCard(todayDay, chatId);
    } else if (answer == "calendar") {
        changeMonthName();
        sendCalendar(chatId);
    } else if (answer == "cancel") {
        mainMenu(chatId);
    } else if (answer == "<") {
        changeMessageId = callbackQuery.message.message_id;
        previousMonth();
    } else if (answer == ">") {
        changeMessageId = callbackQuery.message.message_id;
        nextMonth();
    } else if (answer >= 1 && answer <= 31) {
        getDate(answer);
    }
});

function mainMenu(chatId) {
    const opts = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    { text: "Текущий баланс", callback_data: "balance" },
                    { text: "Создать карточку", callback_data: "new-card" }
                ]
            ]
        })
    };
    bot.sendMessage(chatId, "Выберете действие: ", opts).then(previousMessage = '');
}

function getBalance(chatId) {
    conn.query(
        "SELECT Reminder__c FROM Monthly_Expense__c " +
        "WHERE Keeper__c = '" +
        contactId +
        "'",
        function(err, res) {
            if (err) {
                bot.sendMessage(msg.chat.id, "Query error ");
                return console.error("err", err);
            }
            var balance = 0;
            for (var i = 0; i < res.records.length; i++) {
                balance += res.records[i].Reminder__c;
            }
            balance = (Math.round(balance * 100) / 100).toFixed(2);
            bot.sendMessage(chatId, "Ваш баланс: " + balance + "$").then(previousMessage = '');
        }
    );
}

function insertCard(cardDate, chatId) {
    bot.sendMessage(chatId, "Введите сумму: ").then((previousMessage = "amount"));
}

function changeMonthName() {
    const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sept",
        "Oct",
        "Nov",
        "Dec"
    ];
    monthName = monthNames[month];
}

function sendCalendar(chatId) {
    var inlineCalendar = showCalendar();
    const opts = {
        reply_markup: JSON.stringify({
            inline_keyboard: inlineCalendar
        })
    };
    bot.sendMessage(chatId, "Выберете дату: ", opts).then(previousMessage = '');
}

function showCalendar() {
    var numOfdays = getDays();
    var inlineCalendar = [];

    var topRow = [];

    var buttonLeft = new Object();
    buttonLeft.text = "<";
    buttonLeft.callback_data = "<";
    topRow.push(buttonLeft);

    var buttonYear = new Object();
    buttonYear.text = monthName + " " + year;
    buttonYear.callback_data = year;
    topRow.push(buttonYear);

    var buttonRight = new Object();
    buttonRight.text = ">";
    buttonRight.callback_data = ">";
    topRow.push(buttonRight);

    inlineCalendar.push(topRow);

    var row = [];
    for (var i = 1; i <= numOfdays; i++) {
        if (i % 7 == 0) {
            inlineCalendar.push(row);
            row = [];
        }

        var button = new Object();
        button.text = i.toString();
        button.callback_data = i;
        row.push(button);
    }
    inlineCalendar.push(row);
    return inlineCalendar;
}

function getDays() {
    var numberOfMonths = 0;

    if (month == 3 || month == 5 || month == 8 || month == 10) {
        numberOfMonths = 30;
    } else if (month == 1) {
        numberOfMonths = 28;
    } else {
        numberOfMonths = 31;
    }

    return numberOfMonths;
}

function previousMonth() {
    if (month == 0) {
        month = 11;
        year -= 1;
    } else {
        month -= 1;
    }
    changeMonthName();
    changeCalendar();
}

function changeCalendar() {
    var inlineCalendar = showCalendar();

    const opts = {
        chat_id: chatId,
        message_id: changeMessageId
    };

    bot.editMessageReplyMarkup(
        {
            inline_keyboard: inlineCalendar
        },
        opts
    );
}

function nextMonth() {
    if (month == 11) {
        month = 0;
        year += 1;
    } else {
        month += 1;
    }
    changeMonthName();
    changeCalendar();
}

function getDate(answer) {
    var newDate = new Date(year, month, answer, 3);
    dayToInsert = newDate;
    insertCard(newDate, chatId);
}
