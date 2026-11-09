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
const demoCouriers = Array.from({ length: 7 }, (_, index) => ({
  name: `Nhân viên vận chuyển ${index + 1}`,
  email: `courier${index + 1}@bookswap.test`,
  phone: `090000000${index + 1}`,
  address: `Quận ${index + 1}, Hà Nội`
}));

const demoBooks = [
  { owner: 'minhAnh', title: 'Rừng Na Uy', author: 'Haruki Murakami', summary: 'Một câu chuyện về tình yêu, mất mát và hành trình trưởng thành của tuổi trẻ.', coverPrice: 145000, condition: 'USED', damageLevel: 'HIGH', damageNotes: 'Bìa sờn và có vài trang ố màu.', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Dế Mèn Phiêu Lưu Ký', author: 'Tô Hoài', summary: 'Cuộc phiêu lưu của Dế Mèn qua thế giới loài vật.', coverPrice: 65000, condition: 'LIKE_NEW', type: 'WISHLIST' },
  { owner: 'lan', title: 'Dế Mèn Phiêu Lưu Ký', author: 'Tô Hoài', summary: 'Cuộc phiêu lưu của Dế Mèn qua thế giới loài vật.', coverPrice: 65000, condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'lan', title: 'Nhà giả kim', author: 'Paulo Coelho', summary: 'Hành trình theo đuổi ước mơ và khám phá kho báu của chính mình.', coverPrice: 79000, condition: 'USED', type: 'WISHLIST' },
  { owner: 'quang', title: 'Nhà giả kim', author: 'Paulo Coelho', summary: 'Hành trình theo đuổi ước mơ và khám phá kho báu của chính mình.', coverPrice: 79000, condition: 'NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'quang', title: 'Rừng Na Uy', author: 'Haruki Murakami', summary: 'Một câu chuyện về tình yêu, mất mát và hành trình trưởng thành của tuổi trẻ.', coverPrice: 145000, condition: 'USED', type: 'WISHLIST' },
  { owner: 'lan', title: 'Tuổi trẻ đáng giá bao nhiêu', author: 'Rosie Nguyễn', summary: 'Những chia sẻ truyền cảm hứng để sống chủ động và có ý nghĩa hơn.', coverPrice: 80000, condition: 'LIKE_NEW', damageLevel: 'MEDIUM', damageNotes: 'Góc bìa cong nhẹ.', type: 'OWNED' },
  { owner: 'quang', title: 'Cà phê cùng Tony', author: 'Tony Buổi Sáng', summary: 'Những câu chuyện và góc nhìn tích cực về học tập, công việc và cuộc sống.', coverPrice: 90000, salePrice: 65000, stockQuantity: 3, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Cho tôi xin một vé đi tuổi thơ', author: 'Nguyễn Nhật Ánh', summary: 'Câu chuyện tuổi thơ trong trẻo qua góc nhìn của người lớn.', coverPrice: 95000, salePrice: 70000, stockQuantity: 2, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'lan', title: 'Mắt biếc', author: 'Nguyễn Nhật Ánh', summary: 'Một câu chuyện về tình yêu đơn phương và những năm tháng tuổi trẻ.', coverPrice: 110000, salePrice: 80000, stockQuantity: 1, listingMode: 'SALE', condition: 'USED', damageLevel: 'MEDIUM', type: 'OWNED' },
  { owner: 'quang', title: 'Tôi thấy hoa vàng trên cỏ xanh', author: 'Nguyễn Nhật Ánh', summary: 'Ký ức tuổi thơ và tình cảm gia đình ở một làng quê Việt Nam.', coverPrice: 125000, salePrice: 90000, stockQuantity: 2, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Đắc nhân tâm', author: 'Dale Carnegie', summary: 'Những nguyên tắc giao tiếp và ứng xử trong đời sống.', coverPrice: 76000, salePrice: 55000, stockQuantity: 3, listingMode: 'SALE', condition: 'USED', damageLevel: 'MEDIUM', type: 'OWNED' },
  { owner: 'lan', title: 'Tuần làm việc 4 giờ', author: 'Timothy Ferriss', summary: 'Góc nhìn về cách tổ chức công việc và cuộc sống linh hoạt.', coverPrice: 189000, salePrice: 135000, stockQuantity: 1, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'quang', title: 'Đi tìm lẽ sống', author: 'Viktor E. Frankl', summary: 'Suy ngẫm về ý nghĩa sống và sức mạnh tinh thần.', coverPrice: 85000, salePrice: 60000, stockQuantity: 2, listingMode: 'SALE', condition: 'USED', damageLevel: 'MEDIUM', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Nhà giả kim', author: 'Paulo Coelho', summary: 'Hành trình theo đuổi ước mơ và khám phá kho báu của chính mình.', coverPrice: 79000, salePrice: 58000, stockQuantity: 2, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'lan', title: 'Bố già', author: 'Mario Puzo', summary: 'Tiểu thuyết về gia đình, quyền lực và những lựa chọn.', coverPrice: 150000, salePrice: 100000, stockQuantity: 1, listingMode: 'SALE', condition: 'USED', damageLevel: 'HIGH', type: 'OWNED' },
  { owner: 'quang', title: 'Sapiens: Lược sử loài người', author: 'Yuval Noah Harari', summary: 'Khái quát lịch sử phát triển của loài người qua nhiều thời kỳ.', coverPrice: 220000, salePrice: 160000, stockQuantity: 2, listingMode: 'SALE', condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Cây cam ngọt của tôi', author: 'José Mauro de Vasconcelos', summary: 'Câu chuyện cảm động về tuổi thơ và tình yêu thương.', coverPrice: 108000, condition: 'USED', damageLevel: 'MEDIUM', damageNotes: 'Bìa có vết xước nhỏ.', type: 'OWNED' },
  { owner: 'lan', title: 'Hoàng tử bé', author: 'Antoine de Saint-Exupéry', summary: 'Một câu chuyện giàu suy ngẫm về tình bạn và cách nhìn thế giới.', coverPrice: 65000, condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'quang', title: 'Không gia đình', author: 'Hector Malot', summary: 'Cuộc phiêu lưu của cậu bé Rémi qua nhiều miền đất.', coverPrice: 120000, condition: 'USED', damageLevel: 'MEDIUM', type: 'OWNED' },
  { owner: 'minhAnh', title: 'Lược sử thời gian', author: 'Stephen Hawking', summary: 'Những khái niệm cơ bản về vũ trụ và thời gian.', coverPrice: 99000, condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' },
  { owner: 'lan', title: 'Bảy thói quen hiệu quả', author: 'Stephen R. Covey', summary: 'Các nguyên tắc phát triển cá nhân và phối hợp công việc.', coverPrice: 150000, condition: 'USED', damageLevel: 'HIGH', damageNotes: 'Bìa sờn rõ, ruột sách còn đọc tốt.', type: 'OWNED' },
  { owner: 'quang', title: 'Ông già và biển cả', author: 'Ernest Hemingway', summary: 'Cuộc đấu tranh bền bỉ giữa con người và thiên nhiên.', coverPrice: 55000, condition: 'LIKE_NEW', damageLevel: 'LOW', type: 'OWNED' }
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

  for (const courier of demoCouriers) {
    await User.findOneAndUpdate(
      { email: courier.email },
      {
        $set: {
          ...courier,
          password: passwordHash,
          role: 'COURIER',
          isActive: true
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
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
          ...(book.type === 'OWNED' ? {
            listingMode: book.listingMode || 'TRADE',
            salePrice: book.salePrice ?? Math.round(book.coverPrice * 0.8),
            stockQuantity: book.stockQuantity || 1,
            aiAssessment: {
              condition: book.condition,
              damageLevel: book.damageLevel || 'LOW',
              damageNotes: book.damageNotes || '',
              estimatedPrice: Math.round(book.coverPrice * (book.condition === 'NEW' ? 0.9 : book.condition === 'USED' ? 0.65 : 0.8)),
              confidence: 0.85,
              provider: 'Demo',
              analyzedAt: new Date('2025-01-01T00:00:00.000Z')
            }
          } : {}),
          type: book.type
        },
        $setOnInsert: { status: 'AVAILABLE' }
      },
      { upsert: true, runValidators: true }
    );
  }

  console.log(`Demo data is ready: 3 users, 1 admin, ${demoCouriers.length} couriers and ${demoBooks.length} books (10 sale, 10 trade).`);
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
