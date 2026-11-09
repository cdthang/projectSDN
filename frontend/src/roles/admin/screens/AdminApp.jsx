import React, { useEffect, useState } from 'react';
import {
  adminLogin,
  collectAdminDeliveryFee,
  createAdminCourier,
  fetchAdminBooks,
  fetchAdminCouriers,
  fetchAdminDeliveries,
  fetchAdminDeliveryProof,
  fetchAdminDashboard,
  fetchAdminTransactions,
  fetchAdminUsers,
  getMe,
  setAdminCourierStatus
} from '../../../services/api.js';
import ChatPanel from '../../../shared/ChatPanel.jsx';
import { SiteFooter, SiteHeader } from '../../../shared/SiteLayout.jsx';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

const damageLabels = { LOW: 'Nhẹ', MEDIUM: 'Trung bình', HIGH: 'Cao' };

function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [books, setBooks] = useState([]);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [damageFilter, setDamageFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [completingBookId, setCompletingBookId] = useState('');
  const [submittingForm, setSubmittingForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailRecord, setDetailRecord] = useState(null);

  const refreshAdminData = async () => {
    const [dashboardResult, usersResult, transactionsResult, couriersResult, deliveriesResult] = await Promise.all([
      fetchAdminDashboard(),
      fetchAdminUsers(),
      fetchAdminTransactions(),
      fetchAdminCouriers(),
      fetchAdminDeliveries()
    ]);
    setDashboard(dashboardResult.data.data);
    setUsers(usersResult.data.data);
    setTransactions(transactionsResult.data.data);
    setCouriers(couriersResult.data.data);
    setDeliveries(deliveriesResult.data.data);
  };

  useEffect(() => {
    if (!localStorage.getItem('bookswap-admin-token')) return;
    getMe()
      .then(({ data }) => {
        if (data.data.role !== 'ADMIN') throw new Error('Tài khoản không có quyền quản trị.');
        setAdmin(data.data);
      })
      .catch((requestError) => {
        localStorage.removeItem('bookswap-admin-token');
        setError(requestError.response?.data?.message || requestError.message || 'Phiên quản trị đã hết hạn.');
      });
  }, []);

  useEffect(() => {
    if (!admin) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      refreshAdminData(),
      fetchAdminBooks()
    ])
      .then(([, booksResult]) => {
        if (active) setBooks(booksResult.data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không tải được dữ liệu quản trị.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [admin]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const details = Object.fromEntries(new FormData(form).entries());
    setLoginLoading(true);
    setError('');
    try {
      const { data } = await adminLogin(details);
      localStorage.setItem('bookswap-admin-token', data.token);
      setAdmin(data.data);
      setNotice('Đăng nhập quản trị thành công.');
      form.reset();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể đăng nhập trang quản trị.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCollectFee = async (delivery) => {
    const expectedFee = delivery.book?.maintenanceFee ?? Math.round(((delivery.book?.coverPrice || 0) * 2) / 100);
    if (!window.confirm(`Đã kiểm tra ảnh giao hàng/COD và xác nhận ghi nhận ${currency.format(expectedFee)} phí duy trì cho đơn "${delivery.book?.title}"? Điểm sẽ được tính theo giá trị AI và mức hư hại.`)) return;
    setCompletingBookId(delivery._id);
    setError('');
    setNotice('');
    try {
      const { data } = await collectAdminDeliveryFee(delivery._id);
      setNotice(data.message);
      await refreshAdminData();
      const { data: booksResult } = await fetchAdminBooks();
      setBooks(booksResult.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể ghi nhận phí vận chuyển.');
    } finally {
      setCompletingBookId('');
    }
  };

  const handleCreateCourier = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmittingForm(true);
    setError('');
    try {
      await createAdminCourier(Object.fromEntries(new FormData(form).entries()));
      setNotice('Đã tạo tài khoản nhân viên vận chuyển.');
      form.reset();
      await refreshAdminData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tạo tài khoản nhân viên.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([refreshAdminData(), fetchAdminBooks().then(({ data }) => setBooks(data.data))]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể làm mới dữ liệu quản trị.');
    } finally {
      setLoading(false);
    }
  };

  const handleCourierStatus = async (courier) => {
    try {
      const { data } = await setAdminCourierStatus(courier._id, courier.isActive === false);
      setCouriers((current) => current.map((item) => item._id === courier._id ? data.data : item));
      setNotice(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể cập nhật trạng thái nhân viên.');
    }
  };

  const signOut = () => {
    localStorage.removeItem('bookswap-admin-token');
    setAdmin(null);
    setDashboard(null);
    setBooks([]);
    setUsers([]);
    setTransactions([]);
    setCouriers([]);
    setDeliveries([]);
    setActiveTab('overview');
    setNotice('');
  };

  if (!admin) {
    return (
      <main className="admin-login-page">
        <form className="auth-modal admin-login-card" onSubmit={handleLogin}>
          <a className="brand admin-brand" href="/"> <span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a>
          <p className="eyebrow">KHU VỰC QUẢN TRỊ</p>
          <h1>Đăng nhập admin</h1>
          {error && <div className="notice notice-error">{error}</div>}
          <label className="admin-login-label">Tài khoản<input name="username" required autoComplete="username" placeholder="admin" /></label>
          <label className="admin-login-label">Mật khẩu<input name="password" type="password" required autoComplete="current-password" placeholder="Mật khẩu quản trị" /></label>
          <button className="button button-primary button-full" type="submit" disabled={loginLoading}>{loginLoading ? 'Đang đăng nhập...' : 'Đăng nhập quản trị'}</button>
          <a className="admin-back-link" href="/">← Quay lại BookSwap</a>
        </form>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <SiteHeader className="admin-header" badge="ADMIN">
        <span className="welcome">Xin chào, <strong>{admin.name}</strong></span>
        <button className="button button-quiet" onClick={signOut}>Đăng xuất</button>
      </SiteHeader>
      <main className="admin-main">
        <div className="section-heading">
          <div><p className="eyebrow">BOOKSWAP ENGINE</p><h1>Bảng điều khiển</h1><p className="muted">Theo dõi cộng đồng, đơn COD, doanh số và phí duy trì.</p></div>
          <button className="button button-quiet refresh-button" type="button" onClick={handleRefresh} disabled={loading} aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu">⟳</button>
        </div>
        <nav className="admin-nav" aria-label="Điều hướng quản trị">
          {[['overview', 'Tổng quan'], ['books', 'Sách'], ['users', 'Người dùng'], ['deliveries', 'Đơn vận chuyển'], ['couriers', 'Nhân viên'], ['transactions', 'Giao dịch']].map(([tab, label]) => (
            <button key={tab} className={activeTab === tab ? 'admin-nav-button active' : 'admin-nav-button'} onClick={() => setActiveTab(tab)}>{label}</button>
          ))}
        </nav>
        {error && <div className="notice notice-error">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo">×</button></div>}
        {notice && <div className="notice notice-success">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
        {loading && !dashboard ? <div className="loading-state">Đang tải dữ liệu quản trị...</div> : (
          <>
            {activeTab === 'overview' && dashboard && (
              <>
                <section className="admin-stat-grid">
                  <StatCard label="Tổng số sách" value={dashboard.totalBooks} detail={`${dashboard.availableBooks} sách đang sẵn sàng`} />
                  <StatCard label="Người dùng" value={dashboard.totalUsers} detail="Tài khoản thành viên" />
                  <StatCard label="Sách hư hại cao" value={dashboard.highDamageBooks} detail="Sách đang đăng, cần lưu ý" />
                  <StatCard label="Giao dịch hoàn tất" value={dashboard.completedTrades} detail="Sách được admin xác nhận" />
                  <StatCard label="Phí đã ghi nhận" value={currency.format(dashboard.collectedFees)} detail="2% giá bìa, người đăng chịu" />
                  <StatCard label="Phí dự kiến" value={currency.format(dashboard.expectedFees)} detail="Sách đang đăng và đơn chờ duyệt" />
                  <StatCard label="Giá trị đơn đã hoàn tất" value={currency.format(dashboard.completedSaleValue || 0)} detail="Tổng giá bán các đơn mua hoàn tất" />
                  <StatCard label="COD chưa thu" value={currency.format(dashboard.pendingCodAmount || 0)} detail="Các đơn mua chưa xác nhận đã thu tiền" />
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><h2>Sách hư hại cao cần lưu ý</h2><button className="text-button" onClick={() => { setDamageFilter('HIGH'); setActiveTab('books'); }}>Xem danh sách</button></div>
                  <AdminBookTable books={books.filter((book) => book.damageLevel === 'HIGH').slice(0, 5)} onView={(book) => setDetailRecord({ type: 'book', record: book })} />
                </section>
              </>
            )}
            {activeTab === 'books' && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><h2>Quản lý sách</h2><p className="muted">{books.length} bản ghi trong bộ lọc</p></div>
                  <label className="admin-filter">Lọc hư hại<select value={damageFilter} onChange={(event) => setDamageFilter(event.target.value)}><option value="">Tất cả mức độ</option><option value="LOW">Nhẹ</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option></select></label>
                </div>
                <AdminBookTable books={books.filter((book) => !damageFilter || book.damageLevel === damageFilter || (damageFilter === 'LOW' && !book.damageLevel))} onView={(book) => setDetailRecord({ type: 'book', record: book })} />
              </section>
            )}
            {activeTab === 'users' && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><h2>Thông tin người dùng</h2><p className="muted">{users.length} thành viên</p></div></div>
                <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tên</th><th>Email</th><th>Địa chỉ</th><th>Số sách</th><th>Điểm</th><th>Chi tiết</th></tr></thead><tbody>
                  {users.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.address}</td><td>{user.bookCount}</td><td>{user.bookCredits}</td><td><button className="text-button" onClick={() => setDetailRecord({ type: 'user', record: user })}>Xem</button></td></tr>)}
                </tbody></table>{users.length === 0 && <p className="admin-empty">Chưa có người dùng.</p>}</div>
              </section>
            )}
            {activeTab === 'transactions' && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><h2>Giao dịch hoàn tất</h2><p className="muted">Nhân viên xác nhận giao; admin duyệt ảnh, ghi phí và cộng điểm theo giá trị AI cùng mức hư hại.</p></div></div>
                <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Sách</th><th>Người đăng</th><th>Giá bìa</th><th>Phí đã thu</th><th>Điểm đã cộng</th><th>Admin xác nhận</th><th>Thời gian</th><th>Chi tiết</th></tr></thead><tbody>
                  {transactions.map((transaction) => <tr key={transaction._id}><td>{transaction.book?.title || 'Sách đã xóa'}</td><td>{transaction.owner?.name || '—'}</td><td>{currency.format(transaction.coverValue)}</td><td>{transaction.feeCollectedAt ? currency.format(transaction.feeCollected) : 'Chờ admin duyệt'}</td><td>{transaction.creditsAwarded || 0}</td><td>{transaction.completedBy?.name || '—'}</td><td>{new Date(transaction.completedAt).toLocaleString('vi-VN')}</td><td><button className="text-button" onClick={() => setDetailRecord({ type: 'transaction', record: transaction })}>Xem</button></td></tr>)}
                </tbody></table>{transactions.length === 0 && <p className="admin-empty">Chưa có giao dịch hoàn tất.</p>}</div>
              </section>
            )}
            {activeTab === 'deliveries' && (
              <section className="admin-panel">
                  <div className="admin-panel-heading"><div><h2>Đơn vận chuyển</h2><p className="muted">Chỉ duyệt phí sau khi nhân viên tải ảnh xác nhận.</p></div></div>
                  <DeliveryTable deliveries={deliveries} onCollect={handleCollectFee} loadingId={completingBookId} onView={(delivery) => setDetailRecord({ type: 'delivery', record: delivery })} />
                </section>
            )}
            {activeTab === 'couriers' && (
              <>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><h2>Tạo tài khoản nhân viên</h2><p className="muted">Nhân viên đăng nhập tại trang vận chuyển riêng.</p></div></div>
                  <form className="form-grid admin-create-form" onSubmit={handleCreateCourier}>
                    <label>Họ tên<input name="name" required maxLength="100" /></label>
                    <label>Email đăng nhập<input name="email" type="email" required /></label>
                    <label>Số điện thoại<input name="phone" type="tel" required /></label>
                    <label>Mật khẩu tạm thời<input name="password" type="password" minLength="8" required /></label>
                    <label>Địa chỉ<input name="address" maxLength="200" required /></label>
                    <button className="button button-primary form-submit" type="submit" disabled={submittingForm}>{submittingForm ? 'Đang tạo...' : 'Tạo nhân viên'}</button>
                  </form>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><h2>Nhân viên vận chuyển</h2><p className="muted">Quản lý trạng thái tài khoản; nhắn tin và gọi thoại nội bộ qua khung chat.</p></div></div>
                  <CourierTable couriers={couriers} onView={(courier) => setDetailRecord({ type: 'courier', record: courier })} onToggle={handleCourierStatus} />
                </section>
              </>
            )}
          </>
        )}
      </main>
      {detailRecord && <DetailsDialog detail={detailRecord} onClose={() => setDetailRecord(null)} />}
      <ChatPanel user={admin} role="ADMIN" />
      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return <article className="admin-stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function AdminBookTable({ books, onView }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Sách</th><th>Người đăng</th><th>Giá bìa</th><th>Hư hại</th><th>Phí 2%</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead>
        <tbody>
          {books.map((book) => <tr key={book._id}>
            <td><strong>{book.title}</strong><small>{book.author || 'Chưa rõ tác giả'} · {book.listingMode === 'SALE' ? `Bán · còn ${book.stockQuantity ?? 1}` : 'Trao đổi'}</small></td>
            <td>{book.owner?.name || '—'}<small>{book.owner?.email || ''}</small></td>
            <td>{currency.format(book.coverPrice || 0)}</td>
            <td><span className={`damage-pill damage-${book.damageLevel || 'LOW'}`}>{damageLabels[book.damageLevel] || 'Nhẹ'}</span></td>
            <td>{currency.format(book.maintenanceFee ?? Math.round((book.coverPrice * 2) / 100))}</td>
            <td>{book.status === 'TRADED' ? 'Đã trao đổi' : book.status === 'OUT_OF_STOCK' ? 'Hết hàng' : book.status === 'AVAILABLE' ? 'Đang đăng' : 'Đang giữ chỗ'}</td>
            <td><button className="text-button" onClick={() => onView(book)}>Xem</button></td>
          </tr>)}
        </tbody>
      </table>
      {books.length === 0 && <p className="admin-empty">Không có sách phù hợp với bộ lọc.</p>}
    </div>
  );
}

function DeliveryProof({ deliveryId }) {
  const [proofUrl, setProofUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    fetchAdminDeliveryProof(deliveryId)
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (active) setProofUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('Không tải được ảnh.');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [deliveryId]);

  if (error) return <span className="proof-error">{error}</span>;
  if (!proofUrl) return <span className="muted">Đang tải ảnh...</span>;
  return <a className="proof-link" href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt="Ảnh xác nhận giao sách" />Xem ảnh</a>;
}

function DeliveryTable({ deliveries, onCollect, loadingId, onView }) {
  const statusLabels = { PENDING_ASSIGNMENT: 'Chờ shipper nhận đơn', ASSIGNED: 'Đã có shipper nhận', IN_TRANSIT: 'Đang giao', DELIVERED: 'Đã giao — chờ duyệt ảnh', COMPLETED: 'Hoàn tất, đã ghi phí' };
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Sách / người đăng</th><th>Người nhận</th><th>Nhân viên</th><th>Trạng thái / COD</th><th>Bằng chứng</th><th>Phí</th><th>Thao tác</th><th>Chi tiết</th></tr></thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery._id}>
              <td><strong>{delivery.book?.title || 'Sách đã xóa'}</strong><small>{delivery.orderType === 'PURCHASE' ? `Đơn mua COD · ${delivery.quantity || 1} cuốn` : 'Đổi sách'} · {delivery.book?.owner?.name || '—'} · {delivery.book?.owner?.email || ''}</small></td>
              <td>{delivery.recipientName}<small><a href={`tel:${delivery.recipientPhone}`}>{delivery.recipientPhone}</a><br />{delivery.address}</small></td>
              <td>{delivery.courier?.name || '—'}<small>{delivery.courier?.email || ''}</small></td>
              <td>{statusLabels[delivery.status] || delivery.status}{delivery.orderType === 'PURCHASE' && <small>COD: {currency.format(delivery.cashToCollect || 0)} · {delivery.pointsUsed || 0} điểm · {delivery.codCollected ? 'đã thu' : 'chưa thu'}</small>}</td>
              <td>{delivery.hasProof ? <DeliveryProof deliveryId={delivery._id} /> : 'Chưa có ảnh'}</td>
              <td>{currency.format(delivery.book?.maintenanceFee ?? Math.round(((delivery.book?.coverPrice || 0) * 2) / 100))}</td>
              <td>{delivery.status === 'DELIVERED'
                ? <button className="button button-primary admin-complete" onClick={() => onCollect(delivery)} disabled={loadingId === delivery._id}>{loadingId === delivery._id ? 'Đang lưu...' : 'Duyệt & ghi phí'}</button>
                : delivery.status === 'COMPLETED' ? 'Đã ghi nhận' : delivery.status === 'PENDING_ASSIGNMENT' ? 'Chờ shipper nhận' : 'Nhân viên đang xử lý'}</td>
              <td><button className="text-button" onClick={() => onView(delivery)}>Xem</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {deliveries.length === 0 && <p className="admin-empty">Chưa có đơn vận chuyển.</p>}
    </div>
  );
}

function CourierTable({ couriers, onView, onToggle }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Nhân viên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{couriers.map((courier) => (
          <tr key={courier._id}>
            <td>{courier.name}</td><td>{courier.email}</td><td>{courier.phone || '—'}</td>
            <td>{courier.isActive === false ? 'Đã khóa' : 'Đang hoạt động'}</td>
            <td className="admin-row-actions">
              <button className="text-button" onClick={() => onView(courier)}>Chi tiết</button>
              <button className="text-button" onClick={() => onToggle(courier)}>{courier.isActive === false ? 'Mở khóa' : 'Khóa tài khoản'}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {couriers.length === 0 && <p className="admin-empty">Chưa có nhân viên vận chuyển.</p>}
    </div>
  );
}

function DetailsDialog({ detail, onClose }) {
  const { type, record } = detail;
  const detailRows = type === 'user' ? [
    ['Tên', record.name], ['Email', record.email], ['Địa chỉ', record.address],
    ['Số sách', record.bookCount], ['Điểm hiện có', record.bookCredits], ['Ngày tham gia', record.createdAt]
  ] : type === 'book' ? [
    ['Tên sách', record.title], ['Tác giả', record.author], ['Tóm tắt', record.summary],
    ['Người đăng', record.owner?.name], ['Email người đăng', record.owner?.email],
    ['Giá bìa', currency.format(record.coverPrice || 0)], ['Giá đăng bán', currency.format(record.salePrice || 0)],
    ['Tồn kho', record.stockQuantity], ['Hình thức', record.listingMode === 'SALE' ? 'Đăng bán' : 'Trao đổi'],
    ['Tình trạng', record.condition], ['Hư hại', damageLabels[record.damageLevel] || 'Không yêu cầu'],
    ['Mô tả hư hại', record.damageNotes], ['Phí duy trì', currency.format(record.maintenanceFee || 0)],
    ['Trạng thái', record.status], ['Ngày đăng', record.createdAt]
  ] : type === 'delivery' ? [
    ['Mã đơn', record._id], ['Loại đơn', record.orderType], ['Sách', record.book?.title],
    ['Người đăng', record.book?.owner?.name], ['Người mua', record.buyer?.name],
    ['Người nhận', record.recipientName], ['Điện thoại nhận', record.recipientPhone],
    ['Địa chỉ', record.address], ['Nhân viên', record.courier?.name],
    ['Trạng thái', record.status], ['Số lượng', record.quantity || 1],
    ['Giá đơn', currency.format((record.salePrice || 0) * (record.quantity || 1))],
    ['Điểm đã dùng', record.pointsUsed], ['COD cần thu', currency.format(record.cashToCollect || 0)],
    ['COD đã thu', record.codCollected ? 'Có' : 'Chưa'], ['Có ảnh xác nhận', record.hasProof ? 'Có' : 'Chưa']
  ] : type === 'courier' ? [
    ['Tên', record.name], ['Email', record.email], ['Điện thoại', record.phone],
    ['Địa chỉ', record.address], ['Trạng thái', record.isActive === false ? 'Đã khóa' : 'Đang hoạt động'],
    ['Ngày tạo', record.createdAt]
  ] : [
    ['Mã giao dịch', record._id], ['Sách', record.book?.title], ['Người đăng', record.owner?.name],
    ['Giá trị sách', currency.format(record.coverValue || 0)], ['Tỷ lệ phí', `${record.feeRate || 0}%`],
    ['Phí đã thu', currency.format(record.feeCollected || 0)], ['Điểm đã cộng', record.creditsAwarded || 0],
    ['Ngày hoàn tất', record.completedAt], ['Admin xác nhận', record.completedBy?.name]
  ];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-modal admin-detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button className="modal-close" aria-label="Đóng" onClick={onClose}>×</button>
        <p className="eyebrow">BOOKSWAP · CHI TIẾT</p>
        <h2 id="detail-title">{type === 'user' ? 'Thông tin người dùng' : type === 'book' ? 'Thông tin sách' : type === 'delivery' ? 'Thông tin đơn vận chuyển' : type === 'courier' ? 'Thông tin nhân viên' : 'Thông tin giao dịch'}</h2>
        <dl className="detail-list">{detailRows.map(([label, value]) => value !== undefined && value !== null && value !== '' && (
          <div key={label}><dt>{label}</dt><dd>{label.includes('Ngày') ? new Date(value).toLocaleString('vi-VN') : value}</dd></div>
        ))}</dl>
      </section>
    </div>
  );
}

export default AdminApp;
