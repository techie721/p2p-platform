const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db');

// GET ANALYTICS
router.get('/analytics', auth, async (req, res) => {
  try {
    const [totalUsers, totalTxns, volume, fees, activeWallets] = await Promise.all([
      db('users').count('id as c').first(),
      db('transactions').count('id as c').first(),
      db('transactions').where({ status: 'completed' }).sum('amount as s').first(),
      db('transactions').where({ status: 'completed' }).sum('fee as s').first(),
      db('wallets').where({ status: 'active' }).count('id as c').first(),
    ]);

    res.json({
      success: true,
      analytics: {
        total_users:        parseInt(totalUsers.c),
        total_transactions: parseInt(totalTxns.c),
        total_volume:       parseFloat(volume.s  || 0).toFixed(2),
        total_fees_earned:  parseFloat(fees.s    || 0).toFixed(2),
        active_wallets:     parseInt(activeWallets.c),
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch analytics' });
  }
});

// GET ALL USERS
router.get('/users', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;
    let q = db('users')
      .select('id','name','email','phone','kyc_status','status','created_at')
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'desc');
    if (status) q = q.where({ status });
    const users = await q;
    const total = await db('users').count('id as c').first();
    res.json({ success: true, users, total: parseInt(total.c) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

// SUSPEND USER
router.put('/users/:id/suspend', auth, async (req, res) => {
  try {
    await db('users')
      .where({ id: req.params.id })
      .update({ status: 'suspended' });
    await db('wallets')
      .where({ user_id: req.params.id })
      .update({ status: 'frozen' });
    res.json({ success: true, message: 'User suspended and wallet frozen' });
  } catch (err) {
    res.status(500).json({ error: 'Could not suspend user' });
  }
});

// GET ALL TRANSACTIONS
router.get('/transactions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const txns = await db('transactions')
      .orderBy('initiated_at', 'desc')
      .limit(limit)
      .offset(offset);
    const total = await db('transactions').count('id as c').first();
    res.json({ success: true, transactions: txns, total: parseInt(total.c) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});

// GET PENDING KYC
router.get('/kyc/pending', auth, async (req, res) => {
  try {
    const docs = await db('kyc_documents as k')
      .join('users as u', 'k.user_id', 'u.id')
      .where('k.status', 'pending')
      .select('k.*','u.name','u.email');
    res.json({ success: true, pending: docs });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch KYC documents' });
  }
});

// APPROVE KYC
router.put('/kyc/:id/approve', auth, async (req, res) => {
  try {
    const doc = await db('kyc_documents').where({ id: req.params.id }).first();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await db('kyc_documents')
      .where({ id: req.params.id })
      .update({ status: 'approved', reviewed_at: new Date() });
    await db('users')
      .where({ id: doc.user_id })
      .update({ kyc_status: 'approved' });
    res.json({ success: true, message: 'KYC approved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not approve KYC' });
  }
});

// REJECT KYC
router.put('/kyc/:id/reject', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db('kyc_documents').where({ id: req.params.id }).first();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await db('kyc_documents')
      .where({ id: req.params.id })
      .update({ status: 'rejected', reject_reason: reason, reviewed_at: new Date() });
    await db('users')
      .where({ id: doc.user_id })
      .update({ kyc_status: 'rejected' });
    res.json({ success: true, message: 'KYC rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Could not reject KYC' });
  }
});

module.exports = router;