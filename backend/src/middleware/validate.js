'use strict';

const { badRequest } = require('../utils/httpError');

/**
 * ตรวจ input ด้วย zod schema ก่อนเข้า handler
 *
 * ทุก Use Case ใน spec มี Alternate Flow "ข้อมูลไม่ครบถ้วน/ไม่ถูกต้อง"
 * middleware นี้คือจุดเดียวที่ทำให้กิ่งนั้นเกิดขึ้นจริง และตอบเป็นรูปแบบเดียวกันหมด
 *
 * @param {{body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny}} schemas
 */
function validate(schemas) {
  return (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          field: i.path.join('.') || part,
          message: i.message,
        }));
        return next(badRequest('กรุณากรอกข้อมูลให้ถูกต้องและครบถ้วน', details));
      }
      // เขียนค่าที่ผ่าน coerce/default แล้วกลับเข้าไป (query string เป็น string เสมอ)
      req[part] = result.data;
    }
    return next();
  };
}

module.exports = validate;
