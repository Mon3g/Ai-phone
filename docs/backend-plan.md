# Backend Architecture & Operations Plan

## 1. Objectives
- แยกความรับผิดชอบของโค้ดฝั่งเซิร์ฟเวอร์ออกเป็นโมดูลที่ชัดเจน ป้องกันโค้ดกองรวมอยู่ไฟล์เดียว
- กำหนด Workflow สำหรับการพัฒนา/ดีพลอย/ดูแลระบบให้สอดคล้องกันในทีม
- วาง Logic หลักของระบบโทรศัพท์ AI ให้มีลำดับชัดเจน ง่ายต่อการตรวจสอบและขยาย
- สร้างระบบบันทึกและติดตาม Error ที่ช่วยสืบค้นปัญหาได้รวดเร็วทั้งระหว่าง Dev และ Production

## 2. โครงสร้างไดเรกทอรีที่เสนอ
```text
src/
  main.js                 # bootstrap หลักสำหรับ production + graceful shutdown
  config/
    env.js                # รวมค่าจาก environment พร้อม default
  integrations/
    supabase.js           # สร้าง Supabase client ฝั่งเซิร์ฟเวอร์
    openaiRealtime.js     # client สำหรับ OpenAI Realtime API (preview/persona orchestration)
  observability/
    logger.js             # ตั้งค่า Pino transport (stdout + ไฟล์)
  plugins/
    contentParsers.js     # parser พิเศษ (empty JSON)
    loggingHooks.js       # hook onRequest/onResponse/onError + error handler
  routes/
    root.js               # healthcheck และ root message
    incomingCall.js       # Twilio webhook -> TwiML + persona greeting
    mediaStream.js        # Twilio media stream ↔ OpenAI Realtime
    personas.js           # CRUD/Activate/Preview persona + active persona lookup
  server/
    createServer.js       # รวบ Fastify instance + register plugin/routes
  tunneling/
    ngrok.js              # helper สำหรับสร้าง tunnel ระหว่าง development
  utils/
    auth.js               # ตรวจสอบ Bearer token ผ่าน Supabase Admin API
  services/
    personaService.js     # รวม business logic จัดการ persona และเรียก OpenAI preview
```
> โครงสร้างนี้ถูกย้ายจริงในโค้ดแล้ว ทำให้ logic แต่ละส่วนถูกแยกจากกันชัดเจนและพร้อมต่อยอด

## 3. Flow หลักของระบบ
1. **สายเข้า (Twilio Webhook `/incoming-call`)**
   - อ่าน persona ที่ active จาก Supabase
   - สร้าง TwiML ตอบกลับ Twilio เพื่อบอกให้เชื่อมสตรีมไปยัง `/media-stream`
   - บันทึกข้อมูลสำคัญ (voice, greeting) ไว้ใน state ของ session
2. **Media Stream WebSocket**
   - รับ `start`, `media`, `mark` event จาก Twilio แล้วส่งต่อเสียงไป OpenAI Realtime API
   - รับเสียงตอบกลับจาก OpenAI แล้วส่งกลับ Twilio พร้อมจัดการ interrupt/truncate
   - เก็บ context เช่น `streamSid`, `latestMediaTimestamp`, `lastAssistantItem`
3. **Personas API (CRUD + Activate + Preview + Active Persona)**
   - ใช้ `PersonaService` เป็นตัวกลางรวม business rule ทั้งหมดและซ่อนรายละเอียด Supabase/OpenAI
   - ทุก endpoint ที่แก้ไขข้อมูลต้องตรวจสอบ Bearer Token ผ่าน Supabase Admin API
   - Endpoint `preview` เปิด WebSocket ชั่วคราวกับ OpenAI ผ่าน `OpenAiRealtimeClient` เพื่อสร้างไฟล์เสียงตัวอย่างและคืนค่า base64
   - Endpoint `GET /api/personas/active` ช่วยให้ frontend/backend อื่น ๆ ดึง persona ที่กำลังใช้ได้ง่ายสำหรับปรับแต่ง AI

## 4. การแยก Logic และเลเยอร์
- **Route Layer**: รับ request/response, เรียกใช้ service, แปลง error ด้วย `error-mapper`
- **Service Layer**: รวม business rule เช่น จำกัดจำนวน persona ต่อผู้ใช้, ตั้งค่า is_active, เตรียม prompt
- **Integration Layer**: รับผิดชอบเชื่อม API ภายนอก (Supabase, Twilio, OpenAI) โดยจัดการ retry/timeout/logging
- **Utility Layer**: ฟังก์ชันช่วยเหลือที่ใช้ซ้ำ เช่น การคำนวณเวลาตอบสนอง, การจัดรูปแบบ payload

## 5. ระบบบันทึกและตรวจจับ Error
- ใช้ [Pino](https://getpino.io/) เป็น logger กลาง (มีใน `logger.js`)
  - เขียน log ลง `stdout` และไฟล์ `logs/<env>.log`
  - Redact header ที่เป็นความลับเช่น Authorization
- ติดตั้ง Hook ใน Fastify:
  - `onRequest` และ `onResponse` เพื่อเก็บ method, url, status, response time
  - `onError` + `setErrorHandler` สำหรับเปลี่ยน Error เป็น response มาตรฐานและบันทึก stack trace
- จัดการ error ระดับกระบวนการด้วย `process.on('unhandledRejection'| 'uncaughtException')`
- แนะนำให้ส่ง log ไปยังผู้ให้บริการภายนอก (เช่น Logtail, Datadog) โดยเพิ่ม transport เพิ่มเติมใน `logger.js`
- เพิ่ม Metric เบื้องต้น (เช่น success rate, latency) ผ่าน Prometheus exporter หรือ Fastify metrics plugin

## 6. Workflow การพัฒนาและดีพลอย
1. **Local Development**
   - ใช้ `npm run dev` พร้อมตั้ง `.env` สำหรับคีย์ Supabase/OpenAI/Twilio
   - ติดตั้ง ESLint + Prettier + TypeScript (ถ้าต้องการ type) และเขียน unit test สำหรับ service layer
   - ใช้ `ngrok` (หรือ Cloudflare Tunnel) สำหรับ expose webhook ทดสอบกับ Twilio
2. **Testing**
   - Unit test: ครอบคลุม service และ utility โดย mocking integration
   - Integration test: ใช้ Fastify inject ทดสอบ route สำคัญ (health, personas, preview)
   - Contract test กับ Twilio/OpenAI ผ่านชุด mock/stub
3. **Deployment**
   - ใช้ container (Docker) หรือบริการที่รองรับ Node.js พร้อมตั้งค่า environment variables
   - ติดตั้ง process manager (PM2) หรือใช้บริการ serverless/managed (เช่น Fly.io, Render)
   - ตั้ง alert เมื่อพบ error rate สูงหรือไม่สามารถเชื่อมต่อ OpenAI/Twilio
4. **Observability & Incident Response**
   - Dashboard log แยกตาม streamSid / userId เพื่อ trace conversation
   - ตั้ง uptime check เรียก `/health`
   - สร้าง runbook สำหรับเคสทั่วไป (เช่น Supabase down, OpenAI rate-limit, Twilio disconnect)

## 7. Roadmap ปรับปรุงเพิ่มเติม
- **Authentication Middleware**: ออกแบบ Fastify plugin สำหรับตรวจสอบ token และแปลง user context
- **Configuration Layer**: รวม config ทั้งหมดไว้ในไฟล์เดียว (เช่น `server/config/env.js`) และ validate ด้วย `zod`
- **Queue / Job**: รองรับงาน background เช่น บันทึก transcript หรือ analytics หลังจบสาย
- **Feature Flags**: ใช้สำหรับเปิด/ปิดความสามารถใหม่กับกลุ่มผู้ใช้จำกัด
- **Testing Pipeline**: สร้าง GitHub Actions หรือ CI อื่น ๆ เพื่อ lint, test, และ deploy อัตโนมัติ

## 8. Checklist เมื่อต้องเพิ่มฟีเจอร์ใหม่
1. กำหนด requirement และ flow diagram สั้น ๆ
2. สร้าง service ใหม่หรือขยาย service เดิม โดยแยกจาก route
3. เขียน unit test + integration test
4. เพิ่ม log ที่จำเป็น (ระดับ info/error) และตรวจสอบว่าไม่มีข้อมูลสำคัญรั่วไหล
5. อัปเดตเอกสาร (README หรือ docs) ให้ทีมเข้าใจการใช้งาน/ตั้งค่าฟีเจอร์

เอกสารฉบับนี้เป็น baseline สำหรับการจัดระเบียบโปรเจ็กต์ Node.js/Fastify ให้รองรับการขยายระบบในระยะยาว พร้อมระบบบันทึก Error ที่สามารถตรวจสอบย้อนหลังได้ง่าย
