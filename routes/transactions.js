const router = require('express').Router();
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const auth = require('../middleware/auth');

// HASH CHAIN GENERATOR
function generateHash(txnId, senderWallet, receiverWallet, amount, timestamp, previousHash) {
  const raw = `${txnId}|${senderWallet}|${receiverWallet}|${amount}|${timestamp}|${previousHash}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// SEND MONEY
router.post('/send', auth, async (req, res) => {
  const { receiver_email, amount, note, pin } = req.body;

  if (!receiver_email || !amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'receiver_email and valid amount are required' });

  try {
    const result = await db.transaction(async trx => {

      // Lock sender wallet
      const sender = await trx.raw(
        'SELECT * FROM wallets WHERE id = ? FOR UPDATE',
        [req.user.walletId]
      ).then(r => r.rows[0]);

      if (!sender)
        throw new Error('Sender wallet not found');
      if (sender.status === 'frozen')
        throw new Error('Your wallet is frozen');
      if (parseFloat(sender.balance) < parseFloat(amount))
        throw new Error('Insufficient balance');

      // Verify PIN if wallet has one
      if (sender.pin_hash) {
        if (!pin) throw new Error('Transaction PIN required');
        const pinOk = await bcrypt.compare(String(pin), sender.pin_hash);
        if (!pinOk) throw new Error('Invalid PIN');
      }

      // Find receiver
      const receiverUser = await trx('users').where({ email: receiver_email }).first();
      if (!receiverUser)
        throw new Error('Receiver not found');
      if (receiverUser.id === req.user.userId)
        throw new Error('Cannot send to yourself');

      // Lock receiver wallet
      const receiver = await trx.raw(
        'SELECT * FROM wallets WHERE user_id = ? FOR UPDATE',
        [receiverUser.id]
      ).then(r => r.rows[0]);

      if (receiver.status === 'frozen')
        throw new Error('Receiver wallet is frozen');

      // Get last transaction for hash chain
      const lastTxn = await trx('transactions')
        .orderBy('block_number', 'desc')
        .first();
      const previousHash = lastTxn ? lastTxn.hash : '0'.repeat(64);
      const lastBlock    = lastTxn ? parseInt(lastTxn.block_number) : 0;

      // Build transaction
      const txnId     = uuid();
      const fee       = parseFloat((parseFloat(amount) * 0.005).toFixed(4));
      const netAmount = parseFloat((parseFloat(amount) - fee).toFixed(2));
      const timestamp = new Date().toISOString();
         const hash      = generateHash(
        txnId, sender.id, receiver.id,
        parseFloat(amount), timestamp, previousHash
      );

      // Save transaction
      await trx('transactions').insert({
        id:              txnId,
        sender_wallet:   sender.id,
        receiver_wallet: receiver.id,
        amount:          parseFloat(amount),
        fee,
        net_amount:      netAmount,
        status:          'completed',
        note:            note || null,
        hash,
        previous_hash:   previousHash,
        block_number:    lastBlock + 1,
        initiated_at:    new Date(),
        completed_at:    new Date()
      });

      // Update balances
      await trx('wallets')
        .where({ id: sender.id })
        .decrement('balance', parseFloat(amount));
      await trx('wallets')
        .where({ id: receiver.id })
        .increment('balance', netAmount);

      return {
        id:            txnId,
        hash,
        block_number:  lastBlock + 1,
        receiver_name: receiverUser.name,
        amount:        parseFloat(amount),
        fee,
        net_amount:    netAmount,
        status:        'completed',
        timestamp
      };
    });

    // Real-time notifications
    const io = req.app.get('io');
    io.to(req.user.walletId).emit('transaction.completed', { ...result, type: 'debit' });

    res.json({ success: true, transaction: result });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET HISTORY
router.get('/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const walletId = req.user.walletId;
    const offset   = (parseInt(page) - 1) * parseInt(limit);

    let query = db('transactions')
      .orderBy('initiated_at', 'desc')
      .limit(parseInt(limit))
      .offset(offset);

    if (type === 'sent')
      query = query.where({ sender_wallet: walletId });
    else if (type === 'received')
      query = query.where({ receiver_wallet: walletId });
    else
      query = query.where('sender_wallet', walletId)
                   .orWhere('receiver_wallet', walletId);

    const txns  = await query;
    const total = await db('transactions')
      .where('sender_wallet', walletId)
      .orWhere('receiver_wallet', walletId)
      .count('id as count').first();

    res.json({
      success:      true,
      transactions: txns,
      total:        parseInt(total.count),
      page:         parseInt(page),
      limit:        parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch history' });
  }
});

// VERIFY HASH
router.get('/verify/:hash', async (req, res) => {
  try {
    const txn = await db('transactions').where({ hash: req.params.hash }).first();
    if (!txn)
      return res.status(404).json({ verified: false, error: 'Hash not found' });

const recomputed = generateHash(
      txn.id, txn.sender_wallet, txn.receiver_wallet,
      parseFloat(txn.amount), new Date(txn.initiated_at).toISOString(),
      txn.previous_hash
    );

    res.json({
      verified:     recomputed === txn.hash,
      transaction:  txn,
      block_number: txn.block_number,
      message:      recomputed === txn.hash
        ? 'Transaction is authentic ✅'
        : '⚠️ Hash mismatch — possible tampering'
    });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET SINGLE TRANSACTION
router.get('/:id', auth, async (req, res) => {
  try {
    const txn = await db('transactions').where({ id: req.params.id }).first();
    if (!txn)
      return res.status(404).json({ error: 'Transaction not found' });

    const recomputed = generateHash(
      txn.id, txn.sender_wallet, txn.receiver_wallet,
      txn.amount, new Date(txn.initiated_at).toISOString(),
      txn.previous_hash
    );

    res.json({
      success:       true,
      transaction:   txn,
      hash_verified: recomputed === txn.hash
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch transaction' });
  }
});

// RAISE DISPUTE
router.post('/:id/dispute', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    await db('transactions')
      .where({ id: req.params.id })
      .update({ status: 'disputed', dispute_reason: reason });
    res.json({ success: true, message: 'Dispute filed. Admin will review within 24h.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not file dispute' });
  }
});

module.exports = router;