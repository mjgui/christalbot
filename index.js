// Dependencies
require('dotenv').config({ path: '.env.local' });
const { Telegraf } = require('telegraf');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const moment = require('moment');
moment().format();

// Telegram Admin config
const {ADMIN_BOT_TOKEN, CHRISTAL_BOT_TOKEN, SERVER_URL} = process.env;
const ADMIN_API = `https://api.telegram.org/bot${ADMIN_BOT_TOKEN}`;
const ADMIN_URI = `/webhook/${ADMIN_BOT_TOKEN}`;
const ADMIN_WEBHOOK_URL = SERVER_URL + ADMIN_URI;

// Christal Bot config
const CHRISTAL_API = `https://api.telegram.org/bot${CHRISTAL_BOT_TOKEN}`;
const CHRISTAL_URI = `/webhook/${CHRISTAL_BOT_TOKEN}`;
const CHRISTAL_WEBHOOK_URL = SERVER_URL + CHRISTAL_URI;
const bot = new Telegraf(CHRISTAL_BOT_TOKEN); 

// Database
const { db } = require('./firebase.js') 

// Express
const app = express();
app.use(bodyParser.json());

// Set webhooks
const init = async () => {
  const res1 = await axios.post(`${ADMIN_API}/setWebhook`, {
    url: ADMIN_WEBHOOK_URL,
  })
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.log(err);
  });
}

// Receive admin updates
app.post(ADMIN_URI, async (req, res) => {
  console.log(req.body);
  
  const chatId = req.body.message.chat.id
  const msg = req.body.message.text
  const command = msg.replace(/ .*/,'');

  switch (command.toLowerCase()) {
    case '/createevent':
      createEvent(chatId, msg);
      break;
    case '/help':
      adminListCommands(chatId);
      break;
    case '/start':
      break;
    default:
      adminNotValidCommand(chatId);
      break;
  }

  return res.send();
})

// Receive christal updates
bot.command('start', ctx => {
  bot.telegram.sendMessage(ctx.chat.id, 'Main Menu',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'View All Events', callback_data: 'events' }
          ],
          [
            {text: 'Sign Up', callback_data: 'register'}
          ]
        ]
      }    
    }
  )
});

// View all events handler
bot.action('events', async ctx => {
  ctx.deleteMessage();

  const eventCollectionRef = db.collection('events');
  const allEvents = await eventCollectionRef.get().then((querySnapshot) => {
    const tempDoc = querySnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    return tempDoc;
  })

  let msg = "Events List\n";
  allEvents.forEach(evt => {
    let timeslots = "";
    evt.timeslots.forEach(timeslot => {
      timeslots += (timeslot + "\n");
    })
    const str = `\n${evt.id}\nDate: ${evt.date}\nStart Time: ${evt.start_time}\nTimeslots:\n${timeslots}`
    msg += str;
  });

  bot.telegram.sendMessage(ctx.chat.id, msg,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Back to menu', callback_data: 'menu'}
          ]
        ]
      }    
    })
});

// Main menu handler
bot.action('menu', ctx => {
  ctx.deleteMessage();

  bot.telegram.sendMessage(ctx.chat.id, 'Main Menu',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'View All Events', callback_data: 'events' }
          ],
          [
            {text: 'Sign Up', callback_data: 'register'}
          ]
        ]
      }    
    }
  )
});

// Sign up for a ticket handler
bot.action('register', async ctx => {
  ctx.deleteMessage();

  const eventCollectionRef = db.collection('events');
  const allEvents = await eventCollectionRef.get().then((querySnapshot) => {
    const tempDoc = querySnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    return tempDoc;
  })

  allEvents.forEach(evt => {
    bot.action(evt.id, ctx => {
      ctx.deleteMessage();
      const btns = [];
      
      evt.timeslots.forEach((timeslot, key) => {

        bot.action(evt.id.toString() + key.toString(), async ctx => {
          const usersCollectionRef = db.collection('users').doc(ctx.chat.id.toString());
          const user = await usersCollectionRef.get();
          let hasEventTicket = false;
          if (user.exists) {
            const userData = user.data();
            userData.tickets.forEach((ticket) => {
              if (ticket.event_name == evt.id) {
                hasEventTicket = true;
              }
            })
          }
          
          if (hasEventTicket) {
            bot.telegram.sendMessage(ctx.chat.id, 'Sorry, you already have a ticket to the event.');
          } else if (evt.timeslot_availability[key] <= 0) {
            bot.telegram.sendMessage(ctx.chat.id, 'Sorry, there are no more tickets left for that timeslot.');
          } else {
            if (user.exists) {
              const tickets = user.data().tickets;
              const newTicket = { event_name: evt.id, timeslot: timeslot }
              tickets.push(newTicket);
              const res = await usersCollectionRef.set({
                tickets: tickets,
              })
            } else {
              const res = await usersCollectionRef.set({
                tickets: [
                  {event_name: evt.id, timeslot: timeslot}
                ]
              })
            }

            evt.timeslot_availability[key]--
            const res = eventCollectionRef.doc(evt.id.toString()).set(evt)
            bot.telegram.sendMessage(ctx.chat.id, `Yay! You successfully registered for a slot at ${timeslot}`);
          }
          
        })
         
        const btn = [
          { text: timeslot, callback_data: evt.id.toString() + key.toString() }
        ]
        btns.push(btn);
      })
      
      bot.telegram.sendMessage(ctx.chat.id, 'Please pick a timeslot.',
      {
        reply_markup: {
          inline_keyboard: btns
        }
      })
    })
  })

  const btns = [];
  allEvents.forEach(evt => {
    const btn = [{
      text: evt.id,
      callback_data: evt.id,
    }]
    btns.push(btn);
  })

  bot.telegram.sendMessage(ctx.chat.id, 'Please choose an event that you would like to sign up for.',
    {
      reply_markup: {
        inline_keyboard: btns
      }
    }
  )
});

// View Tickets
bot.command('ticket', async ctx => {
  const usersCollectionRef = db.collection('users').doc(ctx.chat.id.toString());
  const user = await usersCollectionRef.get();

  if (user.exists) {
    const userData = user.data();
    let msg = "Tickets\n";
    userData.tickets.forEach((ticket) => {
      msg += ("\n" + ticket.event_name);
      msg += (" - " + ticket.timeslot + "\n");
    })
    bot.telegram.sendMessage(ctx.chat.id, msg);
  } else {
    bot.telegram.sendMessage(ctx.chat.id, "Looks like you haven't registered for a ticket yet.");
  }
});

// Create Event
// usage: /createevent eventname, date(dd/mm/yyyy), starttime(24hrs format hh:mm), number_of_timeslots, timeslot_duration(mins), timeslot_pax_limit, organizer telehandle
const createEvent = async (chatId, msg) => {
  
  const data = msg.split(" ");
  data.shift();
  const event = {};

  if (data.length != 7 || data[1].length != 10 || data[2].length != 5 || (data[3].match(/^[0-9]+$/) === null) || (data[4].match(/^[0-9]+$/) === null) || (data[5].match(/^[0-9]+$/) === null) ) {
    await axios.post(`${ADMIN_API}/sendMessage`, {
      chat_id: chatId,
      text: "Wrong format😮\n\nUsage: /createevent event_name, date (dd/mm/yyyy), start_time (24hrs format hh:mm), number_of_timeslots, timeslot_duration(mins), timeslot_pax_limit, organizer_telehandle\n\nExample: /createevent tCarnival 09/11/2022 18:00 6 15 20 @christalofthelow",
    })
  } else {
    const fields = ["eventName", "date", "startTime", "numOfTimeslots", "timeslotDuration", "timeslotPaxLimit", "organizer"];
    for (let i = 0; i < fields.length; i++) {
      event[fields[i]] = data[i];
    }
    
    // Creating timeslots
    const [day, month, year] = event.date.split('/');
    const [hours, mins] = event.startTime.split(':');
    const m = moment(`${year}-${month}-${day} ${hours}:${mins}`);
    const timeslots = [];
    let currTimeslot = m;
    for (let i = 0; i < event.numOfTimeslots; i++) {
      const mins = currTimeslot.minutes() === 0 ? "00" : currTimeslot.minutes();
      timeslots[i] = currTimeslot.hours() + ":" + mins;
      currTimeslot = currTimeslot.add(event.timeslotDuration, 'm');
    }
    event.timeslots = timeslots;

    // Creating availability
    const timeslotAvailability = [];
    for (let i = 0; i < event.numOfTimeslots; i++) {
      timeslotAvailability[i] = event.timeslotPaxLimit;
    }
    event.timeslotAvailability = timeslotAvailability;

    // Writing to Firestore
    const eventCollection = db.collection('events').doc(event.eventName);
    const res = await eventCollection.set({
      "event_name": event.eventName,
      "date": event.date,
      "start_time": event.startTime,
      "num_of_timeslots": event.numOfTimeslots,
      "timeslot_duration": event.timeslotDuration,
      "timeslot_pax_limit": event.timeslotPaxLimit,
      "timeslots": event.timeslots,
      "timeslot_availability": event.timeslotAvailability,
      "organizer": event.organizer,
    })
  
    await axios.post(`${ADMIN_API}/sendMessage`, {
      chat_id: chatId,
      text: "🚀Success",
    })
    .then((res) => {
      console.log(res.data);
    })
    .catch((err) => {
      console.log(err);
    });
  }
}

// Wrong user input (admin)
const adminNotValidCommand = async (chatId) => {
  await axios.post(`${ADMIN_API}/sendMessage`, {
    chat_id: chatId,
    text: "Please enter a valid command. Enter /help to view full list of commands.",
  })
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.log(err);
  });
}

// Admin List Commands
const adminListCommands = async (chatId) => {
  await axios.post(`${ADMIN_API}/sendMessage`, {
    chat_id: chatId,
    text: "/start - Description\n/help - View all commands\n/viewevents - View all events\n\n/createevent - Create a new event\nUsage: /createevent event_name, date(dd/mm/yyyy), start_time(24hrs format hh:mm), number_of_timeslots, timeslot_duration(mins), timeslot_pax_limit, organizer_telehandle\n\n/deleteevent - Delete an event\nUsage: /deleteevent event_name",
  })
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.log(err);
  });
}

// Initialize on port
app.listen(process.env.PORT || 5000, async () => {
  console.log('🏃‍♂️ app running on port ', process.env.PORT || 5000);
  await init()
})

bot.launch();
