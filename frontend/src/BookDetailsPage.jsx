import React, { useEffect, useMemo, useState } from 'react';
import { createBookOrder, fetchBook, getMe, resolveBookImageUrl } from './services/api.js';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

const conditions = { NEW: 'Mới', LIKE_NEW: 'Như mới', USED: 'Đã qua sử dụng', OLD: 'Sách cũ' };
const damages = { LOW: 'Nhẹ', MEDIUM: 'Trung bình', HIGH: 'Cao' };

function BookDetailsPage() {
  const bookId = window.location.pathname.split('/').filter(Boolean).at(-1);
  const [book, setBook] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderOpen, setOrderOpen] = useState(false);
  const [pointsUsed, setPointsUsed] = useState('0');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchBook(bookId),
      localStorage.getItem('bookswap-token') ? getMe().catch(() => null) : Promise.resolve(null)
    ])
      .then(([bookResult, userResult]) => {
        if (!active) return;
        setBook(bookResult.data.data);
        if (userResult) setUser(userResult.data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không tải được thông tin sách.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [bookId]);

  const salePrice = book?.salePrice ?? book?.coverPrice ?? 0;
  const availableQuantity = book?.stockQuantity ?? 1;
  const selectedQuantity = Number(quantity) || 0;
  const maxPoints = Math.floor((salePrice * selectedQuantity) / 1000);
  const maxUsablePoints = Math.min(maxPoints, user?.bookCredits || 0);
  const points = Number(pointsUsed);
  const cashDue = useMemo(() => (salePrice * selectedQuantity) - (Number.isSafeInteger(points) && points >= 0 ? points : 0) * 1000, [points, selectedQuantity, salePrice]);
  const isOwner = user && book?.owner?._id === user.id;

  const submitOrder = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (!Number.isSafeInteger(selectedQuantity) || selectedQuantity < 1 || selectedQuantity > availableQuantity) {
      setError('Số lượng mua vượt quá số lượng còn hàng.');
      return;
    }
    if (!Number.isSafeInteger(points) || points < 0 || points > maxUsablePoints) {
      setError('Số điểm dùng không hợp lệ hoặc vượt quá số điểm hiện có.');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { data } = await createBookOrder(book._id, { ...values, quantity: selectedQuantity, pointsUsed: points });
      window.location.href = `/orders/success/${data.data.id}`;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tạo đơn mua sách.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="book-page"><p className="loading-state">Đang tải thông tin sách...</p></main>;
  if (!book) return <main className="book-page"><a className="text-link" href="/">← Quay lại BookSwap</a>{error && <div className="notice notice-error">{error}</div>}</main>;

  const damage = book.damageNotes;
  const maintenanceFee = book.maintenanceFee ?? Math.round((book.coverPrice * 2) / 100);
  const isSaleListing = book.type === 'OWNED' && book.listingMode === 'SALE';
  const canBuy = isSaleListing && book.status === 'AVAILABLE' && availableQuantity > 0 && !isOwner;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a>
        <div className="account-actions">
          {user ? <span className="welcome">Điểm của tôi: <strong>{user.bookCredits || 0}</strong></span> : <a className="button button-quiet" href="/?login=1">Đăng nhập để mua</a>}
          <a className="button button-quiet" href="/">Quay lại</a>
        </div>
      </header>
      <main className="book-page">
        {error && <div className="notice notice-error">{error}<button onClick={() => setError('')}>×</button></div>}
        {notice && <div className="notice notice-success">{notice}<a href="/?tab=orders">Xem đơn mua</a></div>}
        <div className="book-detail-layout">
          <div className="book-detail-photo">
            {book.imageUrl ? <img src={resolveBookImageUrl(book.imageUrl)} alt={`Ảnh chụp sách ${book.title}`} /> : <div className="book-detail-placeholder">Chưa có ảnh sách</div>}
          </div>
          <article className="book-detail-content">
            <p className="eyebrow">CHI TIẾT SÁCH</p>
            <h1>{book.title}</h1>
            <p className="book-detail-author">{book.author || 'Chưa cập nhật tác giả'} · Đăng bởi {book.owner?.name || 'Thành viên BookSwap'}</p>
            <p className="detail-sale-price">{isSaleListing ? currency.format(salePrice) : 'Đăng để trao đổi'}</p>
            <dl className="book-detail-facts">
              <div><dt>Giá bìa</dt><dd>{currency.format(book.coverPrice || 0)}</dd></div>
              <div><dt>Tình trạng</dt><dd>{conditions[book.condition] || 'Chưa cập nhật'}</dd></div>
              <div><dt>Mức độ hư hại</dt><dd>{damages[book.damageLevel] || 'Chưa cập nhật'}</dd></div>
              <div><dt>Hình thức</dt><dd>{isSaleListing ? 'Đăng bán' : 'Trao đổi'}</dd></div>
              {isSaleListing && <div><dt>Còn lại</dt><dd>{availableQuantity} cuốn</dd></div>}
              {isOwner && <div><dt>Phí duy trì (2%)</dt><dd>{currency.format(maintenanceFee)}</dd></div>}
            </dl>
            <section className="book-detail-section"><h2>Tóm tắt</h2><p>{book.summary || 'Người đăng chưa bổ sung tóm tắt cho cuốn sách này.'}</p></section>
            <section className="book-detail-section"><h2>Tình trạng vật lý</h2><p>{damage || 'Chưa có ghi chú hư hại.'}</p></section>
            {isSaleListing && book.status === 'AVAILABLE' && availableQuantity > 0 && !orderOpen && (
              <button
                className="button button-primary button-large"
                disabled={Boolean(isOwner)}
                onClick={() => {
                  if (!user) {
                    const returnTo = encodeURIComponent(window.location.pathname);
                    window.location.href = `/?login=1&returnTo=${returnTo}`;
                    return;
                  }
                  setPointsUsed(String(Math.min(Math.floor(salePrice / 1000), user.bookCredits || 0)));
                  setQuantity(1);
                  setOrderOpen(true);
                }}
              >
                Mua sách · Thanh toán COD
              </button>
            )}
            {isOwner && <p className="form-hint">Đây là sách bạn đăng. Khách khác sẽ thấy nút mua nếu đây là tin bán còn hàng; bạn không thể tự mua sách của mình. Phí duy trì chỉ hiển thị với bạn và quản trị viên.</p>}
            {!isSaleListing && <p className="status-pill">Sách này được đăng để trao đổi.</p>}
            {isSaleListing && !canBuy && !isOwner && <p className="status-pill">Sách hiện đã hết hàng hoặc không còn sẵn sàng để mua.</p>}
            {orderOpen && (
              <form className="order-form" onSubmit={submitOrder}>
                <h2>Thông tin nhận sách</h2>
                <label>Số lượng mua<input type="number" min="1" max={availableQuantity} step="1" value={quantity} onChange={(event) => {
                  if (event.target.value === '') {
                    setQuantity('');
                    return;
                  }
                  const enteredQuantity = Number(event.target.value);
                  if (Number.isFinite(enteredQuantity)) {
                    const nextQuantity = Math.min(availableQuantity, Math.max(1, Math.floor(enteredQuantity)));
                    setQuantity(nextQuantity);
                    setPointsUsed(String(Math.min(Math.floor((salePrice * nextQuantity) / 1000), user?.bookCredits || 0)));
                  }
                }} required /></label>
                <label>Người nhận<input name="recipientName" required maxLength="100" defaultValue={user?.name || ''} /></label>
                <label>Số điện thoại<input name="recipientPhone" type="tel" required maxLength="20" /></label>
                <label>Địa chỉ<input name="address" required maxLength="300" defaultValue={user?.address || ''} /></label>
                <label>Dùng điểm (1 điểm = 1.000đ; tối đa {maxUsablePoints})<input type="number" min="0" max={maxUsablePoints} step="1" value={pointsUsed} onChange={(event) => {
                  const enteredPoints = Number(event.target.value);
                  if (event.target.value === '') {
                    setPointsUsed('');
                  } else if (Number.isFinite(enteredPoints)) {
                    setPointsUsed(String(Math.min(maxUsablePoints, Math.max(0, Math.floor(enteredPoints)))));
                  }
                }} /></label>
                <p className="order-total">Thu COD: <strong>{currency.format(cashDue)}</strong></p>
                <div className="account-actions"><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Đang tạo đơn...' : 'Xác nhận mua'}</button><button className="button button-quiet" type="button" onClick={() => setOrderOpen(false)}>Hủy</button></div>
              </form>
            )}
          </article>
        </div>
      </main>
      <footer className="footer"><a className="brand" href="/"><span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a><p>Đọc thêm. Chia sẻ nhiều. Sống xanh hơn.</p></footer>
    </div>
  );
}

export default BookDetailsPage;
