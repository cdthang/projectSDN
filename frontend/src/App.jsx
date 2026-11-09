import React from 'react';
import AdminApp from './roles/admin/screens/AdminApp.jsx';
import CourierApp from './roles/courier/screens/CourierApp.jsx';
import BookDetailsPage from './roles/user/screens/BookDetailsPage.jsx';
import OrderSuccessPage from './roles/user/screens/OrderSuccessPage.jsx';
import UserApp from './roles/user/screens/UserApp.jsx';

function App() {
  const { pathname } = window.location;

  if (pathname.startsWith('/admin')) return <AdminApp />;
  if (pathname.startsWith('/courier')) return <CourierApp />;
  if (pathname.startsWith('/orders/success/')) return <OrderSuccessPage />;
  if (pathname.startsWith('/books/')) return <BookDetailsPage />;
  return <UserApp />;
}

export default App;
