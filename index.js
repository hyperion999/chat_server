const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for dev
    methods: ["GET", "POST"]
  }
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  await redisClient.connect();
  console.log("Connected to Redis");

  io.on('connection', async (socket) => {
    console.log('A user connected');

    // Send history
    const history = await redisClient.lRange('chat_messages', 0, -1);
    // Redis lists store strings, we parse them. History is newest first? No, lRange 0 -1 is full list.
    // We'll store as JSON strings.
    const parsedHistory = history.map(h => JSON.parse(h));
    socket.emit('history', parsedHistory);

    socket.on('message', async (data) => {
      // data: { sender: string, text: string, timestamp: number }
      // Validate
      if (!data.sender || !data.text) return;
      
      const message = {
        sender: data.sender,
        text: data.text.slice(0, 200), // Limit length
        timestamp: Date.now()
      };

      const msgString = JSON.stringify(message);

      // Store in Redis (RPUSH to append to end)
      await redisClient.rPush('chat_messages', msgString);
      
      // Trim to last 50 messages
      await redisClient.lTrim('chat_messages', -50, -1);

      // Broadcast
      io.emit('message', message);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
  });
})();

