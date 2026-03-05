const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const exists = await db('users').where({ email }).first();
    if (exists)
      return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId   = uuid();
    const walletId = uuid();

    await db.transaction(async trx => {
      await trx('users').insert({
        id:            userId,
        name,
        email,
        phone,
        password_hash: passwordHash,
        kyc_status:    'pending',
        status:        'active',
        created_at:    new Date()
      });
      await trx('wallets').insert({
        id:         walletId,
        user_id:    userId,
        balance:    0.00,
        currency:   'USD',
        status:     'active',
        created_at: new Date()
      });
    });

    const token = jwt.sign(
      { userId, walletId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ success: true, token, userId, walletId });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db('users').where({ email }).first();

    if (!user)
      return res.status(401).json({ error: 'Invalid credentials' });

    if (user.failed_attempts >= 5)
      return res.status(423).json({ error: 'Account locked. Contact support.' });

    if (user.status === 'suspended')
      return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await db('users').where({ id: user.id }).increment('failed_attempts', 1);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db('users').where({ id: user.id }).update({
      failed_attempts: 0,
      last_login:      new Date()
    });

    const wallet = await db('wallets').where({ user_id: user.id }).first();
    const token  = jwt.sign(
      { userId: user.id, walletId: wallet.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        kyc_status: user.kyc_status
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;