require('dotenv').config({ path: '.env.local' });

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const {TELEGRAM_BOT_TOKEN, SERVER_URL} = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const URI = `/webhook/${TELEGRAM_BOT_TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

const app = express();
app.use(bodyParser.json());

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

app.post(URI, async (req, res) => {
  console.log(req.body);
  const chatId = req.body.message.chat.id
  const text = req.body.message.text

  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: text,
  })
  return res.send();
})

app.listen(process.env.PORT || 5000, async () => {
  console.log('🏃‍♂️ app running on port ', process.env.PORT || 5000);
  await init()
})
