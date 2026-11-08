import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './AdminApp.jsx';
import CourierApp from './CourierApp.jsx';
import BookDetailsPage from './BookDetailsPage.jsx';
import OrderSuccessPage from './OrderSuccessPage.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.location.pathname.startsWith('/admin')
      ? <AdminApp />
      : window.location.pathname.startsWith('/courier')
        ? <CourierApp />
        : window.location.pathname.startsWith('/orders/success/')
          ? <OrderSuccessPage />
        : window.location.pathname.startsWith('/books/')
          ? <BookDetailsPage />
          : <App />}
  </React.StrictMode>
);