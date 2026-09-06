import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ระหว่างพัฒนา ยิงผ่าน nginx ที่ทำหน้าที่แทน ALB (พอร์ต 8080)
    // เพื่อให้เห็นการสลับเครื่องเหมือนของจริงตั้งแต่บนเครื่องตัวเอง
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/health': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // recharts ใหญ่กว่าโค้ดแอปทั้งก้อน แต่ใช้เฉพาะ 2 หน้าของผู้ดูแลระบบ
        // แยกออกมาเพื่อให้หน้าที่ลูกค้าใช้จริง (ค้นหา จอง) โหลดเร็วขึ้น
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
