require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Store pending orders in memory (in production, use a database)
const pendingOrders = new Map();

// Rate limiting: Store last request time per user
const userLastRequest = new Map();
const RATE_LIMIT_SECONDS = 30; // 1 image per 30 seconds per user

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
        // Log the full event to see what Facebook sends
        console.log('Full webhook event:', JSON.stringify(webhook_event, null, 2));
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

    // Get user name for display
    let userName = 'Unknown';
    try {
      userName = await getUserName(senderId);
    } catch (err) {
      console.error('Error getting user name:', err.message);
    }

    // Then send messages
    const shortId = senderId.slice(-6);
    const nameDisplay = userName !== 'Unknown' ? userName : 'Шинэ хэрэглэгч';

    try {
      if (action === 'confirm') {
        await sendFacebookMessage(senderId, '✅Мөнгө орсон байна, захиалга баталгаажлаа');
        await editTelegramMessage(messageId, `✅ БАТАЛГААЖЛАА\n👤 ${nameDisplay}\n🆔 #${shortId}`);
      } else if (action === 'reject') {
        await sendFacebookMessage(senderId, '❌Мөнгө ороогүй байна та гүйлгээгээ шалгаад ахин хуулгаа явуулна уу');
        await editTelegramMessage(messageId, `❌ ТАТГАЛЗСАН\n👤 ${nameDisplay}\n🆔 #${shortId}`);
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

        // Rate limiting check
        const now = Date.now();
        const lastRequest = userLastRequest.get(senderPsid);

        if (lastRequest && (now - lastRequest) < RATE_LIMIT_SECONDS * 1000) {
          const waitSeconds = Math.ceil((RATE_LIMIT_SECONDS * 1000 - (now - lastRequest)) / 1000);
          console.log(`Rate limited user ${senderPsid}, must wait ${waitSeconds}s`);
          await sendFacebookMessage(senderPsid, `⏳ Түр хүлээнэ үү, ${waitSeconds} секундын дараа дахин оролдоно уу`);
          return; // Don't process this image
        }

        // Update last request time
        userLastRequest.set(senderPsid, now);

        // Get user name from Facebook
        let userName = 'Unknown';
        try {
          userName = await getUserName(senderPsid);
        } catch (err) {
          console.error('Error getting user name:', err.message);
        }

        await sendToTelegram(senderPsid, imageUrl, userName);
      }
    }
  }
}

async function getUserName(userId) {
  const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    console.error('FB_PAGE_ACCESS_TOKEN not set for getUserName');
    return 'Unknown';
  }

  try {
    // Use first_name and last_name which are more reliably returned
    const response = await axios.get(
      `https://graph.facebook.com/${userId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`
    );

    console.log('Facebook user data:', response.data);

    // Try different name fields
    if (response.data.name) {
      return response.data.name;
    } else if (response.data.first_name) {
      const firstName = response.data.first_name || '';
      const lastName = response.data.last_name || '';
      return `${firstName} ${lastName}`.trim() || 'Unknown';
    }

    return 'Unknown';
  } catch (error) {
    console.error('Error fetching user name:', error.response?.data || error.message);
    return 'Unknown';
  }
}

async function sendToTelegram(senderId, imageUrl, userName = 'Unknown') {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || !chatId) {
    console.error("Telegram credentials not set.");
    return;
  }

  // Create caption - show name if available, otherwise just show ID
  const shortId = senderId.slice(-6); // Last 6 digits of ID for easy reference
  const nameDisplay = userName !== 'Unknown' ? `👤 ${userName}` : '👤 Шинэ хэрэглэгч';
  const caption = `📸 Шинэ захиалга!\n${nameDisplay}\n🆔 #${shortId}\n⏳ Хүлээгдэж байна...`;
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      photo: imageUrl,
      caption: caption,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Баталгаажуулах', callback_data: `confirm_${senderId}` },
            { text: '❌ Татгалзах', callback_data: `reject_${senderId}` }
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
