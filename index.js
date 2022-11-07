// Dependencies
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const moment = require('moment');
moment().format(); 

// Telegram Admin config
const {ADMIN_BOT_TOKEN, SERVER_URL} = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${ADMIN_BOT_TOKEN}`;
const URI = `/webhook/${ADMIN_BOT_TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

// Database
const { db } = require('./firebase.js') 

// Express
const app = express();
app.use(bodyParser.json());

// Set webhook
const init = async () => {
  const res = await axios.post(`${TELEGRAM_API}/setWebhook`, {
    url: WEBHOOK_URL,
  })
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.log(err);
  });
}

// Receive updates
app.post(URI, async (req, res) => {
  console.log(req.body);
  
  const chatId = req.body.message.chat.id
  const msg = req.body.message.text
  const command = msg.replace(/ .*/,'');

  switch (command.toLowerCase()) {
    case '/createevent':
        createEvent(chatId, msg);
        break;
    case '/help':
        listCommands(chatId);
        break;
    case '/start':
        break;
    default:
        notValidCommand(chatId);
        break;
  }

  // await axios.post(`${TELEGRAM_API}/sendMessage`, {
  //   chat_id: chatId,
  //   text: text,
  // })
  return res.send();
})

// Create Event
// usage: /createevent eventname, date(dd/mm/yyyy), starttime(24hrs format hh:mm), number_of_timeslots, timeslot_duration(mins), timeslot_pax_limit, organizer telehandle
const createEvent = async (chatId, msg) => {
  
  const data = msg.split(" ");
  data.shift();
  const event = {};

  console.log(data);

  if (data.length != 7 || data[1].length != 10 || data[2].length != 5 || (data[3].match(/^[0-9]+$/) === null) || (data[4].match(/^[0-9]+$/) === null) || (data[5].match(/^[0-9]+$/) === null) ) {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
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
      timeslots[i] = currTimeslot.toString();
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
  
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
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

// Wrong user input
const notValidCommand = async (chatId) => {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
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

// List Commands
const listCommands = async (chatId) => {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
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
