require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Store pending orders in memory (in production, use a database)
const pendingOrders = new Map();

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Add a home route so you can see the bot is alive in the browser
app.get('/', (req, res) => {
  res.send('✅ Your Facebook → Telegram Bot is running!');
});

// 1. Facebook Webhook Verification
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
    res.sendStatus(400);
  }
});

// 2. Handle Incoming Facebook Messages
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging ? entry.messaging[0] : null;

      if (webhook_event && webhook_event.message) {
        await handleMessage(webhook_event.sender.id, webhook_event.message);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});
// 3. Handle Telegram Callback Queries (Button Clicks)
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const data = callbackQuery.data; // e.g., "confirm_123456789" or "reject_123456789"
    const messageId = callbackQuery.message.message_id;

    // Split only on first underscore to get action and full sender ID
    const underscoreIndex = data.indexOf('_');
    const action = data.substring(0, underscoreIndex);
    const senderId = data.substring(underscoreIndex + 1);

    console.log(`Button clicked: action=${action}, senderId=${senderId}`);

    // Answer callback query FIRST to remove loading state
    try {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id
      });
    } catch (err) {
      console.error('Error answering callback:', err.message);
    }

    // Then send messages
    try {
      if (action === 'confirm') {
        await sendFacebookMessage(senderId, '✅Мөнгө орсон байна, захиалга баталгаажлаа');
        await editTelegramMessage(messageId, `✅ Order CONFIRMED for user ${senderId}`);
      } else if (action === 'reject') {
        await sendFacebookMessage(senderId, '❌Мөнгө ороогүй байна та гүйлгээгээ шалгаад ахин хуулгаа явуулна уу');
        await editTelegramMessage(messageId, `❌ Order REJECTED for user ${senderId}`);
      }
    } catch (err) {
      console.error('Error processing action:', err.response?.data || err.message);
      await editTelegramMessage(messageId, `⚠️ Error: Could not send message to Facebook user`);
    }
  }

  res.sendStatus(200);
});

async function handleMessage(senderPsid, received_message) {
  if (received_message.text) {
    console.log(`Received text: "${received_message.text}" from ${senderPsid}`);
  }

  if (received_message.attachments) {
    for (const attachment of received_message.attachments) {
      if (attachment.type === 'image') {
        const imageUrl = attachment.payload.url;
        console.log(`Received image from ${senderPsid}: ${imageUrl}`);
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

  const caption = `📸 New order image received!\n👤 Sender ID: ${senderId}`;
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      photo: imageUrl,
      caption: caption,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Order', callback_data: `confirm_${senderId}` },
            { text: '❌ Reject Order', callback_data: `reject_${senderId}` }
          ]
        ]
      }
    });
    console.log('Successfully sent photo to Telegram with buttons');
  } catch (error) {
    console.error('Error sending to Telegram:', error.response ? error.response.data : error.message);
  }
}

async function sendFacebookMessage(recipientId, messageText) {
  const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!pageAccessToken) {
    console.error('FB_PAGE_ACCESS_TOKEN not set');
    return;
  }

  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${pageAccessToken}`;

  try {
    await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: messageText }
    });
    console.log(`Sent message to Facebook user ${recipientId}: ${messageText}`);
  } catch (error) {
    console.error('Error sending Facebook message:', error.response ? error.response.data : error.message);
  }
}

async function editTelegramMessage(messageId, newText) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    await axios.post(`https://api.telegram.org/bot${telegramBotToken}/editMessageCaption`, {
      chat_id: chatId,
      message_id: messageId,
      caption: newText
    });
  } catch (error) {
    console.error('Error editing Telegram message:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
