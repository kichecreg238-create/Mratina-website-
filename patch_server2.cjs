const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Update imports
if (!code.includes('isValidProvider')) {
  code = code.replace(
    'import { paymentService } from "./src/services/payment.ts";',
    'import { paymentService, isValidProvider } from "./src/services/payment.ts";'
  );
}

// Update /api/payments/initiate
const targetInitiate = `  app.post("/api/payments/initiate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, provider, phoneNumber } = req.body;
      const user = await getUserByUid(req.user!.uid);
      
      const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));`;

const replaceInitiate = `  app.post("/api/payments/initiate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, provider, phoneNumber } = req.body;
      
      if (!isValidProvider(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }
      
      const user = await getUserByUid(req.user!.uid);
      
      const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));`;

if (code.includes(targetInitiate)) {
  code = code.replace(targetInitiate, replaceInitiate);
}

// Update provider cast in initiate
const targetInitiateCall = `      const result = await paymentService.initiate({
        orderId: order.id,
        amount: Number(order.totalAmount),
        phoneNumber: phoneNumber,
        provider: provider as any
      });`;

const replaceInitiateCall = `      const result = await paymentService.initiate({
        orderId: order.id,
        amount: Number(order.totalAmount),
        phoneNumber: phoneNumber,
        provider: provider
      });`;

if (code.includes(targetInitiateCall)) {
  code = code.replace(targetInitiateCall, replaceInitiateCall);
}

// Update /api/dev/simulate-payment
const targetSimulate = `  app.post("/api/dev/simulate-payment", async (req, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }`;

const replaceSimulate = `  app.post("/api/dev/simulate-payment", requireAuth, async (req: AuthRequest, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }`;

if (code.includes(targetSimulate)) {
  code = code.replace(targetSimulate, replaceSimulate);
}

fs.writeFileSync('server.ts', code);
console.log("server.ts patched");
