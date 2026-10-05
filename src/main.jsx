import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Lỗi khi hiển thị ứng dụng:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <main className="wrap" role="alert" aria-live="assertive">
        <section className="card">
          <h1>Ứng dụng gặp sự cố</h1>
          <p>Đã xảy ra lỗi khi hiển thị trang. Hãy thử tải lại ứng dụng.</p>
          <button className="p" onClick={() => window.location.reload()}>Tải lại trang</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Không tìm thấy phần tử #root để khởi chạy ứng dụng.');

createRoot(rootElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
