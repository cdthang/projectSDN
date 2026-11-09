const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listContacts,
  listConversations,
  openConversation,
  listMessages,
  saveMessage
} = require('../controllers/chatController');

const router = express.Router();

router.use(authMiddleware);
router.get('/contacts', listContacts);
router.get('/conversations', listConversations);
router.post('/conversations', openConversation);
router.get('/conversations/:conversationId/messages', listMessages);
router.post('/conversations/:conversationId/messages', saveMessage);

module.exports = router;
