const Book = require('../models/Book');

exports.findTradeLoops = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user._id.toString();
    if (req.user._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể tìm vòng đổi cho tài khoản của mình.' });
    }

    const books = await Book.find({
      status: 'AVAILABLE',
      $or: [
        { owner: userId, type: 'WISHLIST' },
        {
          type: 'OWNED',
          $or: [
            { listingMode: 'TRADE' },
            { listingMode: { $exists: false } }
          ]
        }
      ]
    }).populate('owner', 'name');
    const wishlists = new Map();
    const ownedByUser = new Map();

    for (const book of books) {
      const ownerId = book.owner._id.toString();
      const destination = book.type === 'WISHLIST' ? wishlists : ownedByUser;
      if (!destination.has(ownerId)) destination.set(ownerId, []);
      destination.get(ownerId).push(book);
    }

    const titleKey = (title) => title.trim().toLocaleLowerCase('vi');
    const loops = [];
    const search = (currentUserId, participants, visited) => {
      const wantedTitles = new Set((wishlists.get(currentUserId) || []).map((book) => titleKey(book.title)));
      if (!wantedTitles.size) return;

      for (const [ownerId, availableBooks] of ownedByUser) {
        const matchingBooks = availableBooks.filter((book) => wantedTitles.has(titleKey(book.title)));
        for (const book of matchingBooks) {
          const participant = { owner: book.owner, book };
          if (ownerId === userId && participants.length === 2) {
            loops.push({ participants: [...participants, participant] });
            continue;
          }
          if (visited.has(ownerId) || participants.length >= 2 || ownerId === userId) continue;
          const nextVisited = new Set(visited);
          nextVisited.add(ownerId);
          search(ownerId, [...participants, participant], nextVisited);
        }
      }
    };

    search(userId, [], new Set([userId]));
    return res.json({ success: true, count: loops.length, data: loops });
  } catch (error) {
    return next(error);
  }
};