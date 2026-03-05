const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db');

// GET BALANCE
router.get('/balance', auth, async (req, res) => {
  try {
    const wallet = await db('wallets').where({ id: req.user.walletId }).first();
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({
      success:   true,
      wallet_id: wallet.id,
      balance:   parseFloat(wallet.balance),
      currency:  wallet.currency,
      status:    wallet.status
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch balance' });
  }
});

// GET DETAILS
router.get('/details', auth, async (req, res) => {
  try {
    const wallet = await db('wallets').where({ id: req.user.walletId }).first();
    const user   = await db('users').where({ id: req.user.userId })
      .select('id','name','email','phone','kyc_status').first();
    res.json({ success: true, wallet, user });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch details' });
  }
});

// FUND WALLET
router.post('/fund', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0)
      return res.status(400).json({ error: 'Invalid amount' });

    const wallet = await db('wallets').where({ id: req.user.walletId }).first();
    if (wallet.status === 'frozen')
      return res.status(403).json({ error: 'Wallet is frozen' });

    await db('wallets')
      .where({ id: req.user.walletId })
      .increment('balance', parseFloat(amount));

    const updated = await db('wallets').where({ id: req.user.walletId }).first();
    res.json({
      success:     true,
      funded:      parseFloat(amount),
      new_balance: parseFloat(updated.balance)
    });
  } catch (err) {
    res.status(500).json({ error: 'Funding failed' });
  }
});

// FREEZE WALLET
router.post('/freeze', auth, async (req, res) => {
  try {
    await db('wallets').where({ id: req.user.walletId }).update({ status: 'frozen' });
    res.json({ success: true, message: 'Wallet frozen successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not freeze wallet' });
  }
});

// UNFREEZE WALLET
router.post('/unfreeze', auth, async (req, res) => {
  try {
    await db('wallets').where({ id: req.user.walletId }).update({ status: 'active' });
    res.json({ success: true, message: 'Wallet unfrozen successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not unfreeze wallet' });
  }
});

// SET PIN
router.put('/pin/set', auth, async (req, res) => {
  try {
    const bcrypt = require('bcrypt');
    const { pin } = req.body;
    if (!pin || String(pin).length < 4)
      return res.status(400).json({ error: 'PIN must be at least 4 digits' });
    const pinHash = await bcrypt.hash(String(pin), 10);
    await db('wallets').where({ id: req.user.walletId }).update({ pin_hash: pinHash });
    res.json({ success: true, message: 'Transaction PIN set successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

module.exports = router;