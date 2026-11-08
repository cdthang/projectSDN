import React, { useState } from 'react';
import { fetchTradeLoops } from '../services/api';

const TradeLoopView = () => {
  const [loops, setLoops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFindLoops = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTradeLoops();
      setLoops(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tìm vòng đổi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ĐỔI SÁCH THÔNG MINH</p>
          <h2>Vòng đổi phù hợp với bạn</h2>
          <p className="muted">Khi sách bạn muốn nằm trong tủ của cộng đồng, BookSwap sẽ tìm đường trao đổi khép kín.</p>
        </div>
        <button className="button button-primary" onClick={handleFindLoops} disabled={loading}>
          {loading ? 'Đang tìm...' : 'Tìm vòng đổi'}
        </button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {!loading && !error && loops.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">↻</span>
          <h3>Chưa có vòng đổi nào</h3>
          <p>Thêm sách vào danh sách mong muốn và quay lại tìm kiếm khi cộng đồng có sách phù hợp.</p>
        </div>
      )}
      <div className="loop-grid">
        {loops.map((loop, index) => {
          const received = loop.participants?.[0];
          return (
            <article className="loop-card" key={`${index}-${received?.book?._id}`}>
              <div className="loop-card-top">
                <span className="status-pill">Có thể trao đổi</span>
                <span className="muted">Vòng #{index + 1}</span>
              </div>
              <h3>{received?.book?.title || 'Sách phù hợp'}</h3>
              <p className="muted">Tác giả: {received?.book?.author || 'Chưa cập nhật'}</p>
              <div className="loop-path">
                {loop.participants?.map((participant, participantIndex) => (
                  <div className="loop-step" key={participant.book._id}>
                    <span className="loop-number">{participantIndex + 1}</span>
                    <span><strong>{participant.owner?.name || 'Thành viên'}</strong> trao <em>{participant.book.title}</em></span>
                  </div>
                ))}
              </div>
              <p className="small muted">BookSwap đã tìm thấy chu trình trao đổi khép kín {loop.participants?.length || 0} thành viên.</p>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default TradeLoopView;