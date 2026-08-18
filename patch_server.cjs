const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWebhook = `  // --- WEBHOOK / CALLBACK BOUNDARY ---
  app.post("/api/webhooks/payment/:provider", async (req, res) => {
    try {
       const { provider } = req.params;
       // SECURITY BOUNDARY: Provider signature verification MUST happen here.
       // e.g. verifyProviderSignature(req.headers, req.body)
       // Since the actual provider is UNCONFIGURED in this module, we bypass signature check
       // ONLY for the development simulation. In production, this would reject unsigned payloads.

       // For the boundary, we extract what a typical payload gives:
       const { orderId, providerReference, status } = req.body; 

       if (!orderId || !status) {
         return res.status(400).json({ error: "Invalid webhook payload" });
       }
       
       const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
       const order = orderRes[0];
       
       if (!order) {
         return res.status(404).json({ error: "Order not found" });
       }
       
       // Idempotency: if already SUCCESS, acknowledge and do nothing
       if (order.paymentState === 'SUCCESS') {
          return res.json({ received: true, note: "Already processed" });
       }
       
       // Update the most recent pending payment attempt
       const pendingPayments = await db.select().from(payments)
         .where(and(eq(payments.orderId, orderId), eq(payments.provider, provider)))
         .orderBy(desc(payments.createdAt));
         
       if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          await db.update(payments)
            .set({ 
              status: status, 
              providerReference: providerReference || payment.providerReference 
            })
            .where(eq(payments.id, payment.id));
       } else {
          // If no pending record (e.g. manual offline payment), record it
          await db.insert(payments).values({
             orderId,
             provider,
             amount: order.totalAmount,
             status,
             providerReference
          });
       }

       // Update authoritative order state
       await db.update(orders)
         .set({ paymentState: status, updatedAt: new Date() })
         .where(eq(orders.id, orderId));
         
       res.json({ received: true });
    } catch (error) {
       console.error("Webhook error:", error);
       res.status(500).json({ error: "Webhook processing failed" });
    }
  });`;

const replacementWebhook = `  // --- WEBHOOK / CALLBACK BOUNDARY ---
  app.post("/api/webhooks/payment/:provider", async (req, res) => {
    try {
       const { provider } = req.params;
       const { paymentService, isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');
       
       if (!isValidProvider(provider)) {
         return res.status(400).json({ error: "Invalid provider" });
       }

       // SECURITY BOUNDARY: Provider signature verification MUST happen here.
       // We DO NOT trust req.body.status directly from the client.
       const verification = await paymentService.verifyWebhook(provider, req.body, req.headers);
       
       if (!verification.isConfigured) {
          return res.status(501).json({ error: "Provider unconfigured. Cannot process real webhooks." });
       }
       
       if (!verification.success || !verification.orderId || !verification.status) {
          return res.status(400).json({ error: verification.error || "Invalid webhook payload or signature" });
       }
       
       const orderRes = await db.select().from(orders).where(eq(orders.id, verification.orderId));
       const order = orderRes[0];
       
       if (!order) {
         return res.status(404).json({ error: "Order not found" });
       }
       
       // Idempotency: if already in the target state, acknowledge and do nothing
       if (order.paymentState === verification.status) {
          return res.json({ received: true, note: "Already processed" });
       }
       
       // Enforce Payment State Machine
       if (!isValidPaymentTransition(order.paymentState as any, verification.status)) {
          return res.status(400).json({ error: "Invalid payment state transition" });
       }
       
       // Update the most recent pending payment attempt
       const pendingPayments = await db.select().from(payments)
         .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider)))
         .orderBy(desc(payments.createdAt));
         
       if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          await db.update(payments)
            .set({ 
              status: verification.status, 
              providerReference: verification.providerReference || payment.providerReference 
            })
            .where(eq(payments.id, payment.id));
       } else {
          // If no pending record (e.g. manual offline payment), record it
          await db.insert(payments).values({
             orderId: order.id,
             provider,
             amount: order.totalAmount,
             status: verification.status,
             providerReference: verification.providerReference
          });
       }

       // Update authoritative order state
       await db.update(orders)
         .set({ paymentState: verification.status, updatedAt: new Date() })
         .where(eq(orders.id, order.id));
         
       res.json({ received: true });
    } catch (error) {
       console.error("Webhook error:", error);
       res.status(500).json({ error: "Webhook processing failed" });
    }
  });`;

if (code.includes(targetWebhook)) {
    code = code.replace(targetWebhook, replacementWebhook);
    fs.writeFileSync('server.ts', code);
    console.log("Webhook updated");
} else {
    console.log("Webhook target not found");
}
