import React, { useEffect, useState } from 'react';
import { fetchMyOrder } from '../../../services/api.js';
import { SiteFooter, SiteHeader } from '../../../shared/SiteLayout.jsx';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

function OrderSuccessPage() {
  const orderId = window.location.pathname.split('/').filter(Boolean).at(-1);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyOrder(orderId)
      .then(({ data }) => setOrder(data.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Không tải được thông tin đơn hàng.'));
  }, [orderId]);

  return (
    <div className="app-shell">
      <SiteHeader><a className="button button-quiet" href="/">Về trang chủ</a></SiteHeader>
      <main className="order-success-page">
        {error ? <div className="notice notice-error">{error}</div> : !order ? (
          <p className="loading-state">Đang xác nhận đơn hàng...</p>
        ) : (
          <section className="order-success-card">
            <span className="order-success-icon" aria-hidden="true">✓</span>
            <p className="eyebrow">BOOKSWAP · ĐẶT HÀNG THÀNH CÔNG</p>
            <h1>Cảm ơn bạn đã mua sách!</h1>
            <p className="muted">Đơn hàng đã được ghi nhận. Nhân viên vận chuyển sẽ chọn nhận đơn để giao cho bạn.</p>
            <dl className="order-success-details">
              <div><dt>Mã đơn</dt><dd>#{order._id.slice(-6).toUpperCase()}</dd></div>
              <div><dt>Sách</dt><dd>{order.book?.title || 'Sách'}</dd></div>
              <div><dt>Số lượng</dt><dd>{order.quantity || 1}</dd></div>
              <div><dt>Tổng giá sách</dt><dd>{currency.format((order.salePrice || 0) * (order.quantity || 1))}</dd></div>
              <div><dt>Hình thức thanh toán</dt><dd>{order.paymentMethod === 'POINTS' ? 'Đổi bằng điểm' : order.paymentMethod === 'CASH' ? 'Tiền mặt khi nhận' : 'COD / điểm'}</dd></div>
              <div><dt>Đã dùng điểm</dt><dd>{order.pointsUsed || 0} điểm</dd></div>
              <div><dt>Thanh toán COD</dt><dd>{currency.format(order.cashToCollect || 0)}</dd></div>
            </dl>
            <div className="account-actions success-actions">
              <a className="button button-primary" href="/?tab=orders">Theo dõi đơn hàng</a>
              <a className="button button-quiet" href="/">Tiếp tục mua sách</a>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default OrderSuccessPage;
