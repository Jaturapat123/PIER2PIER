/**
 * Design token ของ Pier2Pier — "Port Operations Console"
 *
 * สีมาจากวัสดุจริงในท่าเรือ: navy ของน้ำลึกและแผงควบคุม, steel ของตัวตู้,
 * และ hi-vis amber ของเสื้อกั๊กนิรภัย/เครน ไม่ได้หยิบจานสี dashboard สำเร็จรูปมาใช้
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0C1A26', // navy ท่าเรือ — โครงคอนโซล
        hull: '#16293A', // แผงในคอนโซล
        deck: '#1F394E', // เส้นคั่น/พื้นที่ hover ในคอนโซล
        steel: {
          50: '#F5F7F9',
          100: '#E7ECF0', // พื้นหลังพื้นที่ทำงาน
          200: '#D3DBE3',
          300: '#B0BDC9',
          400: '#7E8FA0',
          500: '#5A6C7D',
          600: '#42525F',
          700: '#2E3B47',
        },
        hivis: '#D97706', // amber นิรภัย — ปรับให้ผ่าน WCAG 3:1 บนพื้นสว่าง
        sea: '#0E7490', // teal — ลิงก์และสถานะยืนยันแล้ว
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // สเกลตัวอักษรคงที่ ใช้ทั้งระบบ ไม่หยิบขนาดสุ่ม
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        // ระดับความสูงมีแค่ 2 ระดับ: การ์ดในพื้นที่ทำงาน กับของที่ลอยอยู่ (modal)
        panel: '0 1px 2px rgba(12, 26, 38, 0.06), 0 0 0 1px rgba(12, 26, 38, 0.06)',
        float: '0 12px 32px rgba(12, 26, 38, 0.18)',
      },
    },
  },
  plugins: [],
};
