const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetSimulate = `  app.post("/api/dev/simulate-payment", requireAuth, async (req: AuthRequest, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }
     try {
       const { orderId, provider } = req.body;
       const { isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');`;

const replaceSimulate = `  app.post("/api/dev/simulate-payment", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }
     try {
       const { orderId, provider } = req.body;
       const { isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');
       
       const user = await getUserByUid(req.user!.uid);
       if (!user || user.role !== 'ADMIN') {
          return res.status(403).json({ error: "Unauthorized. Only admins can simulate payments." });
       }`;

if (code.includes(targetSimulate)) {
  code = code.replace(targetSimulate, replaceSimulate);
  fs.writeFileSync('server.ts', code);
  console.log("server.ts patched");
} else {
  console.log("server.ts target not found");
}
