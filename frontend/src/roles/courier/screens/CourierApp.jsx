import React, { useEffect, useState } from 'react';
import {
  claimCourierDelivery,
  courierLogin,
  fetchCourierDeliveries,
  fetchCourierDeliveryProof,
  getMe,
  startCourierDelivery,
  uploadCourierProof
} from '../../../services/api.js';
import ChatPanel from '../../../shared/ChatPanel.jsx';
import { SiteFooter, SiteHeader } from '../../../shared/SiteLayout.jsx';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

function CourierApp() {
  const [courier, setCourier] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeDeliveryId, setActiveDeliveryId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshDeliveries = async () => {
    const { data } = await fetchCourierDeliveries();
    setDeliveries(data.data);
  };

  useEffect(() => {
    if (!localStorage.getItem('bookswap-courier-token')) return;
    getMe()
      .then(({ data }) => {
        if (data.data.role !== 'COURIER') throw new Error('Tài khoản này không có quyền vận chuyển.');
        setCourier(data.data);
      })
      .catch((requestError) => {
        localStorage.removeItem('bookswap-courier-token');
        setError(requestError.response?.data?.message || requestError.message || 'Phiên vận chuyển đã hết hạn.');
      });
  }, []);

  useEffect(() => {
    if (!courier) return;
    let active = true;
    setLoading(true);
    fetchCourierDeliveries()
      .then(({ data }) => {
        if (active) setDeliveries(data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không tải được danh sách đơn.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [courier]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setLoginLoading(true);
    setError('');
    try {
      const { data } = await courierLogin(Object.fromEntries(new FormData(form).entries()));
      localStorage.setItem('bookswap-courier-token', data.token);
      setCourier(data.data);
      form.reset();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể đăng nhập trang vận chuyển.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleStart = async (delivery) => {
    setActiveDeliveryId(delivery._id);
    setError('');
    try {
      const { data } = await startCourierDelivery(delivery._id);
      setNotice(data.message);
      await refreshDeliveries();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể cập nhật đơn vận chuyển.');
    } finally {
      setActiveDeliveryId('');
    }
  };

  const handleClaim = async (delivery) => {
    setActiveDeliveryId(delivery._id);
    setError('');
    setNotice('');
    try {
      const { data } = await claimCourierDelivery(delivery._id);
      setNotice(data.message);
      try {
        await refreshDeliveries();
      } catch (refreshError) {
        setError(`Đã nhận đơn nhưng không thể làm mới danh sách: ${refreshError.response?.data?.message || 'lỗi kết nối.'}`);
      }
    } catch (requestError) {
      const claimError = requestError.response?.data?.message || 'Không thể nhận đơn vận chuyển.';
      setError(claimError);
      try {
        await refreshDeliveries();
      } catch (refreshError) {
        setError(`${claimError} Danh sách đơn cũng chưa thể làm mới: ${refreshError.response?.data?.message || 'lỗi kết nối.'}`);
      }
    } finally {
      setActiveDeliveryId('');
    }
  };

  const handleConfirmDelivery = async (event, delivery) => {
    event.preventDefault();
    const form = event.currentTarget;
    const proof = form.elements.proof.files[0];
    if (!proof) {
      setError('Vui lòng chọn ảnh xác nhận giao sách.');
      return;
    }
    const codCollected = Boolean(form.elements.codCollected?.checked);
    if (delivery.orderType === 'PURCHASE' && !codCollected) {
      setError('Vui lòng xác nhận đã hoàn tất thanh toán COD.');
      return;
    }
    setActiveDeliveryId(delivery._id);
    setError('');
    setNotice('');
    try {
      const { data } = await uploadCourierProof(delivery._id, proof, codCollected);
      setNotice(data.message);
      await refreshDeliveries();
      form.reset();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể gửi ảnh xác nhận.');
    } finally {
      setActiveDeliveryId('');
    }
  };

  const signOut = () => {
    localStorage.removeItem('bookswap-courier-token');
    setCourier(null);
    setDeliveries([]);
    setNotice('');
  };

  if (!courier) {
    return (
      <main className="admin-login-page">
        <form className="auth-modal admin-login-card" onSubmit={handleLogin}>
          <a className="brand admin-brand" href="/"><span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a>
          <p className="eyebrow">BOOKSWAP DELIVERY</p>
          <h1>Đăng nhập vận chuyển</h1>
          {error && <div className="notice notice-error">{error}</div>}
          <label className="admin-login-label">Email nhân viên<input name="email" type="email" required autoComplete="username" /></label>
          <label className="admin-login-label">Mật khẩu<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="button button-primary button-full" type="submit" disabled={loginLoading}>{loginLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
          <a className="admin-back-link" href="/">← Quay lại BookSwap</a>
        </form>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <SiteHeader className="admin-header" badge="VẬN CHUYỂN">
        <span className="welcome">Xin chào, <strong>{courier.name}</strong></span>
        <button className="button button-quiet" onClick={signOut}>Đăng xuất</button>
      </SiteHeader>
      <main className="admin-main">
        <div className="section-heading">
          <div><p className="eyebrow">KHU VỰC NHÂN VIÊN</p><h1>Đơn vận chuyển</h1><p className="muted">Chọn đơn đang chờ nhận, cập nhật trạng thái và gửi ảnh xác nhận sau khi giao.</p></div>
          <button className="button button-quiet refresh-button" type="button" onClick={() => refreshDeliveries().catch((requestError) => setError(requestError.response?.data?.message || 'Không tải được danh sách đơn.'))} aria-label="Làm mới danh sách" title="Làm mới danh sách">⟳</button>
        </div>
        {error && <div className="notice notice-error">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo">×</button></div>}
        {notice && <div className="notice notice-success">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
        {loading ? <div className="loading-state">Đang tải đơn vận chuyển...</div> : deliveries.length === 0 ? (
          <div className="empty-state"><h3>Chưa có đơn vận chuyển</h3><p>Đơn mới sẽ xuất hiện tại đây khi khách đặt sách.</p></div>
        ) : (
          <section className="courier-delivery-list">
            {deliveries.map((delivery) => <CourierDeliveryCard key={delivery._id} delivery={delivery} active={activeDeliveryId === delivery._id} onClaim={handleClaim} onStart={handleStart} onSubmit={handleConfirmDelivery} />)}
          </section>
        )}
      </main>
      <ChatPanel user={courier} role="COURIER" />
      <SiteFooter />
    </div>
  );
}

function CourierDeliveryCard({ delivery, active, onClaim, onStart, onSubmit }) {
  const [proofUrl, setProofUrl] = useState('');
  const statusLabels = { PENDING_ASSIGNMENT: 'Đang chờ nhân viên nhận', ASSIGNED: 'Chờ lấy/giao', IN_TRANSIT: 'Đang vận chuyển', DELIVERED: 'Đã xác nhận giao — chờ admin duyệt', COMPLETED: 'Hoàn tất' };

  useEffect(() => {
    if (!delivery.hasProof) return undefined;
    let activeRequest = true;
    let objectUrl = '';
    fetchCourierDeliveryProof(delivery._id)
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (activeRequest) setProofUrl(objectUrl);
      })
      .catch(() => {
        if (activeRequest) setProofUrl('');
      });
    return () => {
      activeRequest = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [delivery._id, delivery.hasProof]);

  return (
    <article className="courier-delivery-card">
      <div className="courier-order-heading"><div><p className="eyebrow">ĐƠN #{delivery._id.slice(-6).toUpperCase()}</p><h2>{delivery.book?.title || 'Sách'}</h2><p className="muted">{delivery.book?.author || 'Chưa rõ tác giả'} · {currency.format(delivery.book?.coverPrice || 0)}</p></div><span className="status-pill">{statusLabels[delivery.status] || delivery.status}</span></div>
      <div className="courier-order-details">
        <p><strong>Người nhận:</strong> {delivery.recipientName}</p>
        <p><strong>Điện thoại:</strong> <a href={`tel:${delivery.recipientPhone}`}>{delivery.recipientPhone}</a></p>
        <p><strong>Địa chỉ:</strong> {delivery.address}</p>
        {delivery.orderType === 'PURCHASE' && <p><strong>Số lượng:</strong> {delivery.quantity || 1} cuốn · <strong>Thu COD:</strong> {currency.format(delivery.cashToCollect || 0)} ({delivery.pointsUsed || 0} điểm đã trừ)</p>}
      </div>
      {proofUrl && <a className="courier-proof-preview" href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt="Ảnh xác nhận giao sách" />Xem ảnh đã gửi</a>}
      {delivery.status === 'PENDING_ASSIGNMENT' && <button className="button button-primary" type="button" onClick={() => onClaim(delivery)} disabled={active}>{active ? 'Đang nhận đơn...' : 'Nhận đơn này'}</button>}
      {delivery.status === 'ASSIGNED' && <button className="button button-primary" type="button" onClick={() => onStart(delivery)} disabled={active}>{active ? 'Đang cập nhật...' : 'Bắt đầu vận chuyển'}</button>}
      {['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status) && (
        <form className="courier-proof-form" onSubmit={(event) => onSubmit(event, delivery)}>
          <label>Ảnh xác nhận giao (JPEG, PNG hoặc WebP, tối đa 5 MB)<input type="file" name="proof" accept="image/jpeg,image/png,image/webp" capture="environment" required /></label>
          {delivery.orderType === 'PURCHASE' && <label className="cod-confirm-label"><input type="checkbox" name="codCollected" required />{delivery.cashToCollect > 0 ? `Tôi đã thu đủ ${currency.format(delivery.cashToCollect)} COD` : 'Đơn đã được thanh toán toàn bộ bằng điểm'}</label>}
          <button className="button button-primary" type="submit" disabled={active}>{active ? 'Đang gửi...' : 'Gửi ảnh và xác nhận đã giao'}</button>
        </form>
      )}
      {delivery.status === 'DELIVERED' && <p className="form-hint">Đã ghi nhận giao dịch hoàn tất. Admin sẽ kiểm tra ảnh và xác nhận phí duy trì.</p>}
      {delivery.status === 'COMPLETED' && <p className="form-hint">Admin đã duyệt ảnh và ghi nhận phí cho đơn này.</p>}
    </article>
  );
}

export default CourierApp;
