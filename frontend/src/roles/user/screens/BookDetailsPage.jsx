import React, { useEffect, useMemo, useState } from 'react';
import { createBookOrder, fetchBook, getMe, resolveBookImageUrl } from '../../../services/api.js';
import { SiteFooter, SiteHeader } from '../../../shared/SiteLayout.jsx';

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
  const [paymentMethod, setPaymentMethod] = useState('MIXED');
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
  const tradePoints = book?.tradePoints ?? book?.creditValue ?? 0;
  const points = Number(pointsUsed);
  const cashDue = useMemo(() => {
    if (book?.listingMode === 'TRADE') return paymentMethod === 'POINTS' ? 0 : salePrice;
    return (salePrice * selectedQuantity) - (Number.isSafeInteger(points) && points >= 0 ? points : 0) * 1000;
  }, [book?.listingMode, paymentMethod, points, selectedQuantity, salePrice]);
  const isOwner = user && book?.owner?._id === user.id;
  const isTradeListing = book?.type === 'OWNED' && book.listingMode !== 'SALE';

  const submitOrder = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (!Number.isSafeInteger(selectedQuantity) || selectedQuantity < 1 || selectedQuantity > availableQuantity) {
      setError('Số lượng mua vượt quá số lượng còn hàng.');
      return;
    }
    const pointLimit = isTradeListing ? Math.min(tradePoints, user?.bookCredits || 0) : maxUsablePoints;
    if (!Number.isSafeInteger(points) || points < 0 || points > pointLimit) {
      setError('Số điểm dùng không hợp lệ hoặc vượt quá số điểm hiện có.');
      return;
    }
    if (isTradeListing && paymentMethod === 'POINTS' && points !== tradePoints) {
      setError(`Đơn này cần ${tradePoints} điểm.`);
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { data } = await createBookOrder(book._id, {
        ...values,
        quantity: selectedQuantity,
        pointsUsed: points,
        ...(isTradeListing ? { paymentMethod } : {})
      });
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
  const canBuy = book.type === 'OWNED' && book.status === 'AVAILABLE' && (isTradeListing || availableQuantity > 0) && !isOwner;

  const openOrder = (method) => {
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname);
      window.location.href = `/?login=1&returnTo=${returnTo}`;
      return;
    }
    setPaymentMethod(method);
    setQuantity(1);
    setPointsUsed(String(isTradeListing
      ? method === 'POINTS' ? tradePoints : 0
      : Math.min(Math.floor(salePrice / 1000), user.bookCredits || 0)));
    setOrderOpen(true);
  };

  return (
    <div className="app-shell">
      <SiteHeader>
          {user ? <span className="welcome">Điểm của tôi: <strong>{user.bookCredits || 0}</strong></span> : <a className="button button-quiet" href="/?login=1">Đăng nhập để mua</a>}
          <a className="button button-quiet" href="/">Quay lại</a>
      </SiteHeader>
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
            <p className="detail-sale-price">{book.type === 'OWNED' ? currency.format(salePrice) : 'Sách mong muốn'}</p>
            <dl className="book-detail-facts">
              <div><dt>Giá bìa</dt><dd>{currency.format(book.coverPrice || 0)}</dd></div>
              {book.condition && <div><dt>Tình trạng</dt><dd>{conditions[book.condition] || 'Chưa cập nhật'}</dd></div>}
              {book.damageLevel && <div><dt>Mức độ hư hại</dt><dd>{damages[book.damageLevel] || 'Chưa cập nhật'}</dd></div>}
              <div><dt>Hình thức</dt><dd>{isSaleListing ? 'Đăng bán' : 'Trao đổi bằng điểm hoặc tiền mặt'}</dd></div>
              {isSaleListing && <div><dt>Còn lại</dt><dd>{availableQuantity} cuốn</dd></div>}
              {isTradeListing && <div><dt>Đổi bằng điểm</dt><dd>{tradePoints} điểm</dd></div>}
              {isOwner && <div><dt>Phí duy trì (2%)</dt><dd>{currency.format(maintenanceFee)}</dd></div>}
            </dl>
            <section className="book-detail-section"><h2>Tóm tắt</h2><p>{book.summary || 'Người đăng chưa bổ sung tóm tắt cho cuốn sách này.'}</p></section>
            {damage && <section className="book-detail-section"><h2>Tình trạng vật lý</h2><p>{damage}</p></section>}
            {canBuy && !orderOpen && (
              isTradeListing ? (
                <div className="account-actions book-purchase-actions">
                  <button className="button button-primary button-large" disabled={Boolean(isOwner) || !tradePoints || (user && user.bookCredits < tradePoints)} onClick={() => openOrder('POINTS')}>Đổi bằng {tradePoints} điểm</button>
                  <button className="button button-quiet button-large" disabled={Boolean(isOwner)} onClick={() => openOrder('CASH')}>Mua bằng tiền · COD</button>
                </div>
              ) : (
                <button className="button button-primary button-large" disabled={Boolean(isOwner)} onClick={() => openOrder('MIXED')}>Mua sách · Thanh toán COD</button>
              )
            )}
            {isOwner && <p className="form-hint">Đây là sách bạn đăng. Khách khác có thể đổi sách này bằng điểm hoặc trả giá tiền mặt. Phí duy trì chỉ hiển thị với bạn và quản trị viên.</p>}
            {isTradeListing && !isOwner && user && user.bookCredits < tradePoints && <p className="form-hint">Bạn hiện có {user.bookCredits || 0} điểm; cần {tradePoints} điểm để đổi. Bạn vẫn có thể mua bằng tiền mặt.</p>}
            {isTradeListing && !canBuy && !isOwner && <p className="status-pill">Sách này không còn sẵn sàng để đặt.</p>}
            {isSaleListing && !canBuy && !isOwner && <p className="status-pill">Sách hiện đã hết hàng hoặc không còn sẵn sàng để mua.</p>}
            {orderOpen && (
              <form className="order-form" onSubmit={submitOrder}>
                <h2>{isTradeListing ? paymentMethod === 'POINTS' ? 'Đổi sách bằng điểm' : 'Mua sách bằng tiền mặt' : 'Thông tin nhận sách'}</h2>
                {isSaleListing && <label>Số lượng mua<input type="number" min="1" max={availableQuantity} step="1" value={quantity} onChange={(event) => {
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
                }} required /></label>}
                <label>Người nhận<input name="recipientName" required maxLength="100" defaultValue={user?.name || ''} /></label>
                <label>Số điện thoại<input name="recipientPhone" type="tel" required maxLength="20" /></label>
                <label>Địa chỉ<input name="address" required maxLength="300" defaultValue={user?.address || ''} /></label>
                {isSaleListing && <label>Dùng điểm (1 điểm = 1.000đ; tối đa {maxUsablePoints})<input type="number" min="0" max={maxUsablePoints} step="1" value={pointsUsed} onChange={(event) => {
                  const enteredPoints = Number(event.target.value);
                  if (event.target.value === '') {
                    setPointsUsed('');
                  } else if (Number.isFinite(enteredPoints)) {
                    setPointsUsed(String(Math.min(maxUsablePoints, Math.max(0, Math.floor(enteredPoints)))));
                  }
                }} /></label>}
                {isTradeListing && paymentMethod === 'POINTS' && <p className="order-total">Điểm sử dụng: <strong>{tradePoints} điểm</strong> · Điểm sẽ được trừ khi đặt đơn.</p>}
                {isTradeListing && paymentMethod === 'CASH' && <p className="order-total">Giá người đăng chọn: <strong>{currency.format(salePrice)}</strong></p>}
                {(!isTradeListing || paymentMethod === 'CASH') && <p className="order-total">Thu COD: <strong>{currency.format(cashDue)}</strong></p>}
                <div className="account-actions"><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Đang tạo đơn...' : 'Xác nhận mua'}</button><button className="button button-quiet" type="button" onClick={() => setOrderOpen(false)}>Hủy</button></div>
              </form>
            )}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default BookDetailsPage;
