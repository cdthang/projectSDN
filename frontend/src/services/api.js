import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:9999/api',
});
const apiBaseUrl = API.defaults.baseURL.replace(/\/$/, '');
export const socketServerUrl = apiBaseUrl.replace(/\/api$/, '');

API.interceptors.request.use((config) => {
  const tokenKey = window.location.pathname.startsWith('/admin')
    ? 'bookswap-admin-token'
    : window.location.pathname.startsWith('/courier')
      ? 'bookswap-courier-token'
      : 'bookswap-token';
  const token = localStorage.getItem(tokenKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const register = (details) => API.post('/auth/register', details);
export const login = (credentials) => API.post('/auth/login', credentials);
export const adminLogin = (credentials) => API.post('/auth/admin/login', credentials);
export const courierLogin = (credentials) => API.post('/auth/courier/login', credentials);
export const getMe = () => API.get('/auth/me');
export const fetchBooks = (search = '', listingMode = '') => API.get('/books', { params: { search, listingMode } });
export const fetchBook = (bookId) => API.get(`/books/${bookId}`);
export const resolveBookImageUrl = (imageUrl) => imageUrl
  ? new URL(imageUrl.replace(/^\/api\/?/, ''), `${apiBaseUrl}/`).toString()
  : '';
export const fetchUserBooks = (userId) => API.get(`/books/user/${userId}`);
export const analyzeBookImage = (image, details) => {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('title', details.title);
  formData.append('author', details.author);
  formData.append('coverPrice', details.coverPrice);
  formData.append('photoConsent', 'true');
  return API.post('/books/analyze', formData);
};
export const addBook = (book) => API.post('/books', book);
export const createBookOrder = (bookId, details) => API.post(`/books/${bookId}/orders`, details);
export const fetchMyOrders = () => API.get('/books/orders/mine');
export const fetchMyOrder = (orderId) => API.get(`/books/orders/${orderId}`);
export const deleteBook = (bookId) => API.delete(`/books/${bookId}`);
export const fetchTradeLoops = () => API.get('/trades/find-loops');
export const fetchAdminDashboard = () => API.get('/admin/dashboard');
export const fetchAdminUsers = () => API.get('/admin/users');
export const fetchAdminCouriers = () => API.get('/admin/couriers');
export const createAdminCourier = (courier) => API.post('/admin/couriers', courier);
export const fetchAdminBooks = (params = {}) => API.get('/admin/books', { params });
export const fetchAdminTransactions = () => API.get('/admin/transactions');
export const fetchAdminDeliveries = () => API.get('/admin/deliveries');
export const collectAdminDeliveryFee = (deliveryId) => API.post(`/admin/deliveries/${deliveryId}/collect-fee`);
export const fetchAdminDeliveryProof = (deliveryId) => API.get(`/admin/deliveries/${deliveryId}/proof`, { responseType: 'blob' });
export const fetchCourierDeliveries = () => API.get('/courier/deliveries');
export const claimCourierDelivery = (deliveryId) => API.post(`/courier/deliveries/${deliveryId}/claim`);
export const startCourierDelivery = (deliveryId) => API.post(`/courier/deliveries/${deliveryId}/start`);
export const uploadCourierProof = (deliveryId, proof, codCollected = false) => {
  const formData = new FormData();
  formData.append('proof', proof);
  formData.append('codCollected', String(codCollected));
  return API.post(`/courier/deliveries/${deliveryId}/proof`, formData);
};
export const fetchCourierDeliveryProof = (deliveryId) => API.get(`/courier/deliveries/${deliveryId}/proof`, { responseType: 'blob' });
export const fetchChatContacts = () => API.get('/chat/contacts');
export const fetchChatConversations = () => API.get('/chat/conversations');
export const openChatConversation = (recipientId) => API.post('/chat/conversations', { recipientId });
export const fetchChatMessages = (conversationId) => API.get(`/chat/conversations/${conversationId}/messages`);
export const sendChatMessage = (conversationId, text) => API.post(`/chat/conversations/${conversationId}/messages`, { text });
export const setAdminCourierStatus = (courierId, isActive) => API.patch(`/admin/couriers/${courierId}/status`, { isActive });
