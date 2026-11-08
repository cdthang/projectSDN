import React, { useEffect, useState } from 'react';
import TradeLoopView from './components/TradeLoopView.jsx';
import {
  analyzeBookImage,
  addBook,
  fetchBooks,
  fetchMyOrders,
  fetchUserBooks,
  getMe,
  login,
  register,
  resolveBookImageUrl
} from './services/api.js';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

const conditions = {
  NEW: 'Mới',
  LIKE_NEW: 'Như mới',
  USED: 'Đã qua sử dụng',
  OLD: 'Sách cũ'
};

function App() {
  const [user, setUser] = useState(null);
  const initialTab = new URLSearchParams(window.location.search).get('tab');
  const [activeTab, setActiveTab] = useState(['discover', 'my-books', 'trade-loops', 'orders'].includes(initialTab) ? initialTab : 'discover');
  const [books, setBooks] = useState([]);
  const [myBooks, setMyBooks] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [browseMode, setBrowseMode] = useState('SALE');
  const [bookType, setBookType] = useState('OWNED');
  const [listingMode, setListingMode] = useState('SALE');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('login') === '1') setAuthOpen(true);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('bookswap-token');
    if (!token) return;
    getMe()
      .then(({ data }) => setUser(data.data))
      .catch(() => {
        localStorage.removeItem('bookswap-token');
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      });
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingBooks(true);
    fetchBooks(search, browseMode)
      .then(({ data }) => {
        if (active) setBooks(data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không tải được danh sách sách.');
      })
      .finally(() => {
        if (active) setLoadingBooks(false);
      });
    return () => { active = false; };
  }, [search, browseMode]);

  useEffect(() => {
    if (!user) {
      setMyBooks([]);
      return;
    }
    fetchUserBooks(user.id)
      .then(({ data }) => setMyBooks(data.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Không tải được tủ sách.'));
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== 'orders') return;
    fetchMyOrders()
      .then(({ data }) => setMyOrders(data.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Không tải được đơn mua sách.'));
  }, [user, activeTab]);

  const handleAnalyzeBook = async (event) => {
    const form = event.currentTarget.form;
    const values = new FormData(form);
    const image = values.get('image');
    if (!(image instanceof File) || !image.size) {
      setError('Vui lòng chọn ảnh sách trước khi phân tích.');
      return;
    }
    if (!values.get('photoConsent')) {
      setError('Vui lòng đồng ý gửi ảnh sách đến Gemini để tiếp tục.');
      return;
    }
    setAnalysisLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const { data } = await analyzeBookImage(image, {
        title: values.get('title'),
        author: values.get('author'),
        coverPrice: values.get('coverPrice')
      });
      setAnalysis(data.data);
      setNotice('Gemini đã phân tích ảnh. Giá bán cuối cùng do bạn tự quyết định.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể phân tích ảnh sách.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setAuthLoading(true);
    setError('');
    const form = new FormData(formElement);
    const details = Object.fromEntries(form.entries());
    try {
      const action = authMode === 'register' ? register : login;
      const { data } = await action(details);
      localStorage.setItem('bookswap-token', data.token);
      setUser(data.data);
      setAuthOpen(false);
      setNotice(authMode === 'register' ? 'Chào mừng bạn đến với BookSwap!' : 'Đăng nhập thành công.');
      formElement.reset();
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      if (returnTo?.startsWith('/books/')) window.location.href = returnTo;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể xác thực tài khoản lúc này.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddBook = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setFormLoading(true);
    setError('');
    const form = new FormData(formElement);
    const details = Object.fromEntries(form.entries());
    try {
      let payload;
      if (details.type === 'OWNED') {
        const image = form.get('image');
        if (!(image instanceof File) || !image.size || !analysis) {
          setError('Hãy chọn ảnh và phân tích bằng Gemini trước khi đăng sách.');
          return;
        }
        form.set('analysisToken', analysis.analysisToken);
        payload = form;
      } else {
        delete details.image;
        delete details.photoConsent;
        payload = { ...details, coverPrice: Number(details.coverPrice) };
      }
      const { data: result } = await addBook(payload);
      setNotice(details.type === 'WISHLIST' ? 'Đã thêm sách vào danh sách mong muốn.' : 'Sách đã được thêm vào tủ của bạn.');
      setMyBooks((current) => [result.data, ...current]);
      formElement.reset();
      setAnalysis(null);
      setBookType('OWNED');
      setListingMode('SALE');
      try {
        const { data } = await fetchUserBooks(user.id);
        setMyBooks(data.data);
        if (details.type === 'OWNED') {
          const booksResult = await fetchBooks(search, browseMode);
          setBooks(booksResult.data.data);
        }
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Đã thêm sách, nhưng chưa thể làm mới danh sách. Vui lòng tải lại trang.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể thêm sách lúc này.');
    } finally {
      setFormLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('bookswap-token');
    setUser(null);
    setMyOrders([]);
    setActiveTab('discover');
    setNotice('Bạn đã đăng xuất.');
  };

  const showAuth = (mode = 'login') => {
    setAuthMode(mode);
    setAuthOpen(true);
    setError('');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setActiveTab('discover')}>
          <span className="brand-mark">b</span>
          <span>book<span className="brand-accent">swap</span></span>
        </a>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <button className={activeTab === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveTab('discover')}>Khám phá</button>
          {user && <button className={activeTab === 'my-books' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveTab('my-books')}>Tủ sách của tôi</button>}
          {user && <button className={activeTab === 'trade-loops' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveTab('trade-loops')}>Vòng đổi sách</button>}
          {user && <button className={activeTab === 'orders' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveTab('orders')}>Đơn mua</button>}
        </nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="welcome">Xin chào, <strong>{user.name}</strong> · {user.bookCredits || 0} điểm</span>
              <button className="button button-quiet" onClick={signOut}>Đăng xuất</button>
            </>
          ) : (
            <>
              <button className="button button-quiet" onClick={() => showAuth('login')}>Đăng nhập</button>
              <button className="button button-primary" onClick={() => showAuth('register')}>Tham gia miễn phí</button>
            </>
          )}
          <a className="button button-quiet admin-entry" href="/admin">Quản trị</a>
          <a className="button button-quiet courier-entry" href="/courier">Vận chuyển</a>
        </div>
      </header>

      <main>
        {activeTab === 'discover' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">MỘT CUỐN SÁCH — MỘT HÀNH TRÌNH MỚI</p>
                <h1>Trao sách cũ.<br /><span>Nhận câu chuyện mới.</span></h1>
                <p className="hero-description">Mua sách cũ thanh toán COD hoặc trao đổi bằng điểm. Những cuốn sách bạn đã đọc có thể tiếp tục hành trình cùng một người đọc mới.</p>
                <div className="hero-actions">
                  <button className="button button-primary button-large" onClick={() => user ? setActiveTab('my-books') : showAuth('register')}>Bắt đầu trao đổi <span aria-hidden="true">↗</span></button>
                  <a className="text-link" href="#book-list">Khám phá sách <span aria-hidden="true">↓</span></a>
                </div>
                <div className="hero-note"><span className="avatar-stack"><i>H</i><i>M</i><i>A</i></span><span>Cộng đồng đọc sách cùng sẻ chia</span></div>
              </div>
              <div className="hero-art" aria-label="Minh họa những cuốn sách">
                <div className="sun-shape" />
                <div className="floating-note note-one">Gửi đi yêu thương <span>♡</span></div>
                <div className="book-illustration book-back"><span>THE<br />GARDEN<br />OF WORDS</span></div>
                <div className="book-illustration book-mid"><span>NHỮNG<br />NGÀY<br />THƠ ẤU</span></div>
                <div className="book-illustration book-front"><span>THE<br />ALCHEMIST</span></div>
                <div className="floating-note note-two">Một vòng đổi,<br />thêm nhiều niềm vui <span>↗</span></div>
                <div className="leaf leaf-one" /><div className="leaf leaf-two" />
              </div>
            </section>

            <section className="feature-strip" aria-label="Lợi ích BookSwap">
              <div><span className="feature-icon">↔</span><span><strong>Giá bán minh bạch</strong><small>Thanh toán COD hoặc dùng điểm</small></span></div>
              <div><span className="feature-icon">◎</span><span><strong>Cộng đồng tử tế</strong><small>Kết nối những người yêu sách</small></span></div>
              <div><span className="feature-icon">✳</span><span><strong>Đọc xanh, sống xanh</strong><small>Kéo dài vòng đời mỗi cuốn sách</small></span></div>
            </section>

            <section className="book-section" id="book-list">
              <div className="section-heading browse-heading">
                <div><p className="eyebrow">TỪ TỦ SÁCH CỘNG ĐỒNG</p><h2>Đang chờ một người đọc mới</h2><p className="muted">Tìm cuốn sách tiếp theo trong hành trình của bạn.</p></div>
                <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên sách, tác giả..." aria-label="Tìm tên sách hoặc tác giả" /></label>
              </div>
                <div className="listing-mode-tabs" role="tablist" aria-label="Hình thức sách">
                  <button className={browseMode === 'SALE' ? 'listing-mode-tab active' : 'listing-mode-tab'} role="tab" aria-selected={browseMode === 'SALE'} onClick={() => setBrowseMode('SALE')}>Sách đăng bán</button>
                  <button className={browseMode === 'TRADE' ? 'listing-mode-tab active' : 'listing-mode-tab'} role="tab" aria-selected={browseMode === 'TRADE'} onClick={() => setBrowseMode('TRADE')}>Sách trao đổi</button>
                </div>
              {error && <div className="notice notice-error">{error}<button aria-label="Đóng thông báo" onClick={() => setError('')}>×</button></div>}
              {notice && <div className="notice notice-success">{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}
              {loadingBooks ? <div className="loading-state">Đang tìm sách phù hợp...</div> : books.length === 0 ? (
                <div className="empty-state"><span className="empty-icon">⌕</span><h3>{browseMode === 'SALE' ? 'Chưa có sách đăng bán' : 'Chưa có sách trao đổi'}</h3><p>Thử một từ khóa khác hoặc quay lại sau nhé.</p></div>
              ) : (
                <div className="book-grid">
                  {books.map((book, index) => <BookCard key={book._id} book={book} index={index} onSelect={(selected) => { window.location.href = `/books/${selected._id}`; }} />)}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'my-books' && user && (
          <section className="workspace-section">
            <div className="section-heading">
              <div><p className="eyebrow">GÓC NHỎ CỦA BẠN</p><h2>Tủ sách của tôi</h2><p className="muted">Chia sẻ sách bạn đã đọc hoặc lưu lại cuốn sách đang tìm.</p></div>
            </div>
            {notice && <div className="notice notice-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
            {error && <div className="notice notice-error">{error}<button onClick={() => setError('')}>×</button></div>}
            <form className="add-book-form" onSubmit={handleAddBook} onChange={(event) => {
              if (event.target.name === 'type') {
                setBookType(event.target.value);
                setAnalysis(null);
              }
              if (event.target.name === 'listingMode') setListingMode(event.target.value);
              if (['image', 'title', 'author', 'coverPrice'].includes(event.target.name)) setAnalysis(null);
            }}>
              <h3>Thêm sách vào tủ</h3>
              <div className="form-grid">
                <label>Tên sách<input name="title" required maxLength="120" placeholder="Ví dụ: Nhà giả kim" /></label>
                <label>Tác giả<input name="author" maxLength="100" placeholder="Tên tác giả" /></label>
                <label>Giá bìa (VNĐ)<input name="coverPrice" type="number" min="0" step="1000" required placeholder="120000" /></label>
                {bookType === 'OWNED' && listingMode === 'SALE' && <label>Giá bán bạn chọn (VNĐ)<input name="salePrice" type="number" min="0" step="1000" required placeholder="Chọn theo giá AI gợi ý" /></label>}
                {bookType === 'OWNED' && listingMode === 'SALE' && <label>Số lượng còn hàng<input name="stockQuantity" type="number" min="1" max="10000" step="1" required defaultValue="1" /></label>}
                <label>Tóm tắt<textarea name="summary" maxLength="1000" rows="2" placeholder="Giới thiệu ngắn về nội dung sách" /></label>
                <label>Tình trạng<select name="condition" defaultValue="LIKE_NEW"><option value="NEW">Mới</option><option value="LIKE_NEW">Như mới</option><option value="USED">Đã qua sử dụng</option><option value="OLD">Sách cũ</option></select></label>
                <label>Mức độ hư hại<select name="damageLevel" defaultValue="LOW"><option value="LOW">Nhẹ</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option></select></label>
                <label>Mô tả hư hại<textarea name="damageNotes" maxLength="300" rows="2" placeholder="Ví dụ: bìa sờn, có trang bị cong" /></label>
                <label>Loại sách<select name="type" value={bookType} onChange={(event) => { setBookType(event.target.value); setAnalysis(null); }}><option value="OWNED">Sách tôi đang có</option><option value="WISHLIST">Sách tôi muốn tìm</option></select></label>
                {bookType === 'OWNED' && <label>Hình thức<select name="listingMode" value={listingMode} onChange={(event) => setListingMode(event.target.value)}><option value="SALE">Đăng bán (có số lượng)</option><option value="TRADE">Đăng trao đổi</option></select></label>}
                {bookType === 'OWNED' && (
                  <>
                    <label>Ảnh chụp sách<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
                    <label className="consent-label"><input name="photoConsent" type="checkbox" required /> Tôi đồng ý gửi ảnh, tên sách, tác giả và giá bìa đến Gemini để phân tích.</label>
                    <button className="button button-quiet" type="button" onClick={handleAnalyzeBook} disabled={analysisLoading}>{analysisLoading ? 'Gemini đang phân tích...' : 'Phân tích ảnh bằng AI'}</button>
                    {analysis && <div className="ai-assessment"><strong>AI gợi ý: {currency.format(analysis.assessment.estimatedPrice)}</strong><p>{conditions[analysis.assessment.condition]} · Hư hại {analysis.assessment.damageLevel === 'LOW' ? 'nhẹ' : analysis.assessment.damageLevel === 'MEDIUM' ? 'trung bình' : 'cao'}. {analysis.assessment.damageNotes}</p><small>Độ tin cậy ước tính {Math.round(analysis.assessment.confidence * 100)}%. Giá đăng do bạn tự chọn. Ảnh có thể không thể hiện được tình trạng bên trong.</small></div>}
                  </>
                )}
                <button className="button button-primary form-submit" type="submit" disabled={formLoading}>{formLoading ? 'Đang lưu...' : '+ Thêm sách'}</button>
              </div>
              <p className="form-hint">Chọn đăng bán để nhập giá và số lượng tồn kho, hoặc đăng trao đổi như trước. Ảnh được gửi đến Gemini khi bạn yêu cầu phân tích. Phí duy trì 2% chỉ hiển thị với bạn và admin.</p>
            </form>
            <div className="section-heading owned-heading"><div><h3>Sách của bạn <span className="count-badge">{myBooks.length}</span></h3></div></div>
            {myBooks.length === 0 ? <div className="empty-state compact"><h3>Tủ sách đang đợi cuốn đầu tiên</h3><p>Hãy thêm một cuốn sách để bắt đầu sẻ chia.</p></div> : (
              <div className="book-grid">
                {myBooks.map((book, index) => <BookCard key={book._id} book={book} index={index} own onSelect={(selected) => { window.location.href = `/books/${selected._id}`; }} />)}
              </div>
            )}
          </section>
        )}

        {activeTab === 'trade-loops' && user && (
          <section className="workspace-section"><TradeLoopView /></section>
        )}
        {activeTab === 'orders' && user && (
          <section className="workspace-section">
            <div className="section-heading"><div><p className="eyebrow">MUA SẮM</p><h2>Đơn mua của tôi</h2><p className="muted">Số dư hiện tại: {user.bookCredits || 0} điểm · 1 điểm tương đương 1.000đ.</p></div></div>
            {error && <div className="notice notice-error">{error}<button onClick={() => setError('')}>×</button></div>}
            {notice && <div className="notice notice-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
            {myOrders.length === 0 ? <div className="empty-state"><h3>Bạn chưa có đơn mua</h3><a className="text-link" href="/">Khám phá sách</a></div> : (
              <div className="order-list">{myOrders.map((order) => <article className="order-card" key={order._id}>
                <div><p className="eyebrow">ĐƠN #{order._id.slice(-6).toUpperCase()}</p><h3>{order.book?.title || 'Sách'}</h3><p className="muted">Số lượng: {order.quantity || 1} cuốn · Trạng thái: {order.status === 'PENDING_ASSIGNMENT' ? 'Chờ admin phân công' : order.status === 'ASSIGNED' ? 'Đã phân công' : order.status === 'IN_TRANSIT' ? 'Đang giao' : order.status === 'DELIVERED' ? 'Chờ admin duyệt' : order.status === 'COMPLETED' ? 'Hoàn tất' : order.status}</p></div>
                <div><p>Đã dùng: <strong>{order.pointsUsed} điểm</strong></p><p>COD: <strong>{currency.format(order.cashToCollect || 0)}</strong></p></div>
              </article>)}</div>
            )}
          </section>
        )}
      </main>

      <footer className="footer"><a className="brand" href="#" onClick={() => setActiveTab('discover')}><span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a><p>Đọc thêm. Chia sẻ nhiều. Sống xanh hơn.</p><span>© 2025 BookSwap</span></footer>

      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close" aria-label="Đóng" onClick={() => setAuthOpen(false)}>×</button>
            <span className="brand-mark modal-mark">b</span>
            <p className="eyebrow">{authMode === 'register' ? 'CHÀO MỪNG BẠN ĐẾN VỚI CỘNG ĐỒNG' : 'RẤT VUI ĐƯỢC GẶP LẠI'}</p>
            <h2 id="auth-title">{authMode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập BookSwap'}</h2>
            <form onSubmit={handleAuth} className="auth-form">
              {authMode === 'register' && <label>Tên hiển thị<input name="name" required maxLength="80" autoComplete="name" placeholder="Tên của bạn" /></label>}
              <label>Email<input name="email" type="email" required autoComplete="email" placeholder="ban@email.com" /></label>
              <label>Mật khẩu<input name="password" type="password" required minLength="8" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} placeholder="Ít nhất 8 ký tự" /></label>
              {authMode === 'register' && <label>Địa chỉ nhận sách<input name="address" required maxLength="200" autoComplete="street-address" placeholder="Quận, thành phố" /></label>}
              {error && <div className="notice notice-error">{error}</div>}
              <button className="button button-primary button-full" type="submit" disabled={authLoading}>{authLoading ? 'Đang xử lý...' : authMode === 'register' ? 'Tạo tài khoản miễn phí' : 'Đăng nhập'}</button>
            </form>
            <p className="auth-switch">{authMode === 'register' ? 'Đã có tài khoản?' : 'Bạn mới với BookSwap?'} <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setError(''); }}>{authMode === 'register' ? 'Đăng nhập' : 'Tạo tài khoản'}</button></p>
          </section>
        </div>
      )}
    </div>
  );
}

function BookCard({ book, index, own = false, onSelect }) {
  const palette = ['cover-terracotta', 'cover-green', 'cover-blue', 'cover-yellow', 'cover-plum'];
  return (
    <button className="book-card book-card-button" type="button" onClick={() => onSelect(book)} aria-label={`Xem chi tiết sách ${book.title}`}>
      {book.imageUrl ? <img className="book-cover-image" src={resolveBookImageUrl(book.imageUrl)} alt={`Ảnh bìa ${book.title}`} /> : (
        <div className={`book-cover ${palette[index % palette.length]}`}>
          <span className="cover-label">{book.type === 'WISHLIST' ? 'ĐANG TÌM' : 'BOOKSWAP EDITION'}</span>
          <strong>{book.title}</strong>
          <span className="cover-author">{book.author || 'Tác giả chưa cập nhật'}</span>
          <span className="cover-decoration" aria-hidden="true">✳</span>
        </div>
      )}
      <div className="book-info">
        <div className="book-title-row"><span className="book-condition">{conditions[book.condition] || book.condition}</span>{own && <span className="credit-value">{book.creditValue} điểm</span>}</div>
        <h3>{book.title}</h3>
        <p className="book-author">{book.author || 'Chưa cập nhật tác giả'}</p>
        <div className="book-card-bottom">
          <span className="book-owner">{own ? (book.type === 'WISHLIST' ? 'Danh sách mong muốn' : 'Tủ sách của bạn') : `Bởi ${book.owner?.name || 'Thành viên BookSwap'}`}</span>
          <span className="book-price">{book.listingMode === 'TRADE' ? 'Trao đổi' : `${currency.format(book.salePrice ?? book.coverPrice ?? 0)}${book.listingMode === 'SALE' ? ` · Còn ${book.stockQuantity ?? 1}` : ''}`}</span>
        </div>
      </div>
    </button>
  );
}

export default App;