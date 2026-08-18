const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetDev = `  // --- DEVELOPMENT ADAPTER (SIMULATION) ---
  // This explicitly replaces the old fake behavior with a dev-only tool that hits the real webhook
  app.post("/api/dev/simulate-payment", async (req, res) => {
     try {
       const { orderId, provider } = req.body;
       // Simulate webhook payload
       await fetch(\`http://localhost:3000/api/webhooks/payment/\${provider}\`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           orderId,
           providerReference: 'DEV_SIM_' + Math.floor(Math.random() * 100000),
           status: 'SUCCESS'
         })
       });
       res.json({ success: true, message: "Simulation triggered webhook" });
     } catch (e) {
       res.status(500).json({ error: "Simulation failed" });
     }
  });`;

const replacementDev = `  // --- DEVELOPMENT ADAPTER (SIMULATION) ---
  // This explicitly replaces the old fake behavior with a dev-only tool.
  // Because the production webhook securely rejects unconfigured providers,
  // the simulator bypasses the webhook and updates the DB directly.
  app.post("/api/dev/simulate-payment", async (req, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }
     try {
       const { orderId, provider } = req.body;
       const { isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');
       
       if (!isValidProvider(provider)) {
         return res.status(400).json({ error: "Invalid provider" });
       }
       
       const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
       const order = orderRes[0];
       
       if (!order) return res.status(404).json({ error: "Order not found" });
       
       // Force SUCCESS state transition bypassing standard provider webhook
       if (!isValidPaymentTransition(order.paymentState as any, 'SUCCESS')) {
          return res.status(400).json({ error: "Invalid payment state transition" });
       }

       const pendingPayments = await db.select().from(payments)
         .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider)))
         .orderBy(desc(payments.createdAt));
         
       if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          await db.update(payments)
            .set({ 
              status: 'SUCCESS', 
              providerReference: 'DEV_SIM_' + Math.floor(Math.random() * 100000)
            })
            .where(eq(payments.id, payment.id));
       } else {
          await db.insert(payments).values({
             orderId: order.id,
             provider,
             amount: order.totalAmount,
             status: 'SUCCESS',
             providerReference: 'DEV_SIM_' + Math.floor(Math.random() * 100000)
          });
       }

       await db.update(orders)
         .set({ paymentState: 'SUCCESS', updatedAt: new Date() })
         .where(eq(orders.id, order.id));
         
       res.json({ success: true, message: "Simulation successful" });
     } catch (e) {
       console.error("Simulation failed:", e);
       res.status(500).json({ error: "Simulation failed" });
     }
  });`;

if (code.includes(targetDev)) {
    code = code.replace(targetDev, replacementDev);
    fs.writeFileSync('server.ts', code);
    console.log("Dev updated");
} else {
    console.log("Dev target not found");
}
