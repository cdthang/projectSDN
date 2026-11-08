require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const User = require('../models/User');
const calculateCreditValue = require('../utils/creditCalculator');

const demoPassword = 'BookSwap123!';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
const adminAccount = { email: process.env.ADMIN_EMAIL || 'admin@bookswap.test', name: 'Quản trị viên' };
const demoUsers = [
  { key: 'minhAnh', name: 'Minh Anh', email: 'minhanh@bookswap.test', address: 'Ba Đình, Hà Nội' },
  { key: 'lan', name: 'Lan Nguyễn', email: 'lan@bookswap.test', address: 'Cầu Giấy, Hà Nội' },
  { key: 'quang', name: 'Quang Trần', email: 'quang@bookswap.test', address: 'Đống Đa, Hà Nội' }
];

const demoBooks = [
  { owner: 'minhAnh', title: 'Rừng Na Uy', author: 'Haruki Murakami', summary: 'Một câu chuyện về tình yêu, mất mát và hành trình trưởng thành của tuổi trẻ.', coverPrice: 145000, condition: 'USED', damageLevel: 'HIGH', damageNotes: 'Bìa sờn và có vài trang ố màu.', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Dế Mèn Phiêu Lưu Ký', author: 'Tô Hoài', summary: 'Cuộc phiêu lưu của Dế Mèn qua thế giới loài vật.', coverPrice: 65000, condition: 'LIKE_NEW', type: 'WISHLIST' },
  { owner: 'lan', title: 'Dế Mèn Phiêu Lưu Ký', author: 'Tô Hoài', summary: 'Cuộc phiêu lưu của Dế Mèn qua thế giới loài vật.', coverPrice: 65000, condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'lan', title: 'Nhà giả kim', author: 'Paulo Coelho', summary: 'Hành trình theo đuổi ước mơ và khám phá kho báu của chính mình.', coverPrice: 79000, condition: 'USED', type: 'WISHLIST' },
  { owner: 'quang', title: 'Nhà giả kim', author: 'Paulo Coelho', summary: 'Hành trình theo đuổi ước mơ và khám phá kho báu của chính mình.', coverPrice: 79000, condition: 'NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'quang', title: 'Rừng Na Uy', author: 'Haruki Murakami', summary: 'Một câu chuyện về tình yêu, mất mát và hành trình trưởng thành của tuổi trẻ.', coverPrice: 145000, condition: 'USED', type: 'WISHLIST' },
  { owner: 'lan', title: 'Tuổi trẻ đáng giá bao nhiêu', author: 'Rosie Nguyễn', summary: 'Những chia sẻ truyền cảm hứng để sống chủ động và có ý nghĩa hơn.', coverPrice: 80000, condition: 'LIKE_NEW', damageLevel: 'MEDIUM', damageNotes: 'Góc bìa cong nhẹ.', type: 'OWNED' },
  { owner: 'quang', title: 'Cà phê cùng Tony', author: 'Tony Buổi Sáng', summary: 'Những câu chuyện và góc nhìn tích cực về học tập, công việc và cuộc sống.', coverPrice: 90000, salePrice: 65000, stockQuantity: 3, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' }
];

async function seedDemoData() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI chưa được cấu hình trong backend/.env.');
  }
  if (process.env.NODE_ENV === 'production' && adminPassword === 'admin') {
    throw new Error('Hãy đặt ADMIN_PASSWORD an toàn trong backend/.env trước khi seed ở production.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const usersByKey = {};

  for (const demoUser of demoUsers) {
    const user = await User.findOneAndUpdate(
      { email: demoUser.email },
      {
        $set: {
          name: demoUser.name,
          email: demoUser.email,
          address: demoUser.address,
          password: passwordHash,
          role: 'USER'
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    usersByKey[demoUser.key] = user;
  }

  await User.findOneAndUpdate(
    { email: adminAccount.email },
    {
      $set: {
        name: adminAccount.name,
        email: adminAccount.email,
        address: 'BookSwap',
        password: await bcrypt.hash(adminPassword, 12),
        role: 'ADMIN'
      }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  for (const book of demoBooks) {
    await Book.updateOne(
      { owner: usersByKey[book.owner]._id, title: book.title, type: book.type },
      {
        $set: {
          owner: usersByKey[book.owner]._id,
          title: book.title,
          author: book.author,
          summary: book.summary || '',
          coverPrice: book.coverPrice,
          maintenanceFee: book.type === 'OWNED' ? Math.round(book.coverPrice * 0.02) : 0,
          maintenanceFeeRate: 2,
          condition: book.condition,
          damageLevel: book.damageLevel || 'LOW',
          damageNotes: book.damageNotes || '',
          creditValue: calculateCreditValue(book.coverPrice, book.condition),
          ...(book.type === 'OWNED' ? { listingMode: book.listingMode || 'TRADE' } : {}),
          ...(book.listingMode === 'SALE'
            ? { salePrice: book.salePrice, stockQuantity: book.stockQuantity, status: 'AVAILABLE' }
            : {}),
          type: book.type
        },
        $setOnInsert: { status: 'AVAILABLE' }
      },
      { upsert: true, runValidators: true }
    );
  }

  console.log(`Demo data is ready: 3 users, 1 admin and ${demoBooks.length} books.`);
  console.log(`Demo login: ${demoUsers[0].email} / ${demoPassword}`);
  console.log(`Admin login: admin / ${adminPassword} (${adminAccount.email})`);
}

seedDemoData()
  .catch((error) => {
    console.error('Could not seed demo data:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
