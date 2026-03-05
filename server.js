const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, slow down.' }
}));

app.use('/api/v1/auth',         require('./routes/auth'));
app.use('/api/v1/wallet',       require('./routes/wallet'));
app.use('/api/v1/transactions', require('./routes/transactions'));
app.use('/api/v1/users',        require('./routes/users'));
app.use('/api/v1/admin',        require('./routes/admin'));

io.on('connection', (socket) => {
  socket.on('join_wallet', (walletId) => {
    socket.join(walletId);
  });
});
app.set('io', io);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ P2P Platform running on port ${PORT}`);
});