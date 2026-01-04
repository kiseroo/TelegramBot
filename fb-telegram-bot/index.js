require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// 1. Facebook Webhook Verification
// This is called by Facebook when you first set up the webhook to verify your server.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400); // Bad Request
  }
});

// 2. Handle Incoming Messages
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Check if this is an event from a page subscription
  if (body.object === 'page') {
    // Iterate over each entry - there may be multiple if batched
    for (const entry of body.entry) {
      // Get the webhook event. entry.messaging is an array, but usually contains one event
      const webhook_event = entry.messaging ? entry.messaging[0] : null;

      if (webhook_event && webhook_event.message) {
        await handleMessage(webhook_event.sender.id, webhook_event.message);
      }
    }

    // Return a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

async function handleMessage(senderPsid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    // You can handle text messages here if you want
    console.log(`Received text: "${received_message.text}" from ${senderPsid}`);
  }

  // Check if the message contains attachments
  if (received_message.attachments) {
    for (const attachment of received_message.attachments) {
      if (attachment.type === 'image') {
        const imageUrl = attachment.payload.url;
        console.log(`Received image from ${senderPsid}: ${imageUrl}`);
        
        // Send to Telegram
        await sendToTelegram(senderPsid, imageUrl);
      }
    }
  }
}

async function sendToTelegram(senderId, imageUrl) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!telegramBotToken || !chatId) {
    console.error("Telegram credentials not set.");
    return;
  }

  const caption = `New photo received on Facebook Page!\nSender ID: ${senderId}`;
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      photo: imageUrl,
      caption: caption
    });
    console.log('Successfully sent photo to Telegram');
  } catch (error) {
    console.error('Error sending to Telegram:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
