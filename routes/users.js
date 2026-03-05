const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db');

// GET PROFILE
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.user.userId })
      .select('id','name','email','phone','kyc_status','status','created_at')
      .first();
    const wallet = await db('wallets')
      .where({ id: req.user.walletId })
      .select('id','balance','currency','status')
      .first();
    res.json({ success: true, user, wallet });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
});

// UPDATE PROFILE
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    await db('users')
      .where({ id: req.user.userId })
      .update({ name, phone });
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// SEARCH USERS
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3)
      return res.status(400).json({ error: 'Query too short. Minimum 3 characters.' });

    const users = await db('users')
      .where('email', 'ilike', `%${q}%`)
      .orWhere('name',  'ilike', `%${q}%`)
      .select('id','name','email')
      .limit(10);

    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET NOTIFICATIONS
router.get('/notifications', auth, async (req, res) => {
  try {
    const notes = await db('notifications')
      .where({ user_id: req.user.userId })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ success: true, notifications: notes });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch notifications' });
  }
});

module.exports = router;